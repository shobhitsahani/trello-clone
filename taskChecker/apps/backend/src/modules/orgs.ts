/** Organization module: invitations (RBAC + hashed tokens + expiry) and member
 * management (role changes, deactivation). All query paths run inside
 * `withTenant`, so RLS scopes every row to the caller's org; admin surfaces
 * additionally require admin+ (owner for minting owners). */
import { Hono } from "hono";
import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "../lib/tenant.js";
import { inTenant, withTenant, evictMembership } from "../lib/request.js";
import { requireRole, Rbac, type Role } from "../lib/rbac.js";
import { hashPassword, hashSecret } from "../lib/password.js";
import { randomToken, uuidv7 } from "../lib/ids.js";
import { badRequest, forbidden, notFound, quotaExceeded, unauthorized } from "../lib/errors.js";
import { audit } from "../lib/audit.js";
import { signAccessToken } from "../lib/tokens.js";
import { config } from "../config.js";
import { db } from "../db/client.js";
import { invites, memberships, projects, tasks, tenants, users } from "../db/schema.js";
import { lookupInvite } from "../lib/auth.js";
import { tierLimits } from "../lib/usage.js";

export const orgRoutes = new Hono();

const ROLE_VALUES: Role[] = ["owner", "admin", "member", "viewer"];
const isRole = (v: unknown): v is Role => typeof v === "string" && (ROLE_VALUES as string[]).includes(v);

