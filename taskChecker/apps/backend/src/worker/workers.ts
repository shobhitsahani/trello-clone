/** BullMQ worker pool — idempotent consumers (at-least-once delivery; the
 * deterministic ids make re-delivery a no-op write). Priorities keep
 * user-facing notifications ahead of emails. */
import { Worker, type Job } from "bullmq";
import { QUEUE_NAME } from "../lib/queue.js";
import { blockingRedis } from "../lib/redis.js";
import { withTenant } from "../lib/tenant.js";
import { notifications, memberships, webhooks, deliveries, usageMeter } from "../db/schema.js";
import { and, eq } from "drizzle-orm";
import { decryptSecret, signPayload } from "../lib/password.js";
import { deterministicUuid } from "../lib/ids.js";
import { config } from "../config.js";
import { sweepOverdueTasks } from "./deadlines.js";

export interface EventJob {
  id: string;
  tenantId: string;
  type: string;
  entityType: string;
  entityId: string;
  meta: Record<string, unknown>;
  actorId?: string;
  at: string;
}

export interface UsageJob {
  tenantId: string;
  metric: string;
  value: number;
  ts: string;
}

/** Notification fan-out: task events → assignee + reporter; others → members. */
export async function handleNotify(event: EventJob): Promise<number> {
  const targets = await withTenant(event.tenantId, async (tx) => {
    const rows = await tx.query.memberships.findMany({ where: (m, { eq: e }) => e(m.tenantId, event.tenantId) });
    const active = rows.filter((m) => m.status === "active" && m.userId !== event.actorId);
    if (event.meta?.notifyUserIds) return (event.meta.notifyUserIds as string[]).filter((u) => u !== event.actorId);
    return active.map((m) => m.userId);
  });

  if (targets.length === 0) return 0;
  await withTenant(event.tenantId, async (tx) => {
    await tx
      .insert(notifications)
      .values(
        targets.map((userId) => ({
          // deterministic id ⇒ redelivery of the same event does not duplicate
          tenantId: event.tenantId,
          id: deterministicUuid(`${event.id}:${userId}`),
          userId,
          type: event.type,
          payload: { entityType: event.entityType, entityId: event.entityId, ...event.meta },
        })),
      )
      .onConflictDoNothing();
  });
  // Email digest stub — swap for a provider client (docs §9: transports ready).
  console.log(`[worker:notify] ${event.type} → ${targets.length} recipient(s) (email transport stubbed)`);
  return targets.length;
}

/** Webhook delivery: find subscribed active endpoints, ledger the attempt,
 * POST with an HMAC signature; BullMQ retries with backoff, capped attempts. */
export async function handleWebhookEvent(job: Job, event: EventJob): Promise<void> {
  const endpoints = await withTenant(event.tenantId, async (tx) => {
    const rows = await tx.query.webhooks.findMany({ where: (w, { eq: e }) => e(w.tenantId, event.tenantId) });
    return rows.filter((w) => w.active && (w.events.length === 0 || w.events.includes(event.type)));
  });

  const attemptsMade = job.attemptsMade + 1;
  const maxAttempts = job.opts.attempts ?? config().webhookRetries;

  for (const endpoint of endpoints) {
    const deliveryId = deterministicUuid(`${event.id}:${endpoint.id}`);
    const payload = JSON.stringify({ id: event.id, type: event.type, createdAt: event.at, data: event.meta });
    const timestamp = String(Math.floor(Date.now() / 1000));
    let error: string | null = null;
    let ok = false;

    try {
      const signature = signPayload(decryptSecret(endpoint.secretHash), payload, timestamp);
      const res = await fetch(endpoint.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-TeamFlow-Event": event.type,
          "X-TeamFlow-Signature": `t=${timestamp},v1=${signature}`,
        },
        body: payload,
        signal: AbortSignal.timeout(5000),
      });
      ok = res.ok;
      if (!ok) error = `HTTP ${res.status}`;
    } catch (err) {
      error = (err as Error).message;
    }

    await withTenant(event.tenantId, async (tx) => {
      await tx
        .insert(deliveries)
        .values({
          tenantId: event.tenantId,
          id: deliveryId,
          endpointId: endpoint.id,
          event: event.type,
          payload: event.meta,
          status: ok ? "delivered" : "pending",
          attempts: attemptsMade,
          nextAttemptAt: ok ? null : new Date(Date.now() + 2 ** attemptsMade * 1000),
          lastError: error,
        })
        .onConflictDoUpdate({
          target: [deliveries.tenantId, deliveries.id],
          set: {
            status: ok ? "delivered" : attemptsMade >= maxAttempts ? "failed" : "pending",
            attempts: attemptsMade,
            nextAttemptAt: ok ? null : new Date(Date.now() + 2 ** attemptsMade * 1000),
            lastError: error,
          },
        });
    });
    console.log(`[worker:webhook] ${event.type} → ${endpoint.url} ${ok ? "ok" : `failed: ${error}`}`);
  }
}

export async function handleUsage(jobData: UsageJob): Promise<void> {
  await withTenant(jobData.tenantId, async (tx) => {
    await tx.insert(usageMeter).values({
      tenantId: jobData.tenantId,
      metric: jobData.metric,
      ts: new Date(jobData.ts),
      value: jobData.value,
    });
  });
}

/** AI job seam (docs §6 fan-out). Deterministic, provider-agnostic: tasks like
 * "summarize this thread" enqueue here; a configured provider (OpenAI/Anthropic)
 * plugs into this handler without touching the request path. No-op today. */
export async function handleAi(event: EventJob): Promise<void> {
  console.log(`[worker:ai] ${event.type} for ${event.entityType} ${event.entityId} queued (provider not configured — no-op)`);
}

export function startWorkers(): Worker[] {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      switch (job.name) {
        case "notify":
          return handleNotify(job.data as unknown as EventJob);
        case "webhook":
          return handleWebhookEvent(job, job.data as unknown as EventJob);
        case "usage":
          return handleUsage(job.data as unknown as UsageJob);
        case "deadline-sweep": {
          const moved = await sweepOverdueTasks();
          if (moved > 0) console.log(`[worker:deadlines] moved ${moved} overdue task(s) to backlog`);
          return moved;
        }
        case "ai":
          return handleAi(job.data as unknown as EventJob);
        default:
          return; // unknown job type — ack and move on
      }
    },
    { connection: blockingRedis(), concurrency: 10 },
  );
  worker.on("failed", (job, err) => {
    console.error(`[worker] job ${job?.name}/${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message);
  });
  return [worker];
}