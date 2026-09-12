/** Deadline enforcement — tasks whose due_at passes while still open
 * (not done/backlog) are moved back to `backlog`.
 *
 * Runs as a BullMQ repeatable job ("deadline-sweep", every few minutes).
 * The move itself is the SECURITY DEFINER `sweep_overdue_tasks()` (migration
 * 0006): cross-tenant, capped, SKIP LOCKED, predicate re-checked at write
 * time. This module then records the trail per tenant (activity + audit),
 * invalidates the board cache, and emits the domain event — same write-path
 * shape as a PATCH /v1/tasks/{id}, minus the actor.
 */
import { sql } from "../db/client.js";
import { withTenant } from "../lib/tenant.js";
import { activityEvents } from "../db/schema.js";
import { uuidv7 } from "../lib/ids.js";
import { cacheKey, invalidatePrefix, N } from "../lib/cache.js";
import { emitEvent } from "../lib/events.js";

export const DEADLINE_SWEEP_BATCH = 200;

/** Pure predicate — unit-tested without a database. */
export function isOverdueDue(dueAt: string | Date | null | undefined, status: string | undefined, now = Date.now()): boolean {
  if (!dueAt || !status) return false;
  if (status === "done" || status === "backlog") return false;
  const t = dueAt instanceof Date ? dueAt.getTime() : new Date(dueAt).getTime();
  if (Number.isNaN(t)) return false;
  return t < now;
}

interface SweptRow {
  tenant_id: string;
  id: string;
  project_id: string;
  old_status: string;
  title: string;
}

export async function sweepOverdueTasks(limit = DEADLINE_SWEEP_BATCH): Promise<number> {
  const rows = await sql<SweptRow[]>`select * from sweep_overdue_tasks(${limit})`;
  if (rows.length === 0) return 0;

  // Group by tenant: one tenant context per org, like every other write path.
  const byTenant = new Map<string, SweptRow[]>();
  for (const r of rows) {
    const list = byTenant.get(r.tenant_id) ?? [];
    list.push(r);
    byTenant.set(r.tenant_id, list);
  }

  for (const [tenantId, swept] of byTenant) {
    // No audit row: audit.actor_id is NOT NULL (human/system actor required)
    // while activity.actor_id is nullable — the activity event below is the
    // trail for automatic moves, tagged reason=deadline_passed.
    await withTenant(tenantId, async (tx) => {
      for (const r of swept) {
        await tx.insert(activityEvents).values({
          tenantId,
          id: uuidv7(),
          actorId: null,
          entityType: "task",
          entityId: r.id,
          action: "status_changed",
          meta: { from: r.old_status, to: "backlog", reason: "deadline_passed", title: r.title },
        });
      }
    });
    // Board cache + realtime fan-out per task (best-effort, post-commit).
    for (const r of swept) {
      await invalidatePrefix(cacheKey("boards", N.tenant, tenantId, r.project_id));
      void emitEvent({
        tenantId,
        type: "task.deadline_swept",
        entityType: "task",
        entityId: r.id,
        meta: { from: r.old_status, to: "backlog", title: r.title, projectId: r.project_id },
      });
    }
  }
  return rows.length;
}