// POST /v1/orgs — authenticated user creates a new organization (becomes owner).
// This is the in-app equivalent of signup's auto-provisioning, for users who
// already have a session and want an additional workspace.
orgRoutes.post("/orgs", async (c) => {
  const p = c.get("principal");
  if (!p || p.tokenType !== "user" || !p.userId) throw forbidden("Only user sessions can create organizations.");
  const raw = await c.req.json().catch(() => null);
  const parsed = z
    .object({ name: z.string().min(2).max(80).optional(), orgName: z.string().min(2).max(80).optional() })
    .safeParse(raw);
  const orgName = parsed.success ? (parsed.data.name ?? parsed.data.orgName) : undefined;
  if (!parsed.success || !orgName) throw badRequest("Organization name (2-80 characters) is required.");

  const userRows = await db.select().from(users).where(eq(users.id, p.userId)).limit(1);
  if (!userRows[0]) throw unauthorized("Account not found.");

  const tenantId = uuidv7();
  const slugBase = orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "org";
  let slug = `${slugBase}-${tenantId.slice(-4)}${tenantId.slice(19, 23)}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await db.insert(tenants).values({ id: tenantId, name: orgName, slug, plan: "free" });
      break;
    } catch (err) {
      if (attempt === 2 || !(err as { code?: string }).code?.startsWith("23")) throw err;
      slug = `${slugBase}-${randomToken(4).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || uuidv7().slice(-4)}`;
    }
  }
  await withTenant(tenantId, async (tx) => {
    await tx.insert(memberships).values({ tenantId, userId: p.userId, role: "owner", status: "active" });
    await audit(tx, { tenantId, actorId: p.userId, action: "org.created", entityType: "tenant", entityId: tenantId, after: { name: orgName } });
  });

  const accessToken = await signAccessToken({ sub: p.userId, tid: tenantId, role: "owner" });
  return c.json(
    {
      org: { id: tenantId, name: orgName, slug },
      tenant: { tenant_id: tenantId, tenant_name: orgName, tenant_slug: slug, plan: "free", role: "owner", status: "active" },
      accessToken,
    },
    201,
  );
});

function assertCanRoleScale(actor: Role | undefined, target: Role): void {
  if (target === "owner") requireRole(actor, Rbac.owner); // only owners mint owners
  else requireRole(actor, Rbac.admin); // admins+ can assign the rest
}

// POST /v1/orgs/{orgId}/invites — admin+: invite by email with a role.
orgRoutes.post("/orgs/:orgId/invites", async (c) => {
  const p = c.get("principal");
  const orgId = c.req.param("orgId");
  if (orgId !== p.tenantId) throw forbidden("Organization mismatch.");
  const parsed = z
    .object({ email: z.string().email(), role: z.enum(["owner", "admin", "member", "viewer"]) })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    throw badRequest(`role must be one of ${ROLE_VALUES.join(", ")}`);
  }

  return inTenant(c, async (tx) => {
    assertCanRoleScale(p.role, parsed.data.role);
    // Usage limit: seat cap per subscription tier (active members + pending invites).
    const tenant = await tx.query.tenants.findFirst({ where: (t, { eq: e }) => e(t.id, orgId) });
    const plan = tenant?.plan ?? "free";
    const seats = tierLimits(plan).seats;
    const activeSeatsRows = await tx
      .select({ n: count() })
      .from(memberships)
      .where(and(eq(memberships.tenantId, orgId), inArray(memberships.status, ["active", "invited"])));
    const pendingInvitesRows = await tx
      .select({ n: count() })
      .from(invites)
      .where(and(eq(invites.tenantId, orgId), isNull(invites.acceptedAt)));
    const usedSeats = (activeSeatsRows[0]?.n ?? 0) + (pendingInvitesRows[0]?.n ?? 0);
    if (usedSeats >= seats) {
      throw quotaExceeded(`Seat limit (${seats}) reached for the ${plan} plan. Deactivate inactive members or upgrade.`);
    }
    const emailLower = parsed.data.email.toLowerCase();
    const token = randomToken(32);
    // Invite links live 24 hours — the expiry is enforced on accept/preview
    // and surfaced to the inviter so they can relay the deadline.
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
    const invite = await tx
      .insert(invites)
      .values({
        tenantId: orgId,
        id: uuidv7(),
        email: emailLower,
        role: parsed.data.role,
        tokenHash: hashSecret(token),
        expiresAt,
        invitedById: p.userId,
      })
      .onConflictDoNothing()
      .returning();
    if (!invite[0]) throw badRequest("An invite for this email already exists.");
    await audit(tx, {
      tenantId: orgId,
      actorId: p.userId,
      action: "invite.created",
      entityType: "invite",
      entityId: invite[0].id,
      after: { email: emailLower, role: parsed.data.role },
    });
    // Absolute web-app link (copyable + emailable) — never the raw /v1 API path.
    const invitationUrl = `${config().frontendBaseUrl}/auth/accept-invite?token=${token}`;
    return c.json({ invite: { id: invite[0].id, email: emailLower, role: parsed.data.role, expiresAt: expiresAt.toISOString() }, invitationUrl }, 201);
  });
});

// GET /v1/invites/{token}/preview — public: lets the accept page show who the
// invite is for (org, email, role, expiry) without leaking the token hash.
orgRoutes.get("/invites/:token/preview", async (c) => {
  const invite = await lookupInvite(hashSecret(c.req.param("token")));
  if (!invite) throw notFound("Invalid or expired invitation token.");
  if (invite.expires_at.getTime() < Date.now()) throw badRequest("Invitation has expired.");
  if (invite.accepted_at) throw badRequest("Invitation already accepted.");
  const org = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, invite.tenant_id)).limit(1);
  return c.json({
    invite: {
      email: invite.email,
      orgName: org[0]?.name ?? "a workspace",
      role: invite.role,
      expiresAt: invite.expires_at.toISOString(),
    },
  });
});

// POST /v1/invites/{token} — public: token resolved by the SECURITY DEFINER
// lookup (no tenant context exists yet), then enrollment runs in the tenant.
orgRoutes.post("/invites/:token", async (c) => {
  const invite = await lookupInvite(hashSecret(c.req.param("token")));
  if (!invite) throw notFound("Invalid or expired invitation token.");
  if (invite.expires_at.getTime() < Date.now()) throw badRequest("Invitation has expired.");
  if (invite.accepted_at) throw badRequest("Invitation already accepted.");

  const parsed = z
    .object({ name: z.string().min(1).max(80), password: z.string().min(8) })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest("name and password (8+ characters) are required.");

  const emailLower = invite.email.toLowerCase();
  const existing = await db.select().from(users).where(eq(users.email, emailLower)).limit(1);
  let userId = existing[0]?.id;
  if (!userId) {
    userId = uuidv7();
    await db.insert(users).values({ id: userId, email: emailLower, name: parsed.data.name, passwordHash: hashPassword(parsed.data.password) });
  }

  await withTenant(invite.tenant_id, async (tx) => {
    await tx.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, invite.id));
    await tx
      .insert(memberships)
      .values({ tenantId: invite.tenant_id, userId: userId!, role: invite.role, status: "active", acceptedAt: new Date() })
      .onConflictDoUpdate({
        target: [memberships.tenantId, memberships.userId],
        set: { status: "active", acceptedAt: new Date() },
      });
    await audit(tx, { tenantId: invite.tenant_id, actorId: userId!, action: "invite.accepted", entityType: "membership", entityId: userId! });
  });
  return c.json({ ok: true, tenantId: invite.tenant_id });
});

// GET /v1/orgs/{orgId}/members — member+: list members with roles.
orgRoutes.get("/orgs/:orgId/members", async (c) => {
  const p = c.get("principal");
  if (c.req.param("orgId") !== p.tenantId) throw forbidden("Organization mismatch.");
  return inTenant(c, async (tx) => {
    // Single join — the old Promise.all per-member SELECT held the tx open
    // for N round-trips and stalled the pool under load.
    const rows = await tx
      .select({ userId: memberships.userId, role: memberships.role, status: memberships.status, acceptedAt: memberships.acceptedAt, name: users.name, email: users.email })
      .from(memberships)
      .leftJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.tenantId, p.tenantId))
      .orderBy(memberships.role);
    return c.json({ members: rows.map((r) => ({ userId: r.userId, name: r.name ?? null, email: r.email ?? null, role: r.role, status: r.status })) });
  });
});

// PATCH /v1/orgs/{orgId}/members/{userId} { role } — change a member's role.
orgRoutes.patch("/orgs/:orgId/members/:userId", async (c) => {
  const p = c.get("principal");
  const orgId = c.req.param("orgId");
  const targetUserId = c.req.param("userId");
  if (orgId !== p.tenantId) throw forbidden("Organization mismatch.");
  const parsed = z.object({ role: z.enum(["owner", "admin", "member", "viewer"]) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest(`role must be one of ${ROLE_VALUES.join(", ")}`);

  return inTenant(c, async (tx) => {
    assertCanRoleScale(p.role, parsed.data.role);
    const before = await loadMember(tx, orgId, targetUserId);
    if (!before) throw notFound("Member not found.");
    await tx
      .update(memberships)
      .set({ role: parsed.data.role })
      .where(and(eq(memberships.tenantId, orgId), eq(memberships.userId, targetUserId)));
    await audit(tx, {
      tenantId: orgId,
      actorId: p.userId,
      action: "member.role_changed",
      entityType: "membership",
      entityId: targetUserId,
      before: { role: before.role },
      after: { role: parsed.data.role },
    });
    evictMembership(orgId, targetUserId);
    return c.json({ userId: targetUserId, role: parsed.data.role });
  });
});

// DELETE /v1/orgs/{orgId}/members/{userId} — soft-deactivate a member.
orgRoutes.delete("/orgs/:orgId/members/:userId", async (c) => {
  const p = c.get("principal");
  const orgId = c.req.param("orgId");
  const targetUserId = c.req.param("userId");
  if (orgId !== p.tenantId) throw forbidden("Organization mismatch.");
  return inTenant(c, async (tx) => {
    requireRole(p.role, Rbac.admin);
    if (targetUserId === p.userId) throw badRequest("Use /orgs/:id (disable) for self-offboarding.");
    const before = await loadMember(tx, orgId, targetUserId);
    if (!before) throw notFound("Member not found.");
    await tx
      .update(memberships)
      .set({ status: "deactivated" })
      .where(and(eq(memberships.tenantId, orgId), eq(memberships.userId, targetUserId)));
    await audit(tx, {
      tenantId: orgId,
      actorId: p.userId,
      action: "member.deactivated",
      entityType: "membership",
      entityId: targetUserId,
      before: { status: before.status },
    });
    evictMembership(orgId, targetUserId);
    return c.json({ ok: true });
  });
});

// GET /v1/orgs/{orgId} — member+: org profile + live usage counts vs tier limits.
orgRoutes.get("/orgs/:orgId", async (c) => {
  const p = c.get("principal");
  const orgId = c.req.param("orgId");
  if (orgId !== p.tenantId) throw forbidden("Organization mismatch.");
  return inTenant(c, async (tx) => {
    const tenant = await tx.query.tenants.findFirst({ where: (t, { eq: e }) => e(t.id, orgId) });
    if (!tenant) throw notFound("Organization not found.");
    const [membersRow, projectsRow, tasksRow] = await Promise.all([
      tx.select({ n: count() }).from(memberships).where(and(eq(memberships.tenantId, orgId), eq(memberships.status, "active"))),
      tx.select({ n: count() }).from(projects).where(and(eq(projects.tenantId, orgId), isNull(projects.deletedAt))),
      tx.select({ n: count() }).from(tasks).where(and(eq(tasks.tenantId, orgId), isNull(tasks.deletedAt))),
    ]);
    const activeMembers = membersRow[0]?.n ?? 0;
    const activeProjectCount = projectsRow[0]?.n ?? 0;
    const openTaskCount = tasksRow[0]?.n ?? 0;
    return c.json({
      org: { id: tenant.id, name: tenant.name, slug: tenant.slug, plan: tenant.plan, status: tenant.status, createdAt: tenant.createdAt },
      stats: { activeMembers, activeProjects: activeProjectCount, openTasks: openTaskCount },
      limits: tierLimits(tenant.plan),
    });
  });
});

// POST /v1/orgs/{orgId}/disable — owner only. Soft-disables the tenant and
// deactivates every membership: the next request locks out (requireActiveMembership
// reads status live). Rows are retained — this is reversible by support.
orgRoutes.post("/orgs/:orgId/disable", async (c) => {
  const p = c.get("principal");
  const orgId = c.req.param("orgId");
  if (orgId !== p.tenantId) throw forbidden("Organization mismatch.");
  return inTenant(c, async (tx) => {
    requireRole(p.role, Rbac.owner);
    const tenant = await tx.query.tenants.findFirst({ where: (t, { eq: e }) => e(t.id, orgId) });
    if (!tenant) throw notFound("Organization not found.");
    if (tenant.status !== "active") throw badRequest("Organization is not active.");
    await tx.update(tenants).set({ status: "disabled" }).where(eq(tenants.id, orgId));
    await tx.update(memberships).set({ status: "deactivated" }).where(eq(memberships.tenantId, orgId));
    await audit(tx, {
      tenantId: orgId, actorId: p.userId, action: "org.disabled",
      entityType: "tenant", entityId: orgId, before: { status: tenant.status },
    });
    return c.json({ ok: true, status: "disabled" });
  });
});

// POST /v1/orgs/{orgId}/leave — self-offboarding. Owners cannot leave (that would
// strand the org) — they must disable it or promote another owner first.
orgRoutes.post("/orgs/:orgId/leave", async (c) => {
  const p = c.get("principal");
  const orgId = c.req.param("orgId");
  if (orgId !== p.tenantId) throw forbidden("Organization mismatch.");
  return inTenant(c, async (tx) => {
    if (p.role === "owner") throw badRequest("Owners cannot leave; disable the organization or promote another owner first.");
    await tx
      .update(memberships)
      .set({ status: "deactivated" })
      .where(and(eq(memberships.tenantId, orgId), eq(memberships.userId, p.userId)));
    await audit(tx, {
      tenantId: orgId, actorId: p.userId, action: "member.self_left",
      entityType: "membership", entityId: p.userId,
    });
    return c.json({ ok: true });
  });
});

async function loadMember(tx: Tx, tenantId: string, userId: string) {
  return (await tx.query.memberships.findFirst({
    where: (m, { and: a, eq: e }) => a(e(m.tenantId, tenantId), e(m.userId, userId)),
  })) ?? null;
}