/** Team chat: tenant-scoped messages, cursor-paginated, soft-deletable.
 * Realtime upgrades: image attachments, emoji reactions, @mention fan-out,
 * ephemeral typing presence.
 * POST/DELETE/reactions broadcast over the org WS channel (clients catch up
 * via the GET list), mirroring the comments write path: activity + audit
 * in-tx, domain event post-commit. */
import { Hono } from "hono";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { inTenant } from "../lib/request.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { uuidv7 } from "../lib/ids.js";
import { requireRole, Rbac } from "../lib/rbac.js";
import { audit } from "../lib/audit.js";
import { activityEvents, chatMessages, chatReactions } from "../db/schema.js";
import { emitEvent } from "../lib/events.js";
import { decodeCursor, encodeCursor, keysetBefore, parseLimit } from "../lib/cursor.js";

export const chatRoutes = new Hono();

export interface ReactionGroup {
  emoji: string;
  count: number;
  userIds: string[];
  reactedByMe: boolean;
}

type ChatRow = typeof chatMessages.$inferSelect;

const attachmentSchema = z.object({
  url: z.string().min(1).max(7_000_000),
  name: z.string().min(1).max(200).default("image"),
  mime: z.string().min(3).max(120).default("image/png"),
  size: z.number().int().positive().max(8 * 1024 * 1024).default(0),
});

const postSchema = z.object({
  body: z.string().max(2000).default(""),
  attachments: z.array(attachmentSchema).max(4).default([]),
  mentions: z.array(z.string().uuid()).max(20).default([]),
});

function sanitizeAttachments(list: z.infer<typeof attachmentSchema>[]) {
  return list
    .filter((a) => typeof a.url === "string" && a.url.length > 0)
    .slice(0, 4)
    .map((a) => ({
      url: a.url,
      name: (a.name || "image").slice(0, 200),
      mime: /^image\//.test(a.mime) ? a.mime : "image/png",
      size: Math.min(a.size || 0, 8 * 1024 * 1024),
    }));
}

function chatRecord(r: ChatRow, reactions: ReactionGroup[] = []) {
  return {
    id: r.id,
    authorId: r.authorId,
    body: r.body,
    attachments: (r.attachments as { url: string; name: string; mime: string; size: number }[] | null) ?? [],
    mentions: (r.mentions as string[] | null) ?? [],
    reactions,
    createdAt: r.createdAt,
  };
}

async function reactionsFor(
  tx: Parameters<Parameters<typeof inTenant>[1]>[0],
  tenantId: string,
  messageIds: string[],
  viewerId: string | null,
): Promise<Map<string, ReactionGroup[]>> {
  const out = new Map<string, ReactionGroup[]>();
  if (messageIds.length === 0) return out;
  try {
    const { inArray } = await import("drizzle-orm");
    const rows = await tx
      .select()
      .from(chatReactions)
      .where(and(eq(chatReactions.tenantId, tenantId), inArray(chatReactions.messageId, messageIds)));
    const grouped = new Map<string, Map<string, string[]>>();
    for (const r of rows) {
      let byEmoji = grouped.get(r.messageId);
      if (!byEmoji) {
        byEmoji = new Map();
        grouped.set(r.messageId, byEmoji);
      }
      const list = byEmoji.get(r.emoji) ?? [];
      list.push(r.userId);
      byEmoji.set(r.emoji, list);
    }
    for (const [mid, byEmoji] of grouped) {
      const groups: ReactionGroup[] = [...byEmoji.entries()].map(([emoji, userIds]) => ({
        emoji,
        count: userIds.length,
        userIds,
        reactedByMe: viewerId ? userIds.includes(viewerId) : false,
      }));
      groups.sort((a, b) => b.count - a.count || (a.emoji < b.emoji ? -1 : 1));
      out.set(mid, groups);
    }
  } catch {
    // Table may not exist yet on DBs that haven't run 0010 — degrade to no reactions.
  }
  return out;
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
    const byMsg = await reactionsFor(tx, p.tenantId, page.map((r) => r.id), p.userId ?? null);
    return c.json({
      data: page.map((r) => chatRecord(r, byMsg.get(r.id) ?? [])),
      nextCursor: page.length === limit && last ? encodeCursor(last.createdAt!, last.id) : null,
      hasMore: rows.length > limit,
    });
  });
});

