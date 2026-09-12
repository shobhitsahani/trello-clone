/** BullMQ on the shared Redis — the ONE work-transport (no Kafka needed at this
 * scale; see docs §6 for the breaking point). At-least-once: consumers must be
 * idempotent (they are — jobs carry a uuidv7 jobId and dedupe on write). */
import { Queue } from "bullmq";
import type { JobsOptions } from "bullmq";
import { blockingRedis } from "./redis.js";
import { uuidv7 } from "./ids.js";

export const QUEUE_NAME = "teamflow";

// BullMQ requires maxRetriesPerRequest: null for its blocking Redis commands,
// so it gets a dedicated connection (cache/limiter fail fast on the shared one).
export const queue = new Queue(QUEUE_NAME, {
  connection: blockingRedis(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

export interface EnqueueOpts {
  jobId?: string;
  delayMs?: number;
  priority?: number;
}

/** Enqueue is best-effort by contract: the DB is the source of truth and events
 * are derived, so a failed enqueue logs and the derived feature catches up
 * (outbox hardening is called out in docs §9). */
export async function enqueue<T extends Record<string, unknown>>(
  name: string,
  data: T,
  opts?: EnqueueOpts,
): Promise<void> {
  const jobOptions: JobsOptions = {
    jobId: opts?.jobId ?? uuidv7(),
    ...(opts?.delayMs ? { delay: opts.delayMs } : {}),
    ...(opts?.priority ? { priority: opts.priority } : {}),
  };
  try {
    await queue.add(name, data, jobOptions);
  } catch (err) {
    console.error(`[queue] enqueue failed for ${name}:`, (err as Error).message);
  }
}

export function closeQueue(): Promise<void> {
  return queue.close();
}

/**
 * Repeatable deadline sweep — one job every few minutes that moves overdue
 * open tasks back to `backlog`. Fixed jobId + repeat key make re-scheduling
 * idempotent across restarts/deploys; the sweep itself is idempotent too.
 */
export async function ensureDeadlineSweepSchedule(everyMs: number): Promise<void> {
  try {
    await queue.add(
      "deadline-sweep",
      {},
      { jobId: "deadline-sweep-repeat", repeat: { every: everyMs } },
    );
  } catch (err) {
    console.error("[queue] failed to schedule deadline-sweep:", (err as Error).message);
  }
}