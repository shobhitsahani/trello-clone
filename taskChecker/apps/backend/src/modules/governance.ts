/** Governance module: outbound webhooks (retry ledger + rotation), API keys
 * (shown once, stored hashed, scoped), audit logs (admin+), and usage meters
 * vs tier limits. */
import { Hono } from "hono";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { z } from "zod";
import { inTenant } from "../lib/request.js";
import { badRequest, notFound } from "../lib/errors.js";
import { randomToken, uuidv7 } from "../lib/ids.js";
import { requireRole, Rbac } from "../lib/rbac.js";
import { encryptSecret, hashSecret } from "../lib/password.js";
import { audit } from "../lib/audit.js";
import { apiKeys, auditLogs, usageMeter, webhooks } from "../db/schema.js";
import { decodeCursor, encodeCursor, parseLimit } from "../lib/cursor.js";
import { tierLimits } from "../lib/usage.js";

export const govRoutes = new Hono();

// ------------------------------ webhooks ------------------------------

// GET /v1/webhooks
govRoutes.get("/webhooks", async (c) => {
  const p = c.get("principal");
  return inTenant(c, async (tx) => {
    const rows = await tx.select().from(webhooks).where(eq(webhooks.tenantId, p.tenantId)).orderBy(desc(webhooks.createdAt));
    return c.json({
      webhooks: rows.map((w) => ({ id: w.id, name: w.name, url: w.url, events: w.events, active: w.active, createdAt: w.createdAt })),
    });
  });
});

// POST /v1/webhooks { name, url, events? } — admin+; secret shown ONCE.
govRoutes.post("/webhooks", async (c) => {
  const p = c.get("principal");
  const parsed = z
    .object({ name: z.string().min(1).max(80), url: z.string().url(), events: z.array(z.string()).optional() })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest("name, url and optional events[] are required.");
  requireRole(p.role, Rbac.admin);

  return inTenant(c, async (tx) => {
    const secret = `whsec_${randomToken(32)}`;
    const id = uuidv7();
    await tx.insert(webhooks).values({
      tenantId: p.tenantId,
      id,
      name: parsed.data.name,
      url: parsed.data.url,
      secretHash: encryptSecret(secret), // AES-GCM at rest; HMAC needs the plaintext
      events: parsed.data.events ?? [],
    });
    await audit(tx, { tenantId: p.tenantId, actorId: p.userId, action: "webhook.created", entityType: "webhook", entityId: id, after: { url: parsed.data.url, events: parsed.data.events ?? [] } });
    return c.json({ webhook: { id, name: parsed.data.name, url: parsed.data.url, events: parsed.data.events ?? [] }, secret }, 201);
  });
});

// POST /v1/webhooks/{id}/rotate-secret — admin+.
govRoutes.post("/webhooks/:id/rotate-secret", async (c) => {
  const p = c.get("principal");
  const id = c.req.param("id");
  requireRole(p.role, Rbac.admin);
  return inTenant(c, async (tx) => {
    const row = await tx.query.webhooks.findFirst({ where: (w, { and: a, eq: e }) => a(e(w.tenantId, p.tenantId), e(w.id, id)) });
    if (!row) throw notFound("Webhook not found.");
    const secret = `whsec_${randomToken(32)}`;
    await tx.update(webhooks).set({ secretHash: encryptSecret(secret) }).where(and(eq(webhooks.tenantId, p.tenantId), eq(webhooks.id, id)));
    await audit(tx, { tenantId: p.tenantId, actorId: p.userId, action: "webhook.secret_rotated", entityType: "webhook", entityId: id });
    return c.json({ secret });
  });
});

// GET /v1/webhooks/{id}/deliveries — the retry ledger.
govRoutes.get("/webhooks/:id/deliveries", async (c) => {
  const p = c.get("principal");
  const id = c.req.param("id");
  const limit = parseLimit(c.req.query("limit"), 100, 50);
  return inTenant(c, async (tx) => {
    const rows = await tx
      .select()
      .from(webhooks)
      .where(and(eq(webhooks.tenantId, p.tenantId), eq(webhooks.id, id)))
      .limit(1);
    if (!rows[0]) throw notFound("Webhook not found.");
    const deliveries = await tx.query.deliveries.findMany({
      where: (d, { and: a, eq: e }) => a(e(d.tenantId, p.tenantId), e(d.endpointId, id)),
      orderBy: (d) => desc(d.createdAt),
      limit,
    });
    return c.json({ deliveries });
  });
});

// ------------------------------ api keys ------------------------------

