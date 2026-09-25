import "server-only";
import { getDb, schema } from "@/db";

type AuditEntry = {
  actorType: "system" | "applicant" | "member" | "staff";
  action: string;
  entityType: string;
  entityId?: string | null;
  accountId?: string | null;
  staffUserId?: string | null;
  ip?: string | null;
  details?: Record<string, unknown>;
};

/** Append-only audit log (ADM-05). Never throws: auditing must not break the user's action. */
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await getDb()
      .insert(schema.auditLog)
      .values({
        actorType: entry.actorType,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        accountId: entry.accountId ?? null,
        staffUserId: entry.staffUserId ?? null,
        ip: entry.ip ?? null,
        details: entry.details ?? null,
      });
  } catch (err) {
    console.error("audit log write failed", err);
  }
}
