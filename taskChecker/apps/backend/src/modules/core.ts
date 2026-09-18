/** Core module (part 1): teams + projects. Every path runs in a tenant tx with
 * RLS; write roles enforced; soft-deletable; activity + audit recorded. */
import { Hono } from "hono";
import { and, count, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { inTenant } from "../lib/request.js";
import type { Tx } from "../lib/tenant.js";
import { badRequest, forbidden, notFound, quotaExceeded } from "../lib/errors.js";
import { uuidv7 } from "../lib/ids.js";
import { requireRole, Rbac } from "../lib/rbac.js";
import { audit } from "../lib/audit.js";
import { teams, projects, projectListLabels } from "../db/schema.js";
import { emitEvent } from "../lib/events.js";
import { cacheKey, invalidate, N } from "../lib/cache.js";
import { tierLimits } from "../lib/usage.js";

export const coreRoutes = new Hono();

// GET /v1/orgs/{orgId}/teams
coreRoutes.get("/orgs/:orgId/teams", async (c) => {
  const p = c.get("principal");
  if (c.req.param("orgId") !== p.tenantId) throw forbidden("Organization mismatch.");
  return inTenant(c, async (tx) => {
    const rows = await tx
      .select()
      .from(teams)
      .where(and(eq(teams.tenantId, p.tenantId), isNull(teams.deletedAt)))
      .orderBy(teams.createdAt);
    return c.json({ teams: rows });
  });
});

// POST /v1/teams { name } — member+
coreRoutes.post("/teams", async (c) => {
  const p = c.get("principal");
  const parsed = z.object({ name: z.string().min(1).max(80) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest("name is required.");
  return inTenant(c, async (tx) => {
    requireRole(p.role, Rbac.write);
    const id = uuidv7();
    await tx.insert(teams).values({ tenantId: p.tenantId, id, name: parsed.data.name });
    await audit(tx, { tenantId: p.tenantId, actorId: p.userId, action: "team.created", entityType: "team", entityId: id, after: { name: parsed.data.name } });
    return c.json({ team: { tenantId: p.tenantId, id, name: parsed.data.name } }, 201);
  });
});

// GET /v1/orgs/{orgId}/projects
coreRoutes.get("/orgs/:orgId/projects", async (c) => {
  const p = c.get("principal");
  if (c.req.param("orgId") !== p.tenantId) throw forbidden("Organization mismatch.");
  const key = cacheKey("boards", N.tenant, p.tenantId, "projects");
  return inTenant(c, async (tx) => {
    const rows = await tx
      .select()
      .from(projects)
      .where(and(eq(projects.tenantId, p.tenantId), isNull(projects.deletedAt)))
      .orderBy(projects.createdAt);
    void key; // cache-aside wired in the board endpoint (see tasks.ts)
    return c.json({ projects: rows });
  });
});

// POST /v1/projects { teamId?, name, key } — member+
coreRoutes.post("/projects", async (c) => {
  const p = c.get("principal");
  const parsed = z
    .object({ teamId: z.string().uuid().optional(), name: z.string().min(1).max(100), key: z.string().min(1).max(10) })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest("teamId?, name and key are required.");
  return inTenant(c, async (tx) => {
    requireRole(p.role, Rbac.write);
    // Usage limit: active-project cap per subscription tier.
    const tenant = await tx.query.tenants.findFirst({ where: (t, { eq: e }) => e(t.id, p.tenantId) });
    const plan = tenant?.plan ?? "free";
    const limits = tierLimits(plan);
    const countRows = await tx
      .select({ n: count() })
      .from(projects)
      .where(and(eq(projects.tenantId, p.tenantId), isNull(projects.deletedAt)));
    const activeCount = countRows[0]?.n ?? 0;
    if (activeCount >= limits.activeProjects) {
      throw quotaExceeded(`Active-project limit (${limits.activeProjects}) reached for the ${plan} plan. Upgrade to add more.`);
    }
    const id = uuidv7();
    await tx.insert(projects).values({
      tenantId: p.tenantId,
      id,
      teamId: parsed.data.teamId ?? null,
      name: parsed.data.name,
      key: parsed.data.key.toUpperCase(),
    });
    await audit(tx, { tenantId: p.tenantId, actorId: p.userId, action: "project.created", entityType: "project", entityId: id, after: { name: parsed.data.name, key: parsed.data.key } });
    await invalidate(cacheKey("boards", N.tenant, p.tenantId, "projects"));
    return c.json({ project: { tenantId: p.tenantId, id, teamId: parsed.data.teamId ?? null, name: parsed.data.name, key: parsed.data.key.toUpperCase() } }, 201);
  });
});

// PATCH /v1/teams/{id} { name } — member+
coreRoutes.patch("/teams/:id", async (c) => {
  const p = c.get("principal");
  const id = c.req.param("id");
  const parsed = z.object({ name: z.string().min(1).max(80) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest("name is required.");
  return inTenant(c, async (tx) => {
    requireRole(p.role, Rbac.write);
    const before = await tx.query.teams.findFirst({
      where: (t, { and: a, eq: e, isNull: n }) => a(e(t.tenantId, p.tenantId), e(t.id, id), n(t.deletedAt)),
    });
    if (!before) throw notFound("Team not found.");
    await tx.update(teams).set({ name: parsed.data.name }).where(and(eq(teams.tenantId, p.tenantId), eq(teams.id, id)));
    await audit(tx, {
      tenantId: p.tenantId, actorId: p.userId, action: "team.updated",
      entityType: "team", entityId: id, before: { name: before.name }, after: { name: parsed.data.name },
    });
    return c.json({ team: { tenantId: p.tenantId, id, name: parsed.data.name } });
  });
});

// DELETE /v1/teams/{id} — soft delete (deleted_at), member+
coreRoutes.delete("/teams/:id", async (c) => {
  const p = c.get("principal");
  const id = c.req.param("id");
  return inTenant(c, async (tx) => {
    requireRole(p.role, Rbac.write);
    const before = await tx.query.teams.findFirst({
      where: (t, { and: a, eq: e }) => a(e(t.tenantId, p.tenantId), e(t.id, id)),
    });
    if (!before) throw notFound("Team not found.");
    await tx.update(teams).set({ deletedAt: new Date() }).where(and(eq(teams.tenantId, p.tenantId), eq(teams.id, id)));
    await audit(tx, { tenantId: p.tenantId, actorId: p.userId, action: "team.deleted", entityType: "team", entityId: id, before: { name: before.name } });
    return c.json({ ok: true });
  });
});

// PATCH /v1/projects/{id} { name?, key?, teamId? } — member+
coreRoutes.patch("/projects/:id", async (c) => {
  const p = c.get("principal");
  const id = c.req.param("id");
  const parsed = z
    .object({ name: z.string().min(1).max(100).optional(), key: z.string().min(1).max(10).optional(), teamId: z.string().uuid().nullable().optional() })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest("name?, key? and teamId? are required.");
  return inTenant(c, async (tx) => {
    requireRole(p.role, Rbac.write);
    const before = await tx.query.projects.findFirst({
      where: (pr, { and: a, eq: e, isNull: n }) => a(e(pr.tenantId, p.tenantId), e(pr.id, id), n(pr.deletedAt)),
    });
    if (!before) throw notFound("Project not found.");
    const patch: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) patch.name = parsed.data.name;
    if (parsed.data.key !== undefined) patch.key = parsed.data.key.toUpperCase();
    if (parsed.data.teamId !== undefined) patch.teamId = parsed.data.teamId;
    if (Object.keys(patch).length > 0) {
      await tx.update(projects).set(patch).where(and(eq(projects.tenantId, p.tenantId), eq(projects.id, id)));
    }
    await audit(tx, {
      tenantId: p.tenantId, actorId: p.userId, action: "project.updated",
      entityType: "project", entityId: id, before: { name: before.name, key: before.key }, after: { ...patch },
    });
    await invalidate(cacheKey("boards", N.tenant, p.tenantId, "projects"));
    return c.json({ ok: true });
  });
});

// DELETE /v1/projects/{id} — soft delete (deleted_at), member+. Blocks nothing:
// tasks/comments keep their rows; scoped reads exclude deleted projects & tasks.
coreRoutes.delete("/projects/:id", async (c) => {
  const p = c.get("principal");
  const id = c.req.param("id");
  return inTenant(c, async (tx) => {
    requireRole(p.role, Rbac.write);
    const before = await tx.query.projects.findFirst({
      where: (pr, { and: a, eq: e }) => a(e(pr.tenantId, p.tenantId), e(pr.id, id)),
    });
    if (!before) throw notFound("Project not found.");
    await tx.update(projects).set({ deletedAt: new Date() }).where(and(eq(projects.tenantId, p.tenantId), eq(projects.id, id)));
    await audit(tx, { tenantId: p.tenantId, actorId: p.userId, action: "project.deleted", entityType: "project", entityId: id, before: { name: before.name, key: before.key } });
    await invalidate(cacheKey("boards", N.tenant, p.tenantId, "projects"));
    return c.json({ ok: true });
  });
});

// GET /v1/projects/{id}/lists — custom board list labels. Absent statuses
// fall back to built-in defaults ("Backlog", "To do", "In progress", "Done").
coreRoutes.get("/projects/:id/lists", async (c) => {
  const p = c.get("principal");
  const id = c.req.param("id");
  return inTenant(c, async (tx) => {
    const project = await tx.query.projects.findFirst({
      where: (pr, { and: a, eq: e, isNull: n }) => a(e(pr.tenantId, p.tenantId), e(pr.id, id), n(pr.deletedAt)),
    });
    if (!project) throw notFound("Project not found.");
    const rows = await tx
      .select({ status: projectListLabels.status, label: projectListLabels.label })
      .from(projectListLabels)
      .where(and(eq(projectListLabels.tenantId, p.tenantId), eq(projectListLabels.projectId, id)));
    return c.json({ lists: rows });
  });
});

// PUT /v1/projects/{id}/lists { status, label } — rename one board list, member+.
// Cosmetic only: task placement still uses the status enum underneath.
coreRoutes.put("/projects/:id/lists", async (c) => {
  const p = c.get("principal");
  const id = c.req.param("id");
  const parsed = z
    .object({ status: z.enum(["backlog", "todo", "in_progress", "done"]), label: z.string().trim().min(1).max(50) })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest("status and label (1-50 chars) are required.");
  return inTenant(c, async (tx) => {
    requireRole(p.role, Rbac.write);
    const project = await tx.query.projects.findFirst({
      where: (pr, { and: a, eq: e, isNull: n }) => a(e(pr.tenantId, p.tenantId), e(pr.id, id), n(pr.deletedAt)),
    });
    if (!project) throw notFound("Project not found.");
    const { status, label } = parsed.data;
    const before = await tx.query.projectListLabels.findFirst({
      where: (l, { and: a, eq: e }) => a(e(l.tenantId, p.tenantId), e(l.projectId, id), e(l.status, status)),
    });
    await tx
      .insert(projectListLabels)
      .values({ tenantId: p.tenantId, projectId: id, status, label })
      .onConflictDoUpdate({
        target: [projectListLabels.tenantId, projectListLabels.projectId, projectListLabels.status],
        set: { label, updatedAt: new Date() },
      });
    await audit(tx, {
      tenantId: p.tenantId, actorId: p.userId, action: "project.list_renamed",
      entityType: "project", entityId: id,
      before: before ? { status, label: before.label } : { status, label: null },
      after: { status, label },
    });
    return c.json({ list: { status, label } });
  });
});

// GET /v1/tasks/:id — tenant-scoped single task.
export async function loadTask(tx: Tx, tenantId: string, taskId: string) {
  const row = await tx.query.tasks.findFirst({
    where: (t, { and: a, eq: e, isNull: n }) => a(e(t.tenantId, tenantId), e(t.id, taskId), n(t.deletedAt)),
  });
  return row ?? null;
}