import "server-only";
import { and, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { audit } from "./audit";
import { sendEmail } from "./mail";
import { appBaseUrl } from "./config";
import { businessDaysAfter, muDate, muHour } from "./business-days";
import { formatDateEn, formatDateFr } from "./format";
import { getBankDetails, getSettings } from "./settings";
import { applyDueUpgrades, feeLabelEn, feeLabelFr, staffWithRole, todayMu } from "./members";
import {
  applicationDeferredEmail,
  membershipLapsedEmail,
  paymentReminderEmail,
  upgradeRequestedStaffEmail,
} from "./email-templates";

/**
 * The scheduled job (PAY-05, PAY-06, UPG-07, REN-04). Runs every hour from the
 * `scheduler` container and is safe to run any number of times: each step checks
 * what has already been done. Reminder emails go out only in office hours (08:00–18:00).
 */
export async function runDailyJob(now = new Date()) {
  const officeHours = muHour(now) >= 8 && muHour(now) < 18;
  const summary = {
    upgradesApplied: await applyDueUpgrades(),
    deferred: await deferUnpaidApplications(now),
    paymentReminders: officeHours ? await sendPaymentReminders(now) : 0,
    upgradeReminders: officeHours ? await sendUpgradeReminders(now) : 0,
    renewalDue: await markRenewalDue(),
    lapsed: officeHours ? await lapseAfterGrace() : 0,
  };
  return summary;
}

async function deadlineDays(): Promise<number> {
  const s = await getSettings(["payment_deadline_business_days"]);
  return Number(s.payment_deadline_business_days ?? 3) || 3;
}

/** PAY-05: approved applications not paid by the deadline are deferred with the fixed reason. */
async function deferUnpaidApplications(now: Date): Promise<number> {
  const db = getDb();
  const reason = `Payment not processed within ${await deadlineDays()} business days`;
  const overdue = await db
    .select()
    .from(schema.applications)
    .where(and(eq(schema.applications.status, "approved"), lt(schema.applications.paymentDueAt, now)));
  let n = 0;
  for (const app of overdue) {
    const updated = await db
      .update(schema.applications)
      .set({ status: "deferred", decisionComment: reason, decidedAt: now, decidedById: null, paymentDueAt: null, updatedAt: now })
      .where(and(eq(schema.applications.id, app.id), eq(schema.applications.status, "approved")))
      .returning({ id: schema.applications.id });
    if (!updated.length) continue;
    n++;
    await db.insert(schema.applicationEvents).values({
      applicationId: app.id,
      actorType: "system",
      eventType: "deferred",
      subject: "Candidature différée automatiquement",
      comment: reason,
      fromStatus: "approved",
      toStatus: "deferred",
    });
    await audit({ actorType: "system", action: "application.deferred_unpaid", entityType: "application", entityId: app.id, details: { reason } });
    const [acc] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, app.accountId)).limit(1);
    if (acc) {
      const mail = applicationDeferredEmail(
        `${app.firstNames ?? ""} ${app.lastName ?? ""}`.trim() || acc.fullName,
        app.reference,
        reason,
        `${appBaseUrl()}/candidature`,
        true,
      );
      await sendEmail({ to: acc.email, templateKey: "application_deferred_unpaid", applicationId: app.id, ...mail });
    }
  }
  return n;
}

/** PAY-06: reminders on the configured business days after approval (once per day each). */
async function sendPaymentReminders(now: Date): Promise<number> {
  const db = getDb();
  const s = await getSettings(["payment_reminder_business_days"]);
  const days = Array.isArray(s.payment_reminder_business_days) ? (s.payment_reminder_business_days as number[]) : [2, 3];
  const deadline = await deadlineDays();
  const today = muDate(now);
  const apps = await db
    .select({
      app: schema.applications,
      email: schema.accounts.email,
      fullName: schema.accounts.fullName,
      feeCents: schema.membershipTypes.feeCents,
      feePeriod: schema.membershipTypes.feePeriod,
      remindedToday: sql<boolean>`exists (select 1 from email_log e where e.application_id = ${schema.applications.id}
        and e.template_key = 'payment_reminder' and (e.created_at at time zone 'Indian/Mauritius')::date = ${today}::date)`,
    })
    .from(schema.applications)
    .innerJoin(schema.accounts, eq(schema.accounts.id, schema.applications.accountId))
    .leftJoin(schema.membershipTypes, eq(schema.membershipTypes.id, schema.applications.membershipTypeId))
    .where(eq(schema.applications.status, "approved"));
  const bank = await getBankDetails();
  let n = 0;
  for (const row of apps) {
    if (row.remindedToday || !row.app.decidedAt || !row.app.paymentDueAt) continue;
    const day = await businessDaysAfter(muDate(row.app.decidedAt), today);
    if (!days.includes(day)) continue;
    const mail = paymentReminderEmail({
      name: `${row.app.firstNames ?? ""} ${row.app.lastName ?? ""}`.trim() || row.fullName,
      reference: row.app.reference,
      feeLabel: feeLabelFr(row.feeCents ?? 0, row.feePeriod ?? "monthly"),
      dueLabel: formatDateFr(row.app.paymentDueAt),
      ...bank,
      payLink: `${appBaseUrl()}/candidature/paiement`,
      lastDay: day >= deadline,
    });
    await sendEmail({ to: row.email, templateKey: "payment_reminder", applicationId: row.app.id, ...mail });
    n++;
  }
  return n;
}

