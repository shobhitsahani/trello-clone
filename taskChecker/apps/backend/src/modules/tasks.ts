/** Core module (part 2): tasks — the hot object. Create honors Idempotency-Key;
 * board reads are cache-aside with invalidation on write; mutations audit
 * before/after in-tx and emit domain events (notifications/webhooks derive). */
import { Hono } from "hono";
import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { z } from "zod";
import { inTenant } from "../lib/request.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { uuidv7 } from "../lib/ids.js";
import { requireRole, Rbac } from "../lib/rbac.js";
import { audit } from "../lib/audit.js";
import { activityEvents, tasks } from "../db/schema.js";
import { emitEvent } from "../lib/events.js";
import { cacheKey, getOrSet, invalidatePrefix, N } from "../lib/cache.js";
import { withIdempotency } from "../lib/idempotency.js";
import { enqueue } from "../lib/queue.js";
import { decodeCursor, encodeCursor, parseLimit } from "../lib/cursor.js";

export const taskRoutes = new Hono();

const STATUSES = ["backlog", "todo", "in_progress", "done"] as const;
const PRIORITIES = ["critical", "high", "medium", "low", "none"] as const;

function taskRecord(t: typeof tasks.$inferSelect) {
  return {
    id: t.id, tenantId: t.tenantId, projectId: t.projectId,
    title: t.title, description: t.description, status: t.status,
    priority: t.priority, assigneeId: t.assigneeId, reporterId: t.reporterId,
    dueAt: t.dueAt, createdAt: t.createdAt, updatedAt: t.updatedAt,
  };
}

// GET /v1/orgs/{orgId}/projects/{projectId}/tasks — cache-aside board read.
taskRoutes.get("/orgs/:orgId/projects/:projectId/tasks", async (c) => {
  const p = c.get("principal");
  const projectId = c.req.param("projectId");
  if (c.req.param("orgId") !== p.tenantId) throw forbidden("Organization mismatch.");
  const status = c.req.query("status") as (typeof STATUSES)[number] | undefined;
  const limit = parseLimit(c.req.query("limit"), 50, 25);
  const cursor = c.req.query("cursor") ? decodeCursor(c.req.query("cursor")!) : null;
  // The page identity is part of the cache key — cursor+limit — so page 2 can
  // never be served the cached payload of page 1 (a stale-key leak).
  const boardKey = cacheKey("boards", N.tenant, p.tenantId, projectId, status ?? "all", cursor?.id ?? "first", `${limit}`);

  const { value, fromCache } = await getOrSet(boardKey, 30, async () =>
    inTenant(c, async (tx) => {
      const where = [eq(tasks.tenantId, p.tenantId), eq(tasks.projectId, projectId)];
      if (status && (STATUSES as readonly string[]).includes(status)) where.push(eq(tasks.status, status));
      if (cursor) where.push(lt(tasks.createdAt, new Date(cursor.createdAt)));
      const rows = await tx.select().from(tasks)
        .where(and(...where, isNull(tasks.deletedAt)))
        .orderBy(desc(tasks.createdAt))
        .limit(limit + 1);
      const page = rows.slice(0, limit);
      const last = page[page.length - 1];
      return {
        data: page.map(taskRecord),
        nextCursor: page.length === limit && last ? encodeCursor(last.createdAt!, last.id) : null,
        hasMore: rows.length > limit,
      };
    }),
  );
  return c.json({ ...value, stale: fromCache, source: fromCache ? "cache" : "postgres" });
});

// GET /v1/tasks/{id}
taskRoutes.get("/tasks/:id", async (c) => {
  const p = c.get("principal");
  const taskId = c.req.param("id");
  return inTenant(c, async (tx) => {
    const task = await tx.query.tasks.findFirst({
      where: (t, { and: a, eq: e, isNull: n }) => a(e(t.tenantId, p.tenantId), e(t.id, taskId), n(t.deletedAt)),
    });
    if (!task) throw notFound("Task not found.");
    return c.json({ task: taskRecord(task) });
  });
});

