/** Domain events — emitted AFTER the request transaction commits, so the DB is
 * never atomic with the queue (the classic outbox problem; scaffold enqueues
 * post-commit, production hardening = transactional outbox — docs §9).
 *
 * Fan-out shapes (docs §5 write path):
 *   realtime publish  → org channel (WS gateways bridge to clients)
 *   notify            → worker creates notification rows + (stub) emails
 *   webhook           → worker matches subscribed endpoints, ledgered delivery
 *   usage             → per-tenant meters
 */
import { realtimePublish } from "./redis.js";
import { enqueue } from "./queue.js";

export interface DomainEvent {
  tenantId: string;
  actorId?: string;
  type: string; // task.created | task.updated | comment.created | ...
  entityType: string;
  entityId: string;
  meta: Record<string, unknown>;
  targetUserIds?: string[]; // notification recipients (fan-out targets)
}

export async function emitEvent(event: DomainEvent): Promise<void> {
  const envelope = {
    id: crypto.randomUUID(),
    ...event,
    at: new Date().toISOString(),
    version: 1,
  };
  await realtimePublish(event.tenantId, envelope);
  // Fan-out jobs (each consumer filters what it cares about) — parallel so
  // one slow queue doesn't add 4 sequential Redis RTTs to every write.
  await Promise.all([
    enqueue("notify", envelope),
    enqueue("webhook", envelope),
    enqueue("usage", {
      tenantId: event.tenantId,
      metric: "events",
      value: 1,
      ts: new Date().toISOString(),
    }),
  ]);
}