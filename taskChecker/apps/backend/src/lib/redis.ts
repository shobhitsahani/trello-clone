/** Singleton ioredis client — shared by cache, rate-limits, pub/sub.
 * lazyConnect + bounded per-request retries so cache/limiter callers fail FAST
 * into their documented fallbacks when Redis is down (docs §7). BullMQ gets its
 * own connection in queue.ts (blocking commands need maxRetriesPerRequest null). */
import { Redis } from "ioredis";
import { config } from "../config.js";

let _redis: Redis | undefined;
let _lastRedisErrorLog = 0;

export function redis(): Redis {
  if (!_redis) {
    _redis = new Redis(config().redisUrl, {
      maxRetriesPerRequest: 2,
      lazyConnect: true,
      connectTimeout: 1000,
      // Commands issued while disconnected reject IMMEDIATELY (no offline buffering),
      // so cache/rate-limit/pub-sub callers hit their documented in-memory fallbacks
      // within milliseconds instead of hanging on a dead connection (docs §7). Every
      // caller already has a try/catch degradation path.
      enableOfflineQueue: false,
      retryStrategy: (times: number) => Math.min(times * 200, 2000),
    });
    // ioredis treats 'error' as fatal-if-unhandled; log at most once per 30s so a
    // down Redis is visible in logs without spamming the retry loop.
    _redis.on("error", (err: Error) => {
      const now = Date.now();
      if (now - _lastRedisErrorLog > 30_000) {
        _lastRedisErrorLog = now;
        console.error(`[redis] unavailable; degraded fallbacks active: ${err.message}`);
      }
    });
  }
  return _redis;
}

/** Dedicated connection for BullMQ (blocking BRPOPLPUSH-style commands). */
export function blockingRedis(): Redis {
  return new Redis(config().redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times: number) => Math.min(times * 200, 2000),
  });
}

export function redisUrl(): string {
  return config().redisUrl;
}

export async function closeRedis(): Promise<void> {
  if (_redis) {
    await _redis.quit().catch(() => {});
    _redis = undefined;
  }
}

/** Health probe — PING Redis; false when unreachable.
 * Uses a short-lived client with offline queue enabled so the probe can
 * actually connect even when the shared hot-path client has
 * `enableOfflineQueue:false` (which rejects pings while disconnected).
 * Used by /readyz only; hot paths keep their try/catch degradation instead. */
export async function redisHealthy(): Promise<boolean> {
  let probe: Redis | undefined;
  try {
    probe = new Redis(config().redisUrl, {
      maxRetriesPerRequest: 1,
      connectTimeout: 1000,
      enableOfflineQueue: true,
      lazyConnect: false,
      retryStrategy: () => null,
    });
    // ioredis still emits 'error' if unhandled; attach no-op.
    probe.on("error", () => {});
    const pong = await probe.ping();
    await probe.quit().catch(() => {});
    return pong === "PONG";
  } catch {
    try {
      await probe?.quit().catch(() => {});
    } catch {}
    return false;
  }
}

const realtimeChan = (tenantId: string) => `org:${tenantId}`;

/** Best-effort realtime broadcast — DB is the source of truth; WS is derived. */
export async function realtimePublish(tenantId: string, payload: unknown): Promise<void> {
  try {
    await redis().publish(realtimeChan(tenantId), JSON.stringify(payload));
  } catch {
    // pub/sub is best-effort; clients catch up via notification cursors.
  }
}