// POST /v1/tasks — Idempotency-Key honored. member+
taskRoutes.post("/tasks", async (c) => {
  const p = c.get("principal");
  const idemKey = c.req.header("idempotency-key");
  const parsed = z
    .object({
      projectId: z.string().uuid(),
      title: z.string().min(1).max(200),
      description: z.string().max(100_000).optional(),
      status: z.enum(STATUSES).optional(),
      priority: z.enum(PRIORITIES).optional(),
      assigneeId: z.string().uuid().optional(),
      dueAt: z.string().datetime().optional(),
    })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest("Validation failed: " + (parsed.error.issues[0]?.message ?? "Invalid payload"));

  return inTenant(c, async (tx) => {
    requireRole(p.role, Rbac.write);
    const { data, replay } = await withIdempotency(tx, p.tenantId, idemKey, async () => {
      const project = await tx.query.projects.findFirst({
        where: (pr, { and: a, eq: e, isNull: n }) => a(e(pr.tenantId, p.tenantId), e(pr.id, parsed.data.projectId), n(pr.deletedAt)),
      });
      if (!project) throw notFound("Project not found in this organization.");

      const now = new Date();
      const id = uuidv7();
      const values = {
        tenantId: p.tenantId, id, projectId: parsed.data.projectId,
        title: parsed.data.title, description: parsed.data.description ?? "",
        status: parsed.data.status ?? "backlog", priority: parsed.data.priority ?? "none",
        assigneeId: parsed.data.assigneeId ?? null, reporterId: p.userId || null,
        dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
        createdAt: now, updatedAt: now,
      };
      await tx.insert(tasks).values(values);
      await tx.insert(activityEvents).values({
        tenantId: p.tenantId, id: uuidv7(), actorId: p.userId || null,
        entityType: "task", entityId: id, action: "created",
        meta: { title: parsed.data.title, status: values.status },
      });
      await audit(tx, { tenantId: p.tenantId, actorId: p.userId, action: "task.created", entityType: "task", entityId: id, after: { title: parsed.data.title, status: values.status } });
      await invalidatePrefix(cacheKey("boards", N.tenant, p.tenantId, parsed.data.projectId));
      return taskRecord({ ...values, searchVector: "" } as typeof tasks.$inferSelect);
    });

    if (!replay) {
      void emitEvent({ tenantId: p.tenantId, actorId: p.userId || undefined, type: "task.created", entityType: "task", entityId: data.id, meta: { title: data.title, projectId: data.projectId } });
      // AI seam: enqueue a provider-agnostic job (summarize, auto-label, ...).
      // Deduped by jobId so a +1 of the same task can never double-execute.
      void enqueue(
        "ai",
        { tenantId: p.tenantId, type: "task.created", entityType: "task", entityId: data.id, meta: { title: data.title, projectId: data.projectId } },
        { jobId: `ai-${data.id}` },
      );
    }
    return c.json({ task: data, idempotentReplay: replay }, replay ? 200 : 201);
  });
});

// PATCH /v1/tasks/{id} — partial update, member+
taskRoutes.patch("/tasks/:id", async (c) => {
  const p = c.get("principal");
  const taskId = c.req.param("id");
  const parsed = z
    .object({
      title: z.string().min(1).max(200).optional(),
      description: z.string().max(100_000).optional(),
      status: z.enum(STATUSES).optional(),
      priority: z.enum(PRIORITIES).optional(),
      assigneeId: z.string().uuid().nullable().optional(),
      dueAt: z.string().datetime().nullable().optional(),
    })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest("Validation failed.");

  return inTenant(c, async (tx) => {
    requireRole(p.role, Rbac.write);
    const before = await tx.query.tasks.findFirst({
      where: (t, { and: a, eq: e, isNull: n }) => a(e(t.tenantId, p.tenantId), e(t.id, taskId), n(t.deletedAt)),
    });
    if (!before) throw notFound("Task not found.");

    const patch: Record<string, unknown> = {};
    if (parsed.data.title !== undefined) patch.title = parsed.data.title;
    if (parsed.data.description !== undefined) patch.description = parsed.data.description;
    if (parsed.data.status !== undefined) patch.status = parsed.data.status;
    if (parsed.data.priority !== undefined) patch.priority = parsed.data.priority;
    if (parsed.data.assigneeId !== undefined) patch.assigneeId = parsed.data.assigneeId;
    if (parsed.data.dueAt !== undefined) patch.dueAt = parsed.data.dueAt === null ? null : new Date(parsed.data.dueAt);

    if (Object.keys(patch).length > 0) {
      await tx.update(tasks).set(patch).where(and(eq(tasks.tenantId, p.tenantId), eq(tasks.id, taskId)));
    }
    const action = parsed.data.status !== undefined && parsed.data.status !== before.status ? "status_changed" : "updated";
    await tx.insert(activityEvents).values({
      tenantId: p.tenantId, id: uuidv7(), actorId: p.userId || null,
      entityType: "task", entityId: taskId, action, meta: { changes: patch },
    });
    await audit(tx, {
      tenantId: p.tenantId, actorId: p.userId, action, entityType: "task", entityId: taskId,
      before: { status: before.status, title: before.title }, after: { ...patch },
    });
    await invalidatePrefix(cacheKey("boards", N.tenant, p.tenantId, before.projectId));
    void emitEvent({ tenantId: p.tenantId, actorId: p.userId || undefined, type: `task.${action}`, entityType: "task", entityId: taskId, meta: { changes: patch } });
    return c.json({ ok: true, action });
  });
});

// DELETE /v1/tasks/{id} — soft delete (deleted_at), member+
taskRoutes.delete("/tasks/:id", async (c) => {
  const p = c.get("principal");
  const taskId = c.req.param("id");
  return inTenant(c, async (tx) => {
    requireRole(p.role, Rbac.write);
    const before = await tx.query.tasks.findFirst({ where: (t, { and: a, eq: e }) => a(e(t.tenantId, p.tenantId), e(t.id, taskId)) });
    if (!before) throw notFound("Task not found.");
    await tx.update(tasks).set({ deletedAt: new Date() }).where(and(eq(tasks.tenantId, p.tenantId), eq(tasks.id, taskId)));
    await audit(tx, { tenantId: p.tenantId, actorId: p.userId, action: "task.deleted", entityType: "task", entityId: taskId, before: { title: before.title } });
    await invalidatePrefix(cacheKey("boards", N.tenant, p.tenantId, before.projectId));
    return c.json({ ok: true, deletedAt: new Date().toISOString() });
  });
});