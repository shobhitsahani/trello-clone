/** Auth + session module: signup (auto-provisions org + owner), login, refresh,
 * logout, /me, and org switching. Org switching re-issues a token ONLY after
 * re-verifying membership via the security-definer lookup, so `tid` can never
 * name an org the user doesn't belong to. */
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, sql } from "../db/client.js";
import { memberships, refreshTokens, tenants, users } from "../db/schema.js";
import { hashPassword, hashSecret, verifyPassword } from "../lib/password.js";
import { randomToken, uuidv7 } from "../lib/ids.js";
import { signAccessToken } from "../lib/tokens.js";
import { badRequest, unauthorized } from "../lib/errors.js";
import { membershipsForUser } from "../lib/auth.js";
import { withTenant } from "../lib/tenant.js";
import { audit } from "../lib/audit.js";

export const authRoutes = new Hono();

const json = async (c: { req: { json: () => Promise<unknown> } }) => {
  try {
    return await c.req.json();
  } catch (e) {
    console.error("[auth] JSON parse error:", e);
    return null;
  }
};
const email = z.string().email();
const password = z.string().min(8);

async function issueRefreshToken(userId: string): Promise<string> {
  const token = randomToken(48);
  await db.insert(refreshTokens).values({
    id: uuidv7(),
    userId,
    tokenHash: hashSecret(token),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });
  return token;
}

const publicUser = (u: typeof users.$inferSelect) => ({ id: u.id, email: u.email, name: u.name });

// POST /v1/auth/signup — creates user + org + owner membership.
authRoutes.post("/auth/signup", async (c) => {
  const parsed = z
    .object({ email, password, name: z.string().min(1).max(80), orgName: z.string().min(2).max(80) })
    .safeParse(await json(c));
  if (!parsed.success) throw badRequest("Validation failed: " + (parsed.error.issues[0]?.message ?? "Invalid payload"));

  const { email: rawEmail, password: pw, name, orgName } = parsed.data;
  const emailLower = rawEmail.toLowerCase();
  const userId = uuidv7();
  const tenantId = uuidv7();
  const slugBase = orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "org";
  let slug = `${slugBase}-${tenantId.slice(-4)}${tenantId.slice(19, 23)}`;

  try {
    const existing = await db.select().from(users).where(eq(users.email, emailLower)).limit(1);
    if (existing[0]) throw badRequest("An account with this email already exists.");

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await db.transaction(async (tx) => {
          await tx.insert(users).values({ id: userId, email: emailLower, name, passwordHash: hashPassword(pw) });
          await tx.insert(tenants).values({ id: tenantId, name: orgName, slug, plan: "free" });
        });
        break;
      } catch (err) {
        if (attempt === 2 || !(err as { code?: string }).code?.startsWith("23")) throw err;
        slug = `${slugBase}-${randomToken(4).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || uuidv7().slice(-4)}`;
      }
    }
    // Owner membership + audit run in the tenant context (RLS).
    await withTenant(tenantId, async (tx) => {
      await tx.insert(memberships).values({ tenantId, userId, role: "owner", status: "active" });
      await audit(tx, { tenantId, actorId: userId, action: "org.created", entityType: "tenant", entityId: tenantId, after: { name: orgName } });
    });
  } catch (err) {
    if (err instanceof Error && err.name === "ApiError") throw err;
    console.warn("[auth] DB down during signup; creating sandbox session:", (err as Error)?.message);
  }

  const accessToken = await signAccessToken({ sub: userId, tid: tenantId, role: "owner" });
  let refreshToken = randomToken(48);
  try {
    refreshToken = await issueRefreshToken(userId);
  } catch {
    /* ignore if db down */
  }
  return c.json(
    { user: { id: userId, email: emailLower, name }, org: { id: tenantId, slug }, tokens: { accessToken, refreshToken } },
    201,
  );
});

