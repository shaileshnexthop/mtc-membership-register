import "server-only";
import { and, eq, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { audit } from "./audit";
import { sendEmail } from "./mail";
import { appBaseUrl } from "./config";
import { muDate } from "./business-days";
import { formatDateFr } from "./format";
import { getSettings } from "./settings";
import { deleteObject } from "./storage";
import { addPeriods } from "./dues";
import { applicationClosedEmail, applicationClosureWarningEmail } from "./email-templates";

/**
 * ADM-06: data retention for applications that go nowhere.
 *
 * A deferred or rejected application is closed after `closeAfterDays` (the
 * applicant of a deferred one is warned `warnDaysBefore` days ahead and told when
 * it closes). A closed application is deleted `deleteAfterDays` later, with its
 * KYC files, sponsors and history. What remains is an `application_records` row —
 * name, outcome and reason — kept for reports for `keepRecordMonths`, then purged.
 * The audit log is never touched.
 */

export type RetentionRules = {
  closeAfterDays: number;
  warnDaysBefore: number;
  deleteAfterDays: number;
  keepRecordMonths: number;
};

export const RETENTION_DEFAULTS: RetentionRules = {
  closeAfterDays: 60,
  warnDaysBefore: 14,
  deleteAfterDays: 30,
  keepRecordMonths: 18,
};

export async function retentionRules(): Promise<RetentionRules> {
  const s = await getSettings([
    "application_close_after_days",
    "application_close_warning_days",
    "application_delete_after_days",
    "application_record_retention_months",
  ]);
  const num = (v: unknown, d: number) => (Number.isInteger(Number(v)) && v !== null && v !== "" ? Number(v) : d);
  return {
    closeAfterDays: num(s.application_close_after_days, RETENTION_DEFAULTS.closeAfterDays),
    warnDaysBefore: num(s.application_close_warning_days, RETENTION_DEFAULTS.warnDaysBefore),
    deleteAfterDays: num(s.application_delete_after_days, RETENTION_DEFAULTS.deleteAfterDays),
    keepRecordMonths: Math.max(18, num(s.application_record_retention_months, RETENTION_DEFAULTS.keepRecordMonths)),
  };
}

/** A Mauritius calendar date (YYYY-MM-DD) `days` after the given moment. */
export function muDatePlus(at: Date, days: number): string {
  const d = new Date(`${muDate(at)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** When a deferred or rejected application closes: `closeAfterDays` after the decision. */
export function closesOn(app: { decidedAt: Date | null; updatedAt: Date }, rules: RetentionRules): string {
  return muDatePlus(app.decidedAt ?? app.updatedAt, rules.closeAfterDays);
}

/** When a closed application is deleted. */
export function deletesOn(closedAt: Date, rules: RetentionRules): string {
  return muDatePlus(closedAt, rules.deleteAfterDays);
}

async function contact(accountId: string) {
  const [acc] = await getDb().select().from(schema.accounts).where(eq(schema.accounts.id, accountId)).limit(1);
  return acc ?? null;
}

const fullName = (app: { firstNames: string | null; lastName: string | null }, fallback: string) =>
  `${app.firstNames ?? ""} ${app.lastName ?? ""}`.trim() || fallback;

/** Warn applicants whose deferred application will close soon (once per deferral). */
export async function sendClosureWarnings(now: Date): Promise<number> {
  const rules = await retentionRules();
  if (rules.warnDaysBefore <= 0) return 0;
  const today = muDate(now);
  const db = getDb();
  const rows = await db.select().from(schema.applications).where(eq(schema.applications.status, "deferred"));
  let n = 0;
  for (const app of rows) {
    const decided = app.decidedAt ?? app.updatedAt;
    // Already warned about this deferral (a later deferral needs a new warning).
    if (app.closureWarnedAt && app.closureWarnedAt >= decided) continue;
    const closes = closesOn(app, rules);
    const warnFrom = muDatePlus(new Date(`${closes}T12:00:00Z`), -rules.warnDaysBefore);
    if (today < warnFrom || today >= closes) continue;
    const acc = await contact(app.accountId);
    await db.update(schema.applications).set({ closureWarnedAt: now }).where(eq(schema.applications.id, app.id));
    if (!acc) continue;
    const mail = applicationClosureWarningEmail({
      name: fullName(app, acc.fullName),
      reference: app.reference,
      closesOn: formatDateFr(closes),
      deleteAfterDays: rules.deleteAfterDays,
      link: `${appBaseUrl()}/candidature`,
    });
    await sendEmail({ to: acc.email, templateKey: "application_closure_warning", applicationId: app.id, ...mail });
    n++;
  }
  return n;
}

/** Close deferred and rejected applications whose period has run out. */
export async function closeStaleApplications(now: Date): Promise<number> {
  const rules = await retentionRules();
  const today = muDate(now);
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.applications)
    .where(inArray(schema.applications.status, ["deferred", "rejected"]));
  let n = 0;
  for (const app of rows) {
    if (today < closesOn(app, rules)) continue;
    const from = app.status as "deferred" | "rejected";
    const updated = await db
      .update(schema.applications)
      .set({ status: "closed", closedAt: now, closedFromStatus: from, updatedAt: now })
      .where(and(eq(schema.applications.id, app.id), eq(schema.applications.status, from)))
      .returning({ id: schema.applications.id });
    if (!updated.length) continue;
    n++;
    const deletes = deletesOn(now, rules);
    await db.insert(schema.applicationEvents).values({
      applicationId: app.id,
      actorType: "system",
      eventType: "closed",
      subject: "Candidature clôturée",
      comment: `Clôturée automatiquement ${rules.closeAfterDays} jours après la décision. Dossier et documents supprimés le ${formatDateFr(deletes)}.`,
      fromStatus: from,
      toStatus: "closed",
    });
    await audit({
      actorType: "system",
      action: "application.closed",
      entityType: "application",
      entityId: app.id,
      details: { reference: app.reference, from, afterDays: rules.closeAfterDays, deletesOn: deletes },
    });
    // A rejected applicant has already been given the Club's final answer; only deferred ones are told.
    if (from === "deferred") {
      const acc = await contact(app.accountId);
      if (acc) {
        const mail = applicationClosedEmail({
          name: fullName(app, acc.fullName),
          reference: app.reference,
          deletesOn: formatDateFr(deletes),
          link: `${appBaseUrl()}/candidature`,
        });
        await sendEmail({ to: acc.email, templateKey: "application_closed", applicationId: app.id, ...mail });
      }
    }
  }
  return n;
}

/**
 * Delete closed applications whose period has run out: KYC files first (from the
 * private store), then the application with its sponsors, documents and history,
 * leaving the record for reports. A file that cannot be deleted stops that
 * application's deletion until the next run, so nothing is left orphaned.
 */
export async function deleteClosedApplications(now: Date): Promise<{ deleted: number; files: number; failed: number }> {
  const rules = await retentionRules();
  const today = muDate(now);
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.applications)
    .where(and(eq(schema.applications.status, "closed"), isNotNull(schema.applications.closedAt)));
  const result = { deleted: 0, files: 0, failed: 0 };
  for (const app of rows) {
    if (today < deletesOn(app.closedAt!, rules)) continue;

    const docs = await db
      .select({ id: schema.documents.id, storageKey: schema.documents.storageKey })
      .from(schema.documents)
      .where(and(eq(schema.documents.applicationId, app.id), isNull(schema.documents.memberId)));
    let filesOk = true;
    for (const d of docs) {
      try {
        await deleteObject(d.storageKey);
      } catch (e) {
        filesOk = false;
        console.error(`[retention] could not delete ${d.storageKey} of ${app.reference}:`, e);
      }
    }
    if (!filesOk) {
      result.failed++;
      continue;
    }

    const [type] = app.membershipTypeId
      ? await db.select({ name: schema.membershipTypes.name }).from(schema.membershipTypes).where(eq(schema.membershipTypes.id, app.membershipTypeId)).limit(1)
      : [];
    const [decider] = app.decidedById
      ? await db.select({ name: schema.staffUsers.displayName }).from(schema.staffUsers).where(eq(schema.staffUsers.id, app.decidedById)).limit(1)
      : [];
    const outcome = app.closedFromStatus === "rejected" ? "rejected" : "deferred";
    const retainUntil = addPeriods(today, rules.keepRecordMonths, "monthly");

    const deleted = await db.transaction(async (tx) => {
      const [locked] = await tx
        .select({ id: schema.applications.id })
        .from(schema.applications)
        .where(and(eq(schema.applications.id, app.id), eq(schema.applications.status, "closed")))
        .for("update")
        .limit(1);
      if (!locked) return false; // reopened meanwhile
      await tx
        .insert(schema.applicationRecords)
        .values({
          id: app.id,
          reference: app.reference,
          lastName: app.lastName,
          firstNames: app.firstNames,
          membershipTypeName: type?.name ?? null,
          outcome,
          reason: app.decisionComment,
          receivedAt: app.receivedAt,
          decidedAt: app.decidedAt,
          decidedByName: decider?.name ?? (app.decidedAt && !app.decidedById ? "Automatic" : null),
          closedAt: app.closedAt,
          deletedAt: now,
          retainUntil,
        })
        .onConflictDoNothing();
      // Payments and the email log are the Club's financial and delivery records: they stay, unlinked.
      await tx.update(schema.payments).set({ applicationId: null }).where(eq(schema.payments.applicationId, app.id));
      await tx.update(schema.emailLog).set({ applicationId: null }).where(eq(schema.emailLog.applicationId, app.id));
      await tx.update(schema.documents).set({ applicationId: null }).where(and(eq(schema.documents.applicationId, app.id), isNotNull(schema.documents.memberId)));
      await tx.delete(schema.documents).where(eq(schema.documents.applicationId, app.id));
      // Sponsors and the application's history go with it (on delete cascade).
      await tx.delete(schema.applications).where(eq(schema.applications.id, app.id));
      return true;
    });
    if (!deleted) continue;
    result.deleted++;
    result.files += docs.length;
    await audit({
      actorType: "system",
      action: "application.deleted",
      entityType: "application",
      entityId: app.id,
      details: { reference: app.reference, outcome, documentsDeleted: docs.length, recordKeptUntil: retainUntil },
    });
  }
  return result;
}

/** Purge the records of deleted applications once their retention period is over. */
export async function purgeExpiredRecords(now: Date): Promise<number> {
  const today = muDate(now);
  const purged = await getDb()
    .delete(schema.applicationRecords)
    .where(lt(schema.applicationRecords.retainUntil, today))
    .returning({ reference: schema.applicationRecords.reference });
  if (purged.length) {
    await audit({
      actorType: "system",
      action: "application.records_purged",
      entityType: "application_record",
      details: { count: purged.length, references: purged.map((p) => p.reference) },
    });
  }
  return purged.length;
}
