/** Comments: tenant-scoped, cursor-paginated, soft-deletable, FTS-indexed. */
import { Hono } from "hono";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { inTenant } from "../lib/request.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { uuidv7 } from "../lib/ids.js";
import { requireRole, Rbac } from "../lib/rbac.js";
import { audit } from "../lib/audit.js";
import { activityEvents, comments, tasks } from "../db/schema.js";
import { emitEvent } from "../lib/events.js";
import { decodeCursor, encodeCursor, keysetBefore, parseLimit } from "../lib/cursor.js";

export const commentRoutes = new Hono();

// GET /v1/tasks/{id}/comments — cursor pagination (newest first).
commentRoutes.get("/tasks/:id/comments", async (c) => {
  const p = c.get("principal");
  const taskId = c.req.param("id");
  const limit = parseLimit(c.req.query("limit"), 100, 50);
  const cursor = c.req.query("cursor") ? decodeCursor(c.req.query("cursor")!) : null;
  return inTenant(c, async (tx) => {
    const task = await tx.query.tasks.findFirst({
      where: (t, { and: a, eq: e, isNull: n }) => a(e(t.tenantId, p.tenantId), e(t.id, taskId), n(t.deletedAt)),
    });
    if (!task) throw notFound("Task not found.");
    const where = [eq(comments.tenantId, p.tenantId), eq(comments.taskId, taskId)];
    if (cursor) where.push(keysetBefore(comments.createdAt, comments.id, cursor));
    const rows = await tx
      .select()
      .from(comments)
      .where(and(...where, isNull(comments.deletedAt)))
      .orderBy(desc(comments.createdAt), desc(comments.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return c.json({
      taskId,
      data: page.map((r) => ({
        id: r.id, tenantId: r.tenantId, taskId: r.taskId, authorId: r.authorId,
        body: r.body, createdAt: r.createdAt, deletedAt: null,
      })),
      nextCursor: page.length === limit && last ? encodeCursor(last.createdAt!, last.id) : null,
      hasMore: rows.length > limit,
    });
  });
});

// POST /v1/tasks/{id}/comments { body } — member+
commentRoutes.post("/tasks/:id/comments", async (c) => {
  const p = c.get("principal");
  const taskId = c.req.param("id");
  const parsed = z.object({ body: z.string().min(1).max(10_000) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest("body is required.");

  return inTenant(c, async (tx) => {
    requireRole(p.role, Rbac.write);
    const task = await tx.query.tasks.findFirst({
      where: (t, { and: a, eq: e, isNull: n }) => a(e(t.tenantId, p.tenantId), e(t.id, taskId), n(t.deletedAt)),
    });
    if (!task) throw notFound("Task not found.");
    const id = uuidv7();
    const authorId = p.userId;
    if (!authorId) throw forbidden("Comments require a user token.");
    await tx.insert(comments).values({ tenantId: p.tenantId, id, taskId, authorId, body: parsed.data.body });
    await tx.insert(activityEvents).values({
      tenantId: p.tenantId, id: uuidv7(), actorId: authorId,
      entityType: "comment", entityId: id, action: "created",
      meta: { taskId, bodyPreview: parsed.data.body.slice(0, 80) },
    });
    await audit(tx, {
      tenantId: p.tenantId, actorId: authorId, action: "comment.created",
      entityType: "comment", entityId: id, after: { taskId, body: parsed.data.body.slice(0, 120) },
    });
    void emitEvent({
      tenantId: p.tenantId, actorId: authorId, type: "comment.created",
      entityType: "comment", entityId: id,
      meta: { taskId, taskTitle: task.title, body: parsed.data.body },
    });
    return c.json({ comment: { id, tenantId: p.tenantId, taskId, authorId, body: parsed.data.body, createdAt: new Date(), deletedAt: null } }, 201);
  });
});

// DELETE /v1/comments/{id} — soft delete, member+
commentRoutes.delete("/comments/:id", async (c) => {
  const p = c.get("principal");
  const id = c.req.param("id");
  return inTenant(c, async (tx) => {
    requireRole(p.role, Rbac.write);
    const row = await tx.query.comments.findFirst({ where: (r, { and: a, eq: e }) => a(e(r.tenantId, p.tenantId), e(r.id, id)) });
    if (!row) throw notFound("Comment not found.");
    await tx.update(comments).set({ deletedAt: new Date() }).where(and(eq(comments.tenantId, p.tenantId), eq(comments.id, id)));
    await audit(tx, { tenantId: p.tenantId, actorId: p.userId, action: "comment.deleted", entityType: "comment", entityId: id, before: { taskId: row.taskId } });
    return c.json({ ok: true });
  });
});