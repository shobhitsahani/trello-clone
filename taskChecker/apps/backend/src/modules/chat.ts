/** Team chat: tenant-scoped messages, cursor-paginated, soft-deletable.
 * POST/DELETE broadcast over the org WS channel (clients catch up via the
 * GET list), mirroring the comments write path: activity + audit in-tx,
 * domain event post-commit. */
import { Hono } from "hono";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { inTenant } from "../lib/request.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { uuidv7 } from "../lib/ids.js";
import { requireRole, Rbac } from "../lib/rbac.js";
import { audit } from "../lib/audit.js";
import { activityEvents, chatMessages } from "../db/schema.js";
import { emitEvent } from "../lib/events.js";
import { decodeCursor, encodeCursor, keysetBefore, parseLimit } from "../lib/cursor.js";

export const chatRoutes = new Hono();

function chatRecord(r: typeof chatMessages.$inferSelect) {
  return { id: r.id, authorId: r.authorId, body: r.body, createdAt: r.createdAt };
}

// GET /v1/chat/messages — cursor pagination (newest first).
chatRoutes.get("/chat/messages", async (c) => {
  const p = c.get("principal");
  const limit = parseLimit(c.req.query("limit"), 100, 50);
  const cursor = c.req.query("cursor") ? decodeCursor(c.req.query("cursor")!) : null;
  return inTenant(c, async (tx) => {
    const where = [eq(chatMessages.tenantId, p.tenantId)];
    if (cursor) where.push(keysetBefore(chatMessages.createdAt, chatMessages.id, cursor));
    const rows = await tx
      .select()
      .from(chatMessages)
      .where(and(...where, isNull(chatMessages.deletedAt)))
      .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return c.json({
      data: page.map(chatRecord),
      nextCursor: page.length === limit && last ? encodeCursor(last.createdAt!, last.id) : null,
      hasMore: rows.length > limit,
    });
  });
});

