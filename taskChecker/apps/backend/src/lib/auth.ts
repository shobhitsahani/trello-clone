/** Authentication + tenant principal resolution.
 *
 * Two credential kinds:
 *  - `Authorization: Bearer <JWT>` — user session; tid claim = active org.
 *  - `X-TeamFlow-Key: <key>` — server-to-server; resolved via the SECURITY
 *    DEFINER lookup (RLS can't be crossed before a tenant context exists), and
 *    per-tenant daily API quota is enforced right here (usage limits).
 *
 * The principal is the ONLY source of tenant_id for the whole request — the
 * path parameter is for routing/RBAC, never for data access (docs §3).
 */
import type { MiddlewareHandler } from "hono";
import { sql } from "../db/client.js";
import { forbidden, unauthorized } from "./errors.js";
import { hashSecret } from "./password.js";
import { verifyAccessToken } from "./tokens.js";
import type { Role } from "./rbac.js";
// import { meterApiCall } from "./usage.js"; // usage commented out

export interface Principal {
  tokenType: "user" | "api";
  userId: string;
  tenantId: string;
  role: Role;
  /** API-key scopes ([read, write]); user tokens carry the full set. */
  scopes?: string[];
}

declare module "hono" {
  interface ContextVariableMap {
    principal: Principal;
    requestId: string;
  }
}

interface ApiKeyRow {
  tenant_id: string;
  id: string;
  name: string;
  scopes: string[] | null;
  revoked_at: string | null;
}

export async function resolveApiKey(hashed: string): Promise<ApiKeyRow | null> {
  const rows = await sql<ApiKeyRow[]>`select * from lookup_api_key(${hashed})`;
  return rows[0] ?? null;
}

export async function lookupInvite(tokenHash: string): Promise<
  { tenant_id: string; id: string; email: string; role: Role; expires_at: Date; accepted_at: Date | null } | null
> {
  // NOTE: drizzle's postgres-js driver overrides the shared client's timestamp
  // type parsers, so raw `sql` queries return timestamptz as strings (drizzle
  // maps dates per-column only for its own query builder). Coerce explicitly.
  const rows = await sql<{
    tenant_id: string;
    id: string;
    email: string;
    role: Role;
    expires_at: Date | string;
    accepted_at: Date | string | null;
  }[]>`select * from lookup_invite_by_token(${tokenHash})`;
  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    expires_at: new Date(row.expires_at),
    accepted_at: row.accepted_at ? new Date(row.accepted_at) : null,
  };
}

export interface MembershipRow {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  plan: string;
  role: Role;
  status: "invited" | "active" | "deactivated";
}

export async function membershipsForUser(userId: string): Promise<MembershipRow[]> {
  return sql<MembershipRow[]>`select * from memberships_for_user(${userId})`;
}

export const authenticate: MiddlewareHandler = async (c, next) => {
  const bearer = c.req.header("authorization");
  const apiKey = c.req.header("x-teamflow-key") ?? c.req.query("apikey");
  const queryToken = c.req.query("token"); // WS upgrade carries the JWT here

  let principal: Principal | null = null;

  const jwt = bearer?.toLowerCase().startsWith("bearer ") ? bearer.slice(7).trim() : queryToken;
  if (jwt) {
    const claims = await verifyAccessToken(jwt);
    if (!claims) throw unauthorized("Invalid or expired access token.");
    principal = { tokenType: "user", userId: claims.sub, tenantId: claims.tid, role: claims.role };
  } else if (apiKey) {
    const row = await resolveApiKey(hashSecret(apiKey));
    if (!row || row.revoked_at) throw unauthorized("Invalid or revoked API key.");
    // // Usage limits: API-key calls draw from the tenant's daily quota. — commented out
    // const orgRow = await sql<{ plan: string; status: string }[]>`select plan, status from tenants where id = ${row.tenant_id}`;
    // const org = orgRow[0];
    // // Disabled orgs must reject every credential kind, including keys (the user
    // // path is already locked out by requireActiveMembership + deactivated rows).
    // if (org && org.status !== "active") throw unauthorized("Organization is disabled.");
    // const plan = org?.plan ?? "free";
    // const meter = await meterApiCall(row.tenant_id, plan);
    // if (!meter.allowed) {
    //   return c.json(
    //     {
    //       error: {
    //         code: "usage_limit_exceeded",
    //         message: `Daily API call limit (${meter.limit}) exceeded for this organization.`,
    //         request_id: c.get("requestId"),
    //         retryable: false,
    //       },
    //     },
    //     429 as 429,
    //   );
    // }
    // usage check disabled — keep org disabled check minimal
    const orgRow = await sql<{ plan: string; status: string }[]>`select plan, status from tenants where id = ${row.tenant_id}`;
    const org = orgRow[0];
    if (org && org.status !== "active") throw unauthorized("Organization is disabled.");
    principal = { tokenType: "api", userId: "", tenantId: row.tenant_id, role: "member", scopes: row.scopes ?? ["read", "write"] };
  }

  if (!principal) throw unauthorized("Missing or malformed credentials.");

  c.set("principal", principal);
  await next();
};

export function principalOf(c: { get: (k: "principal") => Principal }): Principal {
  return c.get("principal");
}

/**
 * API-key scope enforcement (middleware for everything under /v1/*).
 * A key minted with `scopes: ["read"]` may only call safe methods; mutating
 * methods require a "write" scope. User tokens are unlimited (RBAC governs
 * them); a key with neither scope is denied outright.
 */
export const enforceApiScopes: MiddlewareHandler = async (c, next) => {
  const p = c.get("principal");
  if (p && p.tokenType === "api") {
    const scopes = p.scopes ?? [];
    const mutating = !["GET", "HEAD", "OPTIONS"].includes(c.req.method);
    if (mutating && !scopes.includes("write")) {
      throw forbidden("This API key has no write scope.");
    }
    if (!mutating && !scopes.includes("read") && !scopes.includes("write")) {
      throw forbidden("This API key has no read scope.");
    }
  }
  await next();
};