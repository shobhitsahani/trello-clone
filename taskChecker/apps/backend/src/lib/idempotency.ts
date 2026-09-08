/** Idempotency-Key support for create endpoints (docs §3): the first request
 * with a key executes and stores the response; a retry with the same key
 * returns the stored response without re-executing. Runs inside the request's
 * tenant transaction, so the dedupe table is tenant-scoped too. */
import { and, eq } from "drizzle-orm";
import { idempotency } from "../db/schema.js";
import type { Tx } from "./tenant.js";
import { ApiError } from "./errors.js";

export async function withIdempotency<T>(
  tx: Tx,
  tenantId: string,
  key: string | undefined,
  handler: () => Promise<T>,
): Promise<{ data: T; replay: boolean }> {
  if (!key) return { data: await handler(), replay: false };
  if (key.length > 128) throw new ApiError(400, "invalid_idempotency_key", "Idempotency-Key too long.");

  const existing = await tx
    .select()
    .from(idempotency)
    .where(and(eq(idempotency.tenantId, tenantId), eq(idempotency.key, key)))
    .limit(1);
  if (existing[0]) {
    return { data: existing[0].response as unknown as T, replay: true };
  }

  const data = await handler();
  // ON CONFLICT DO NOTHING: a concurrent duplicate keeps its own response; the
  // stored winner wins future replays — last-write-wins inside a Tx is fine.
  await tx
    .insert(idempotency)
    .values({ tenantId, key, response: data as unknown as Record<string, unknown> })
    .onConflictDoNothing();
  return { data, replay: false };
}