// POST /v1/chat/messages { body } — member+
chatRoutes.post("/chat/messages", async (c) => {
  const p = c.get("principal");
  const parsed = z.object({ body: z.string().trim().min(1).max(2000) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest("Message body is required (1–2000 chars).");

  return inTenant(c, async (tx) => {
    requireRole(p.role, Rbac.write);
    const authorId = p.userId;
    if (!authorId) throw forbidden("Chat requires a user token.");
    const id = uuidv7();
    await tx.insert(chatMessages).values({ tenantId: p.tenantId, id, authorId, body: parsed.data.body });
    await tx.insert(activityEvents).values({
      tenantId: p.tenantId, id: uuidv7(), actorId: authorId,
      entityType: "chat", entityId: id, action: "created",
      meta: { bodyPreview: parsed.data.body.slice(0, 80) },
    });
    await audit(tx, {
      tenantId: p.tenantId, actorId: authorId, action: "chat.created",
      entityType: "chat", entityId: id, after: { body: parsed.data.body.slice(0, 120) },
    });
    void emitEvent({
      tenantId: p.tenantId, actorId: authorId, type: "chat.created",
      entityType: "chat", entityId: id,
      meta: { authorId, body: parsed.data.body },
    });

    // Targeted mention notification: parse @mentions and fan-out only to mentioned users.
    const bodyLower = parsed.data.body.toLowerCase();
    const mentions = [...parsed.data.body.matchAll(/@([^\s@]+)/g)].map((m) => m[1] ?? "");
    if (mentions.length > 0) {
      try {
        const memberships = await tx.query.memberships.findMany({
          where: (m, { and: a, eq: e }) => a(e(m.tenantId, p.tenantId), e(m.status, "active")),
        });
        const memberIds = memberships.map((m) => m.userId).filter((uid): uid is string => !!uid);
        if (memberIds.length > 0) {
          const users = await tx.query.users.findMany({
            where: (u, { inArray }) => inArray(u.id, memberIds),
          });
          const byEmail = new Map(users.map((u) => [u.email.toLowerCase(), u.id]));
          const byName = new Map(users.map((u) => [u.name.toLowerCase(), u.id]));
          const byCompact = new Map(users.map((u) => [u.name.toLowerCase().replace(/\s+/g, ""), u.id]));
          const mentionedIdSet = new Set<string>();
          for (const raw of mentions) {
            const token = raw.replace(/[.,;:!?]+$/, "").toLowerCase();
            if (!token) continue;
            let uid: string | undefined;
            if (token.includes("@") && byEmail.has(token)) uid = byEmail.get(token);
            else if (byName.has(token)) uid = byName.get(token);
            else if (byCompact.has(token)) uid = byCompact.get(token);
            else {
              // also try email username or first name only if unambiguous
              for (const u of users) {
                const emailUser = u.email.split("@")[0]?.toLowerCase();
                const first = u.name.toLowerCase().split(/\s+/)[0];
                if (emailUser && token === emailUser) { uid = u.id; break; }
                if (first && token === first) {
                  const sameFirst = users.filter((x) => x.name.toLowerCase().split(/\s+/)[0] === first);
                  if (sameFirst.length === 1) { uid = u.id; break; }
                }
              }
            }
            if (!uid) {
              // substring fallback: body contains "@Full Name"
              for (const u of users) {
                if (bodyLower.includes(`@${u.name.toLowerCase()}`) || bodyLower.includes(`@${u.email.toLowerCase()}`)) {
                  mentionedIdSet.add(u.id);
                }
              }
              if (uid) mentionedIdSet.add(uid);
              continue;
            }
            if (uid) mentionedIdSet.add(uid);
          }
          // full-name substring already covers multi-word names
          for (const u of users) {
            if (bodyLower.includes(`@${u.name.toLowerCase()}`) || bodyLower.includes(`@${u.email.toLowerCase()}`)) {
              mentionedIdSet.add(u.id);
            }
          }
          mentionedIdSet.delete(authorId);
          const mentionedIds = [...mentionedIdSet];
          if (mentionedIds.length > 0) {
            const authorName = users.find((u) => u.id === authorId)?.name ?? "Someone";
            void emitEvent({
              tenantId: p.tenantId,
              actorId: authorId,
              type: "chat.mentioned",
              entityType: "chat",
              entityId: id,
              meta: {
                title: "Mentioned you in chat",
                message: parsed.data.body.slice(0, 120),
                body: parsed.data.body,
                authorId,
                authorName,
                mentionedIds,
              },
              targetUserIds: mentionedIds,
            });
          }
        }
      } catch {
        // mention fan-out is best-effort — chat already persisted
      }
    }

    return c.json({ message: { id, tenantId: p.tenantId, authorId, body: parsed.data.body, createdAt: new Date() } }, 201);
  });
});

// DELETE /v1/chat/messages/{id} — soft delete; author or admin+
chatRoutes.delete("/chat/messages/:id", async (c) => {
  const p = c.get("principal");
  const id = c.req.param("id");
  return inTenant(c, async (tx) => {
    requireRole(p.role, Rbac.write);
    const row = await tx.query.chatMessages.findFirst({
      where: (r, { and: a, eq: e, isNull: n }) => a(e(r.tenantId, p.tenantId), e(r.id, id), n(r.deletedAt)),
    });
    if (!row) throw notFound("Message not found.");
    if (row.authorId !== p.userId) requireRole(p.role, Rbac.admin);
    await tx.update(chatMessages).set({ deletedAt: new Date() }).where(and(eq(chatMessages.tenantId, p.tenantId), eq(chatMessages.id, id)));
    await audit(tx, { tenantId: p.tenantId, actorId: p.userId, action: "chat.deleted", entityType: "chat", entityId: id });
    void emitEvent({
      tenantId: p.tenantId, actorId: p.userId || undefined, type: "chat.deleted",
      entityType: "chat", entityId: id, meta: {},
    });
    return c.json({ ok: true });
  });
});