// POST /v1/api-keys { name, scopes? } — admin+; key shown ONCE, stored hashed.
govRoutes.post("/api-keys", async (c) => {
  const p = c.get("principal");
  const parsed = z
    .object({ name: z.string().min(1).max(80), scopes: z.array(z.string()).optional() })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest("name (and optional scopes[]) are required.");
  requireRole(p.role, Rbac.admin);

  return inTenant(c, async (tx) => {
    const secret = randomToken(32);
    const key = `tfk_live_${secret}`;
    const id = uuidv7();
    await tx.insert(apiKeys).values({
      tenantId: p.tenantId,
      id,
      name: parsed.data.name,
      keyHash: hashSecret(key),
      keyPrefix: key.slice(0, 16),
      scopes: parsed.data.scopes ?? ["read", "write"],
    });
    await audit(tx, { tenantId: p.tenantId, actorId: p.userId, action: "api_key.created", entityType: "api_key", entityId: id, after: { name: parsed.data.name, prefix: key.slice(0, 16) } });
    return c.json({ apiKey: { id, name: parsed.data.name, keyPrefix: key.slice(0, 16) }, key }, 201);
  });
});

// GET /v1/api-keys — list (never returns the key material; prefix only), admin+.
govRoutes.get("/api-keys", async (c) => {
  const p = c.get("principal");
  requireRole(p.role, Rbac.admin);
  return inTenant(c, async (tx) => {
    const rows = await tx
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.tenantId, p.tenantId))
      .orderBy(desc(apiKeys.createdAt));
    return c.json({
      apiKeys: rows.map((k) => ({
        id: k.id,
        name: k.name,
        keyPrefix: k.keyPrefix,
        scopes: k.scopes,
        revokedAt: k.revokedAt,
        lastUsedAt: k.lastUsedAt,
        createdAt: k.createdAt,
      })),
    });
  });
});

// DELETE /v1/api-keys/{id} — revoke (soft), admin+.
govRoutes.delete("/api-keys/:id", async (c) => {
  const p = c.get("principal");
  const id = c.req.param("id");
  requireRole(p.role, Rbac.admin);
  return inTenant(c, async (tx) => {
    const row = await tx.query.apiKeys.findFirst({ where: (k, { and: a, eq: e }) => a(e(k.tenantId, p.tenantId), e(k.id, id)) });
    if (!row) throw notFound("API key not found.");
    await tx.update(apiKeys).set({ revokedAt: new Date() }).where(and(eq(apiKeys.tenantId, p.tenantId), eq(apiKeys.id, id)));
    await audit(tx, { tenantId: p.tenantId, actorId: p.userId, action: "api_key.revoked", entityType: "api_key", entityId: id, before: { name: row.name } });
    return c.json({ ok: true });
  });
});

// ------------------------------ audit + usage ------------------------------

// GET /v1/audit-logs — admin+; append-only, cursor-paginated.
govRoutes.get("/audit-logs", async (c) => {
  const p = c.get("principal");
  requireRole(p.role, Rbac.admin);
  const limit = parseLimit(c.req.query("limit"), 100, 50);
  const cursor = c.req.query("cursor") ? decodeCursor(c.req.query("cursor")!) : null;
  return inTenant(c, async (tx) => {
    const where = [eq(auditLogs.tenantId, p.tenantId)];
    if (cursor) where.push(lt(auditLogs.createdAt, new Date(cursor.createdAt)));
    const rows = await tx
      .select()
      .from(auditLogs)
      .where(and(...where))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return c.json({
      logs: page.map((r) => ({ id: r.id, actorId: r.actorId, action: r.action, entityType: r.entityType, entityId: r.entityId, before: r.before, after: r.after, createdAt: r.createdAt })),
      nextCursor: page.length === limit && last ? encodeCursor(last.createdAt!, last.id) : null,
      hasMore: rows.length > limit,
    });
  });
});

// GET /v1/usage — meters for the current month vs tier limits.
govRoutes.get("/usage", async (c) => {
  const p = c.get("principal");
  return inTenant(c, async (tx) => {
    const tenant = await tx.query.tenants.findFirst({ where: (t, { eq: e }) => e(t.id, p.tenantId) });
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const rows = await tx
      .select({ metric: usageMeter.metric, total: usageMeter.value })
      .from(usageMeter)
      .where(and(eq(usageMeter.tenantId, p.tenantId), gte(usageMeter.ts, monthStart)));
    const totals: Record<string, number> = {};
    for (const r of rows) totals[r.metric] = (totals[r.metric] ?? 0) + r.total;
    return c.json({
      plan: tenant?.plan ?? "free",
      limits: tierLimits(tenant?.plan ?? "free"),
      month: totals,
      note: "api_calls meter at Redis speed in auth middleware; aggregates land here via the queue",
    });
  });
});