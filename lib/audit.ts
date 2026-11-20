import { query } from "@/lib/db";

/**
 * The audit trail.
 *
 * Every status change, seat correction, station change and account change
 * is written here with the account that made it. The counter role cannot
 * write to this table, so passenger events are logged in the PassengerEvent
 * table itself instead, which also records who counted and when.
 */

export interface AuditEntry {
  userId?: number | null;
  userName?: string | null;
  action: string;
  entityType: string;
  entityId?: number | null;
  reason?: string | null;
  details?: unknown;
}

export async function logActivity(entry: AuditEntry): Promise<void> {
  await query(
    `INSERT INTO "ActivityLog"
       ("userId", "userName", action, "entityType", "entityId", reason, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      entry.userId ?? null,
      entry.userName ?? null,
      entry.action,
      entry.entityType,
      entry.entityId ?? null,
      entry.reason ?? null,
      entry.details === undefined ? null : JSON.stringify(entry.details),
    ],
  );
}

/**
 * The counter role has no permission on the activity log, so a failed audit
 * write must never break a login or a counting tap. The PassengerEvent row
 * is the audit trail for counting.
 */
export async function logActivitySafe(entry: AuditEntry): Promise<void> {
  try {
    await logActivity(entry);
  } catch {
    // Intentionally ignored. The counting event itself is already logged.
  }
}
