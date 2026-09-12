/** Cache-aside (docs §6): reads offload to Redis; cache down ⇒ just slower and
 * still correct. Keys are versioned namespaces; every entry has a TTL. */
import { redis } from "./redis.js";

export function cacheKey(...parts: (string | number | undefined)[]): string {
  return parts.filter((p) => p !== undefined && p !== "").join(":");
}

/** versioned namespace so schema changes invalidate by address, not flush */
export const N = { board: "v1", notifications: "v1", tenant: "v1", session: "v1" } as const;

export async function getOrSet<T>(
  key: string,
  ttlSec: number,
  loader: () => Promise<T>,
): Promise<{ value: T; fromCache: boolean }> {
  try {
    const raw = await redis().get(key);
    if (raw != null) return { value: JSON.parse(raw) as T, fromCache: true };
  } catch {
    // cache unavailable: fall through to the origin
  }
  const value = await loader();
  try {
    await redis().set(key, JSON.stringify(value), "EX", ttlSec);
  } catch {
    // best-effort populate
  }
  return { value, fromCache: false };
}

export async function invalidate(...keys: string[]): Promise<void> {
  try {
    if (keys.length) await redis().del(...keys);
  } catch {
    // stale-by-TTL is the safety net
  }
}

/** Invalidate every key under a prefix (SCAN + DEL).
 * Board payloads are cached with cursor/limit/status baked into the key
 * (e.g. `boards:v1:<tenant>:<project>:all:first:50`), so an exact DEL of
 * `boards:v1:<tenant>:<project>:all` never clears them — moving a task then
 * re-reads the stale snapshot and the card snaps back. Use this for keys whose
 * suffix is dynamic. */
export async function invalidatePrefix(prefix: string): Promise<void> {
  try {
    const client = redis();
    let cursor = "0";
    do {
      const [next, keys] = await client.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 100);
      if (keys.length > 0) await client.del(...keys);
      cursor = next;
    } while (cursor !== "0");
  } catch {
    // stale-by-TTL is the safety net
  }
}