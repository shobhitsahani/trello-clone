/** Usage metering + subscription tier limits (docs §4: webhooks/usage limits).
 * API-call quotas ride a Redis daily counter so the hot path stays off Postgres;
 * aggregate meters go through the event queue into usage_meter for reporting. */
import { redis } from "./redis.js";
import { enqueue } from "./queue.js";

export const TIER_LIMITS = {
  free: { apiCallsPerDay: 1_000, seats: 10, storageGb: 5, eventsPerDay: 5_000, activeProjects: 2 },
  pro: { apiCallsPerDay: 10_000, seats: 50, storageGb: 100, eventsPerDay: 50_000, activeProjects: 50 },
  business: { apiCallsPerDay: 100_000, seats: 1_000, storageGb: 1_000, eventsPerDay: 500_000, activeProjects: 1_000 },
} as const;

export type Plan = keyof typeof TIER_LIMITS;

export function tierLimits(plan: string): (typeof TIER_LIMITS)[Plan] {
  return TIER_LIMITS[(plan as Plan) ?? "free"] ?? TIER_LIMITS.free;
}

const dayKey = (): string => new Date().toISOString().slice(0, 10);

/**
 * Meters one API call for the tenant; returns whether the tier still allows it.
 * Redis-degraded => fail OPEN for the meter (call granted) — a quota blowout is
 * a billing/policy issue, not an availability one; the audit row still records.
 */
export async function meterApiCall(tenantId: string, plan: string): Promise<{ allowed: boolean; count: number; limit: number }> {
  const limit = tierLimits(plan).apiCallsPerDay;
  const key = `usage:api:${tenantId}:${dayKey()}`;
  try {
    const pipe = redis().pipeline();
    pipe.incr(key);
    pipe.expire(key, 86_400);
    const res = await pipe.exec();
    const count = Number(res?.[0]?.[1] ?? 1);
    return { allowed: count <= limit, count, limit };
  } catch {
    return { allowed: true, count: 0, limit };
  }
}

/** Fire-and-forget aggregate meter rows (consumed at GET /v1/usage). */
export function recordUsage(tenantId: string, metric: string, value = 1): void {
  void enqueue("usage", {
    tenantId,
    metric,
    value,
    ts: new Date().toISOString(),
  });
}