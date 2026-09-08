/** Billing + subscription tiers. The plan catalog (prices, features, derived
 * limits) is static; the tenant's CURRENT plan lives on tenants.plan.
 * POST /v1/billing/subscribe is owner-only and audit-trailed. Limits are
 * ENFORCED at the points of use: seats on invites (orgs.ts), active projects
 * (core.ts), and the daily API-call quota for API keys (lib/auth.ts). */
import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { inTenant } from "../lib/request.js";
import { badRequest, notFound } from "../lib/errors.js";
import { requireRole, Rbac } from "../lib/rbac.js";
import { audit } from "../lib/audit.js";
import { tenants } from "../db/schema.js";
import { tierLimits, type Plan } from "../lib/usage.js";

export const billingRoutes = new Hono();

export interface PlanCatalogEntry {
  id: Plan;
  name: string;
  price: number; // USD / month
  blurb: string;
  features: string[];
}

export const PLAN_CATALOG: PlanCatalogEntry[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    blurb: "For small teams finding their flow.",
    features: [
      "Up to 10 seats",
      "2 active projects",
      "1k API calls / day",
      "5 GB attachments",
      "Email notifications",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: 29,
    blurb: "For product teams shipping every week.",
    features: [
      "Up to 50 seats",
      "50 active projects",
      "10k API calls / day",
      "100 GB attachments",
      "Webhooks + API keys",
      "Full-text search",
      "Realtime WebSocket notifications",
    ],
  },
  {
    id: "business",
    name: "Business",
    price: 99,
    blurb: "For orgs where the tenant is the product.",
    features: [
      "Up to 1,000 seats",
      "1k active projects",
      "100k API calls / day",
      "1 TB attachments",
      "SSO (OIDC / SAML)",
      "Audit export + archive",
      "Priority webhook delivery",
    ],
  },
];

// GET /v1/billing/plans — the catalog + derived tier limits (authenticated).
billingRoutes.get("/billing/plans", async (c) => {
  const p = c.get("principal");
  const current = await inTenant(c, async (tx) => {
    const tenant = await tx.query.tenants.findFirst({ where: (t, { eq: e }) => e(t.id, p.tenantId) });
    return tenant?.plan ?? "free";
  });
  return c.json({
    plans: PLAN_CATALOG,
    currentPlan: current,
    limits: Object.fromEntries(PLAN_CATALOG.map((plan) => [plan.id, tierLimits(plan.id)])),
  });
});

// POST /v1/billing/subscribe { plan } — owner-only plan change, audit-trailed.
billingRoutes.post("/billing/subscribe", async (c) => {
  const p = c.get("principal");
  const parsed = z
    .object({ plan: z.enum(["free", "pro", "business"]) })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest("plan must be one of: free, pro, business.");
  requireRole(p.role, Rbac.owner);

  return inTenant(c, async (tx) => {
    const tenant = await tx.query.tenants.findFirst({ where: (t, { eq: e }) => e(t.id, p.tenantId) });
    if (!tenant) throw notFound("Organization not found.");
    const before = tenant.plan;
    await tx.update(tenants).set({ plan: parsed.data.plan }).where(eq(tenants.id, p.tenantId));
    await audit(tx, {
      tenantId: p.tenantId,
      actorId: p.userId,
      action: "billing.plan_changed",
      entityType: "tenant",
      entityId: p.tenantId,
      before: { plan: before },
      after: { plan: parsed.data.plan },
    });
    return c.json({ ok: true, plan: parsed.data.plan, limits: tierLimits(parsed.data.plan) });
  });
});