/** Audit log writer — append-only, tenant-scoped. Every mutating/admin action
 * writes before/after shapes inside the SAME transaction as the change, so the
 * audit trail can never diverge from the mutation it records. */
import type { Tx } from "./tenant.js";
import { auditLogs } from "../db/schema.js";
import { uuidv7 } from "./ids.js";

export interface AuditEntry {
  tenantId: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  ip?: string;
}

export async function audit(tx: Tx, entry: AuditEntry): Promise<void> {
  await tx.insert(auditLogs).values({
    id: uuidv7(),
    tenantId: entry.tenantId,
    actorId: entry.actorId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    before: entry.before ?? null,
    after: entry.after ?? null,
    ip: entry.ip,
  });
}