/** UPG-07: pending changes not decided within 3 business days are re-sent to the Approvers daily. */
async function sendUpgradeReminders(now: Date): Promise<number> {
  const db = getDb();
  const today = muDate(now);
  const pending = await db
    .select({
      u: schema.upgradeRequests,
      m: schema.members,
      requester: schema.staffUsers.displayName,
    })
    .from(schema.upgradeRequests)
    .innerJoin(schema.members, eq(schema.members.id, schema.upgradeRequests.memberId))
    .innerJoin(schema.staffUsers, eq(schema.staffUsers.id, schema.upgradeRequests.requestedById))
    .where(eq(schema.upgradeRequests.status, "pending"));
  let n = 0;
  for (const { u, m, requester } of pending) {
    if ((await businessDaysAfter(muDate(u.requestedAt), today)) < 3) continue;
    if (u.lastReminderAt && muDate(u.lastReminderAt) === today) continue;
    const types = await db
      .select()
      .from(schema.membershipTypes)
      .where(inArray(schema.membershipTypes.id, [u.fromTypeId, u.toTypeId]));
    const from = types.find((t) => t.id === u.fromTypeId)!;
    const to = types.find((t) => t.id === u.toTypeId)!;
    const mail = upgradeRequestedStaffEmail({
      memberName: `${m.firstNames} ${m.lastName}`,
      memberNumber: m.memberNumber,
      fromType: from.name,
      toType: to.name,
      feeBefore: feeLabelEn(u.feeBeforeCents, from.feePeriod),
      feeAfter: feeLabelEn(u.feeAfterCents, to.feePeriod),
      effective: formatDateEn(u.effectiveDate),
      reason: u.reason,
      requestedBy: requester,
      link: `${appBaseUrl()}/staff/upgrades/${u.id}`,
      reminder: true,
    });
    for (const a of (await staffWithRole("approver")).filter((x) => x.id !== u.requestedById)) {
      await sendEmail({ to: a.email, templateKey: "upgrade_reminder", memberId: m.id, ...mail });
    }
    await db.update(schema.upgradeRequests).set({ lastReminderAt: now }).where(eq(schema.upgradeRequests.id, u.id));
    n++;
  }
  return n;
}

/** Active members whose next due date has passed become "renewal due". */
async function markRenewalDue(): Promise<number> {
  const db = getDb();
  const today = todayMu();
  const rows = await db
    .update(schema.members)
    .set({ status: "renewal_due", updatedAt: new Date() })
    .where(and(eq(schema.members.status, "active"), lt(schema.members.nextDueOn, today)))
    .returning({ id: schema.members.id, nextDueOn: schema.members.nextDueOn });
  if (rows.length) {
    await db.insert(schema.memberEvents).values(
      rows.map((r) => ({
        memberId: r.id,
        eventType: "renewal_due",
        title: "Renewal due",
        detail: `Dues due ${r.nextDueOn} not yet received`,
        actorType: "system" as const,
      })),
    );
  }
  return rows.length;
}

/** REN-04: members still unpaid after the grace period lapse and are told by email. */
async function lapseAfterGrace(): Promise<number> {
  const db = getDb();
  const s = await getSettings(["renewal_grace_days"]);
  const grace = Number(s.renewal_grace_days ?? 30) || 30;
  const cutoff = new Date(`${todayMu()}T12:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - grace);
  const rows = await db
    .update(schema.members)
    .set({ status: "lapsed", updatedAt: new Date() })
    .where(
      and(
        eq(schema.members.status, "renewal_due"),
        or(lte(schema.members.nextDueOn, cutoff.toISOString().slice(0, 10)), isNull(schema.members.nextDueOn)),
      ),
    )
    .returning();
  for (const m of rows) {
    await db.insert(schema.memberEvents).values({
      memberId: m.id,
      eventType: "lapsed",
      title: "Membership lapsed",
      detail: `Dues due ${m.nextDueOn ?? "—"} not received within ${grace} days`,
      actorType: "system",
    });
    await audit({ actorType: "system", action: "member.lapsed_unpaid", entityType: "member", entityId: m.id });
    const mail = membershipLapsedEmail({
      name: `${m.firstNames} ${m.lastName}`,
      memberNumber: m.memberNumber,
      dueLabel: m.nextDueOn ? formatDateFr(m.nextDueOn) : "—",
      link: `${appBaseUrl()}/espace`,
    });
    await sendEmail({ to: m.email, templateKey: "membership_lapsed", memberId: m.id, ...mail });
  }
  return rows.length;
}