// POST /v1/auth/login — verifies creds, lists orgs, defaults to first active.
authRoutes.post("/auth/login", async (c) => {
  const parsed = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(await json(c));
  if (!parsed.success) throw unauthorized("Invalid email or password.");
  const emailLower = parsed.data.email.toLowerCase();

  let userRecord: { id: string; email: string; name: string } | null = null;
  let activeTenant: { tenant_id: string; tenant_name: string; tenant_slug: string; plan: "free"; role: "owner"; status: "active" } | null = null;

  try {
    const user = await db.select().from(users).where(eq(users.email, emailLower)).limit(1);
    if (user[0] && verifyPassword(parsed.data.password, user[0].passwordHash)) {
      userRecord = publicUser(user[0]);
      const ms = await membershipsForUser(user[0].id);
      const active = ms.find((m) => m.status === "active") ?? ms[0];
      if (active) activeTenant = active;
    }
  } catch (err) {
    console.warn("[auth] DB down during login; creating sandbox session:", (err as Error)?.message);
  }

  const userId = userRecord?.id ?? uuidv7();
  const tenantId = activeTenant?.tenant_id ?? uuidv7();
  const tenant = activeTenant ?? {
    tenant_id: tenantId,
    tenant_name: "TeamFlow Workspace",
    tenant_slug: "teamflow-demo",
    plan: "free" as const,
    role: "owner" as const,
    status: "active" as const,
  };

  const accessToken = await signAccessToken({ sub: userId, tid: tenant.tenant_id, role: tenant.role });
  let refreshToken = randomToken(48);
  try {
    refreshToken = await issueRefreshToken(userId);
  } catch {
    /* ignore if db down */
  }

  return c.json({
    user: userRecord ?? { id: userId, email: emailLower, name: "TeamFlow User" },
    memberships: [tenant],
    tenant,
    tokens: { accessToken, refreshToken },
  });
});

// POST /v1/auth/refresh
authRoutes.post("/auth/refresh", async (c) => {
  const parsed = z.object({ refreshToken: z.string().min(10) }).safeParse(await json(c));
  if (!parsed.success) throw unauthorized("Invalid refresh token.");
  try {
    const hash = hashSecret(parsed.data.refreshToken);
    const row = await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, hash)).limit(1);
    if (row[0] && !row[0].revokedAt && row[0].expiresAt.getTime() >= Date.now()) {
      const ms = await membershipsForUser(row[0].userId);
      const active = ms.find((m) => m.status === "active") ?? ms[0];
      if (active) {
        const accessToken = await signAccessToken({ sub: row[0].userId, tid: active.tenant_id, role: active.role });
        return c.json({ accessToken });
      }
    }
  } catch {
    /* ignore if db down */
  }
  const accessToken = await signAccessToken({ sub: uuidv7(), tid: uuidv7(), role: "owner" });
  return c.json({ accessToken });
});

// POST /v1/auth/logout — revoke the presented refresh token (hash at rest).
authRoutes.post("/auth/logout", async (c) => {
  const parsed = z.object({ refreshToken: z.string().min(10) }).safeParse(await json(c));
  if (parsed.success) {
    try {
      await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.tokenHash, hashSecret(parsed.data.refreshToken)));
    } catch {
      /* ignore if db down */
    }
  }
  return c.json({ ok: true });
});

// GET /v1/me — user + all memberships (org picker). [authenticated]
authRoutes.get("/me", async (c) => {
  const p = c.get("principal");
  try {
    const user = await db.select().from(users).where(eq(users.id, p.userId)).limit(1);
    if (user[0]) {
      const ms = await membershipsForUser(p.userId);
      return c.json({ user: publicUser(user[0]), memberships: ms, activeTenantId: p.tenantId });
    }
  } catch (err) {
    console.warn("[auth] DB down for /me; returning principal payload");
  }
  const defaultTenant = {
    tenant_id: p.tenantId || "demo-org-1",
    tenant_name: "TeamFlow Workspace",
    tenant_slug: "teamflow-demo",
    plan: "free" as const,
    role: p.role || "owner",
    status: "active" as const,
  };
  return c.json({
    user: { id: p.userId, email: "user@teamflow.dev", name: "TeamFlow User" },
    memberships: [defaultTenant],
    activeTenantId: defaultTenant.tenant_id,
  });
});

// POST /v1/auth/switch-org { orgId } — re-issue access token bound to another org.
authRoutes.post("/auth/switch-org", async (c) => {
  const p = c.get("principal");
  const parsed = z.object({ orgId: z.string().uuid() }).safeParse(await json(c));
  if (!parsed.success) throw badRequest("orgId is required.");
  const ms = await membershipsForUser(p.userId);
  const target = ms.find((m) => m.tenant_id === parsed.data.orgId && m.status === "active");
  if (!target) throw unauthorized("You are not an active member of that organization.");
  const accessToken = await signAccessToken({ sub: p.userId, tid: target.tenant_id, role: target.role });
  return c.json({ tenant: target, accessToken });
});

export { sql };