// POST /v1/chat/messages { body, attachments?, mentions? } — member+
chatRoutes.post("/chat/messages", async (c) => {
  const p = c.get("principal");
  const parsed = postSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest("Message body (≤2000 chars) or up to 4 images required.");

  const body = (parsed.data.body ?? "").trim();
  const attachments = sanitizeAttachments(parsed.data.attachments ?? []);
  if (!body && attachments.length === 0) throw badRequest("Message body or at least one image is required.");
  if (body.length > 2000) throw badRequest("Message body must be ≤2000 chars.");
  for (const a of attachments) {
    if (!/^data:image\//.test(a.url) && !/^https?:\/\//.test(a.url) && !a.url.startsWith("/v1/")) {
      throw badRequest("Image url must be a data:image URL, https URL, or /v1 attachment URL.");
    }
  }
  return inTenant(c, async (tx) => {
    requireRole(p.role, Rbac.write);
    const authorId = p.userId;
    if (!authorId) throw forbidden("Chat requires a user token.");
    const id = uuidv7();
    const explicitMentions = (parsed.data.mentions ?? []).filter((m) => m !== authorId);
    await tx.insert(chatMessages).values({
      tenantId: p.tenantId,
      id,
      authorId,
      body,
      attachments,
      mentions: explicitMentions,
    });
    await tx.insert(activityEvents).values({
      tenantId: p.tenantId, id: uuidv7(), actorId: authorId,
      entityType: "chat", entityId: id, action: "created",
      meta: { bodyPreview: (body || "[image]").slice(0, 80), imageCount: attachments.length },
    });
    await audit(tx, {
      tenantId: p.tenantId, actorId: authorId, action: "chat.created",
      entityType: "chat", entityId: id, after: { body: (body || "[image]").slice(0, 120), imageCount: attachments.length },
    });
    void emitEvent({
      tenantId: p.tenantId, actorId: authorId, type: "chat.created",
      entityType: "chat", entityId: id,
      meta: { authorId, body, attachments, mentions: explicitMentions },
    });

    // Targeted mention notification: explicit ids + parsed @mentions, fan-out only to mentioned users.
    const textForParse = body;
    const bodyLower = textForParse.toLowerCase();
    const parsedMentions = [...textForParse.matchAll(/@([^\s@]+)/g)].map((m) => m[1] ?? "");
    if (parsedMentions.length > 0 || explicitMentions.length > 0) {
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
          const mentionedIdSet = new Set<string>(explicitMentions);
          for (const raw of parsedMentions) {
            const token = raw.replace(/[.,;:!?]+$/, "").toLowerCase();
            if (!token) continue;
            let uid: string | undefined;
            if (token.includes("@") && byEmail.has(token)) uid = byEmail.get(token);
            else if (byName.has(token)) uid = byName.get(token);
            else if (byCompact.has(token)) uid = byCompact.get(token);
            else {
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
          for (const u of users) {
            if (bodyLower.includes(`@${u.name.toLowerCase()}`) || bodyLower.includes(`@${u.email.toLowerCase()}`)) {
              mentionedIdSet.add(u.id);
            }
          }
          mentionedIdSet.delete(authorId);
          const mentionedIds = [...mentionedIdSet];
          if (mentionedIds.length > 0) {
            // Persist resolved ids so clients can highlight reliably.
            try {
              await tx.update(chatMessages).set({ mentions: mentionedIds }).where(and(eq(chatMessages.tenantId, p.tenantId), eq(chatMessages.id, id)));
            } catch {
              // best-effort
            }
            const authorName = users.find((u) => u.id === authorId)?.name ?? "Someone";
            void emitEvent({
              tenantId: p.tenantId,
              actorId: authorId,
              type: "chat.mentioned",
              entityType: "chat",
              entityId: id,
              meta: {
                title: "Mentioned you in chat",
                message: (body || "[image]").slice(0, 120),
                body,
                attachments,
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

    return c.json({ message: { id, tenantId: p.tenantId, authorId, body, attachments, mentions: explicitMentions, reactions: [], createdAt: new Date() } }, 201);
  });
});

// POST /v1/chat/messages/{id}/reactions { emoji } — toggle-add; member+
chatRoutes.post("/chat/messages/:id/reactions", async (c) => {
  const p = c.get("principal");
  const id = c.req.param("id");
  const parsed = z.object({ emoji: z.string().trim().min(1).max(16) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest("An emoji (1–16 chars) is required.");
  const emoji = parsed.data.emoji;
  if (/\s{2,}/.test(emoji)) throw badRequest("Invalid emoji.");

  return inTenant(c, async (tx) => {
    requireRole(p.role, Rbac.write);
    if (!p.userId) throw forbidden("Reactions require a user token.");
    const row = await tx.query.chatMessages.findFirst({
      where: (r, { and: a, eq: e, isNull: n }) => a(e(r.tenantId, p.tenantId), e(r.id, id), n(r.deletedAt)),
    });
    if (!row) throw notFound("Message not found.");
    try {
      await tx.insert(chatReactions).values({ tenantId: p.tenantId, id: uuidv7(), messageId: id, userId: p.userId, emoji }).onConflictDoNothing();
    } catch {
      throw notFound("Reactions unavailable — run migrations.");
    }
    const byMsg = await reactionsFor(tx, p.tenantId, [id], p.userId);
    const groups = byMsg.get(id) ?? [];
    void emitEvent({
      tenantId: p.tenantId, actorId: p.userId || undefined, type: "chat.updated",
      entityType: "chat", entityId: id, meta: { messageId: id, reactions: groups },
    });
    return c.json({ ok: true, reactions: groups });
  });
});

// DELETE /v1/chat/messages/{id}/reactions/{emoji} — remove my reaction; member+
chatRoutes.delete("/chat/messages/:id/reactions/:emoji", async (c) => {
  const p = c.get("principal");
  const id = c.req.param("id");
  const emoji = decodeURIComponent(c.req.param("emoji") ?? "");
  if (!emoji) throw badRequest("Emoji is required.");

  return inTenant(c, async (tx) => {
    requireRole(p.role, Rbac.write);
    if (!p.userId) throw forbidden("Reactions require a user token.");
    try {
      await tx.delete(chatReactions).where(and(eq(chatReactions.tenantId, p.tenantId), eq(chatReactions.messageId, id), eq(chatReactions.userId, p.userId), eq(chatReactions.emoji, emoji)));
    } catch {
      throw notFound("Reactions unavailable — run migrations.");
    }
    const byMsg = await reactionsFor(tx, p.tenantId, [id], p.userId);
    const groups = byMsg.get(id) ?? [];
    void emitEvent({
      tenantId: p.tenantId, actorId: p.userId || undefined, type: "chat.updated",
      entityType: "chat", entityId: id, meta: { messageId: id, reactions: groups },
    });
    return c.json({ ok: true, reactions: groups });
  });
});

// POST /v1/chat/typing — ephemeral presence; not persisted. member+
chatRoutes.post("/chat/typing", async (c) => {
  const p = c.get("principal");
  const parsed = z.object({ displayName: z.string().max(80).optional() }).safeParse(await c.req.json().catch(() => ({})));
  requireRole(p.role, Rbac.write);
  void emitEvent({
    tenantId: p.tenantId, actorId: p.userId || undefined, type: "chat.typing",
    entityType: "chat", entityId: "typing",
    meta: { authorId: p.userId, displayName: parsed.success ? (parsed.data.displayName ?? null) : null },
  });
  return c.json({ ok: true });
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
