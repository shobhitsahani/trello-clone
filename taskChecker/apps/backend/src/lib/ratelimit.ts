/** Rate limiting — Redis fixed window with per-instance in-memory fallback.
 * Degradation story (docs §7): if Redis is down, limiters become local token
 * windows (approximate, self-healing) instead of refusing traffic wholesale.
 */
import { redis } from "./redis.js";

const fallback = new Map<string, { window: number; count: number }>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  retryAfterSeconds: number;
}

type PipelineClient = typeof redis;

/**
 * Injectable core: tests can pass a throwing client to exercise the documented
 * in-memory degradation path deterministically (no network dependency).
 */
export async function rateLimitWith(
  client: PipelineClient,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const nowSec = Math.floor(Date.now() / 1000);
  const windowStart = nowSec - (nowSec % windowSeconds);
  try {
    const r = client();
    const bucket = `rl:${key}:${windowStart}`;
    const res = await r.pipeline().incr(bucket).expire(bucket, windowSeconds + 1).exec();
    const count = Number(res?.[0]?.[1] ?? 1);
    if (count > limit) {
      return { allowed: false, remaining: 0, limit, retryAfterSeconds: windowSeconds - (nowSec % windowSeconds) };
    }
    return { allowed: true, remaining: Math.max(0, limit - count), limit, retryAfterSeconds: 0 };
  } catch {
    // Redis unavailable — degrade to in-process window.
    const windowMs = windowSeconds * 1000;
    const fw = Math.floor(Date.now() / windowMs);
    const entry = fallback.get(key);
    if (!entry || entry.window !== fw) {
      fallback.set(key, { window: fw, count: 1 });
      return { allowed: true, remaining: Math.min(limit - 1, limit), limit, retryAfterSeconds: 0 };
    }
    entry.count += 1;
    if (entry.count > limit) {
      return { allowed: false, remaining: 0, limit, retryAfterSeconds: windowSeconds - Math.floor((Date.now() % windowMs) / 1000) };
    }
    return { allowed: true, remaining: Math.max(0, limit - entry.count), limit, retryAfterSeconds: 0 };
  }
}

/** Prod entry — bounded shared client; callers keep the try/catch (docs §7). */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  return rateLimitWith(redis, key, limit, windowSeconds);
}