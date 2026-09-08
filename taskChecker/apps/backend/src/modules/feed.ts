/** Activity feeds + notifications. Both are tenant-scoped and cursor-paginated;
 * notifications double as the WS catch-up store (a client reconnecting replays
 * `since` its last cursor), so a dropped connection never loses updates. */
import { Hono } from "hono";
import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { inTenant } from "../lib/request.js";
import { notFound } from "../lib/errors.js";
import { decodeCursor, encodeCursor, parseLimit } from "../lib/cursor.js";
import { activityEvents, notifications } from "../db/schema.js";

export const feedRoutes = new Hono();

// GET /v1/activity?entityType=&entityId=&cursor=&limit=
feedRoutes.get("/activity", async (c) => {
  const p = c.get("principal");
  const limit = parseLimit(c.req.query("limit"), 100, 50);
  const cursor = c.req.query("cursor") ? decodeCursor(c.req.query("cursor")!) : null;
  const entityType = c.req.query("entityType");
  const entityId = c.req.query("entityId");
  return inTenant(c, async (tx) => {
    const where = [eq(activityEvents.tenantId, p.tenantId)];
    if (entityType) where.push(eq(activityEvents.entityType, entityType));
    if (entityId) where.push(eq(activityEvents.entityId, entityId));
    if (cursor) where.push(lt(activityEvents.createdAt, new Date(cursor.createdAt)));
    const rows = await tx
      .select()
      .from(activityEvents)
      .where(and(...where))
      .orderBy(desc(activityEvents.createdAt))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return c.json({
      activity: page.map((r) => ({ id: r.id, actorId: r.actorId, entityType: r.entityType, entityId: r.entityId, action: r.action, meta: r.meta, createdAt: r.createdAt })),
      nextCursor: page.length === limit && last ? encodeCursor(last.createdAt!, last.id) : null,
      hasMore: rows.length > limit,
    });
  });
});

// GET /v1/notifications?unread=true&cursor=&limit=
feedRoutes.get("/notifications", async (c) => {
  const p = c.get("principal");
  const limit = parseLimit(c.req.query("limit"), 100, 50);
  const cursor = c.req.query("cursor") ? decodeCursor(c.req.query("cursor")!) : null;
  const unreadOnly = c.req.query("unread") === "true";
  return inTenant(c, async (tx) => {
    const where = [eq(notifications.tenantId, p.tenantId), eq(notifications.userId, p.userId)];
    if (unreadOnly) where.push(isNull(notifications.readAt));
    if (cursor) where.push(lt(notifications.createdAt, new Date(cursor.createdAt)));
    const rows = await tx
      .select()
      .from(notifications)
      .where(and(...where, isNull(notifications.deletedAt)))
      .orderBy(desc(notifications.createdAt))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return c.json({
      notifications: page.map((r) => ({ id: r.id, type: r.type, payload: r.payload, readAt: r.readAt, createdAt: r.createdAt })),
      nextCursor: page.length === limit && last ? encodeCursor(last.createdAt!, last.id) : null,
      hasMore: rows.length > limit,
    });
  });
});

// POST /v1/notifications/{id}/read — idempotent.
feedRoutes.post("/notifications/:id/read", async (c) => {
  const p = c.get("principal");
  const id = c.req.param("id");
  return inTenant(c, async (tx) => {
    const row = await tx.query.notifications.findFirst({
      where: (n, { and: a, eq: e }) => a(e(n.tenantId, p.tenantId), e(n.id, id)),
    });
    if (!row) throw notFound("Notification not found.");
    if (row.readAt) return c.json({ ok: true, alreadyRead: true }); // idempotent
    await tx
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.tenantId, p.tenantId), eq(notifications.id, id)));
    return c.json({ ok: true });
  });
});