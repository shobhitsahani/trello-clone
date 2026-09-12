/**
 * Request-shape helper: runs a handler inside the principal's tenant with RLS
 * set, and for user tokens re-verifies the membership is ACTIVE on every
 * request (deactivation takes effect immediately). API-key/system principals
 * skip the membership row (they have none) but still get RLS scoping.
 */
import type { Context } from "hono";
import { withTenant, requireActiveMembership, evictMembership, type Tx } from "./tenant.js";

export function inTenant<T>(c: Context, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const principal = c.get("principal");
  return withTenant(principal.tenantId, async (tx) => {
    if (principal.tokenType === "user") {
      await requireActiveMembership(tx, principal.tenantId, principal.userId);
    }
    return fn(tx);
  });
}

export { withTenant, requireActiveMembership, evictMembership };
export type { Tx } from "./tenant.js";