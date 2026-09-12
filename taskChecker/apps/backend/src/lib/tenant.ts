/**
 * THE multi-tenancy mechanism. Every tenant-scoped query in TeamFlow runs
 * through `withTenant`, which:
 *  1. opens a request-scoped transaction,
 *  2. sets `app.tenant_id` via SET LOCAL (scoped to the tx),
 *  3. runs the handler — Postgres RLS *also* filters every row by that value,
 *     so even a query that forgets an explicit tenant filter cannot leak.
 *
 * Belt-and-suspenders: routes still pass tenant_id to every WHERE — RLS is the
 * backstop (a query-level error on violation), not the only gate.
 */
import { db } from "../db/client.js";
import type { Tx } from "../db/client.js";
import { sql as pgSql } from "../db/client.js";
import { sql } from "drizzle-orm";
import { ApiError } from "./errors.js";
import type { Membership } from "../db/schema.js";

export type { Tx };

export async function withTenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!tenantId) throw new ApiError(401, "missing_tenant", "A tenant context is required.");
  return db.transaction(async (tx) => {
    // SET LOCAL — the tenant context lives exactly as long as this transaction,
    // so a pooled connection can never leak a tenant to the next request.
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}

/**
 * Membership lookup as a GATE inside an already-authenticated request:
 * runs inside the tenant context, so RLS scopes it to the caller's own row.
 * Returns the active membership or throws 403 — deactivation takes effect
 * on the next request, no token cache required.
 *
 * Hot-path cache: 30s TTL per (tenant,user) avoids one SELECT per request
 * (board/chat poll storms). Negative lookups are NOT cached so a fresh
 * invite/accept takes effect immediately; call `evictMembership` on
 * role/status change.
 */
const membershipCache = new Map<string, { row: Membership; exp: number }>();
const MEMBERSHIP_TTL_MS = 30_000;

export function evictMembership(tenantId: string, userId: string) {
  membershipCache.delete(`${tenantId}:${userId}`);
}

export async function requireActiveMembership(tx: Tx, tenantId: string, userId: string) {
  const key = `${tenantId}:${userId}`;
  const hit = membershipCache.get(key);
  if (hit && hit.exp > Date.now() && hit.row) return hit.row;
  const row = await tx.query.memberships.findFirst({
    where: (m, { and, eq }) => and(eq(m.tenantId, tenantId), eq(m.userId, userId)),
  });
  if (!row) throw new ApiError(403, "not_a_member", "You are not a member of this organization.");
  if (row.status !== "active") throw new ApiError(403, "membership_inactive", "Your membership is not active.");
  membershipCache.set(key, { row, exp: Date.now() + MEMBERSHIP_TTL_MS });
  return row;
}