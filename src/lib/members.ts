import "server-only";
import { and, asc, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, schema } from "@/db";
import { muDate } from "./business-days";
import { audit } from "./audit";

export const MEMBER_STATUS_EN: Record<string, [string, "pillOk" | "pillWarn" | "pillBad" | "pillIdle"]> = {
  active: ["Active", "pillOk"],
  renewal_due: ["Renewal due", "pillWarn"],
  lapsed: ["Lapsed", "pillBad"],
  resigned: ["Resigned", "pillIdle"],
};

export const MEMBER_STATUS_FR: Record<string, string> = {
  active: "Actif",
  renewal_due: "Renouvellement à régler",
  lapsed: "Expiré",
  resigned: "Démissionnaire",
};

/** Whole months between two YYYY-MM-DD dates (day of month respected). */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  let m = (ty - fy) * 12 + (tm - fm);
  if (td < fd) m -= 1;
  return Math.max(0, m);
}

export function todayMu(): string {
  return muDate(new Date());
}

export function feeLabelEn(cents: number, period: string): string {
  if (cents <= 0) return "Fee to be confirmed";
  return `Rs ${(cents / 100).toLocaleString("en-MU", { minimumFractionDigits: 2 })} ${period === "annual" ? "per year" : "per month"}`;
}

export function feeLabelFr(cents: number, period: string): string {
  if (cents <= 0) return "[montant à confirmer]";
  return `Rs ${(cents / 100).toLocaleString("en-MU", { minimumFractionDigits: 2 })} ${period === "annual" ? "par an" : "par mois"}`;
}

/** Everything shown on a member's record (MEM-02 … MEM-10). */
export async function getMemberRecord(memberId: string) {
  const db = getDb();
  const [member] = await db.select().from(schema.members).where(eq(schema.members.id, memberId)).limit(1);
  if (!member) return null;

  const requester = alias(schema.staffUsers, "requester");
  const decider = alias(schema.staffUsers, "decider");
  const fromType = alias(schema.membershipTypes, "from_type");
  const toType = alias(schema.membershipTypes, "to_type");

  const [type, periods, events, payments, documents, emails, changes, upgrades, account] = await Promise.all([
    db.select().from(schema.membershipTypes).where(eq(schema.membershipTypes.id, member.membershipTypeId)).limit(1),
    db
      .select({
        id: schema.memberTypePeriods.id,
        startDate: schema.memberTypePeriods.startDate,
        endDate: schema.memberTypePeriods.endDate,
        feeCents: schema.memberTypePeriods.feeCents,
        typeName: schema.membershipTypes.name,
        feePeriod: schema.membershipTypes.feePeriod,
      })
      .from(schema.memberTypePeriods)
      .innerJoin(schema.membershipTypes, eq(schema.membershipTypes.id, schema.memberTypePeriods.membershipTypeId))
      .where(eq(schema.memberTypePeriods.memberId, memberId))
      .orderBy(asc(schema.memberTypePeriods.startDate)),
    db
      .select({
        id: schema.memberEvents.id,
        at: schema.memberEvents.at,
        eventType: schema.memberEvents.eventType,
        title: schema.memberEvents.title,
        detail: schema.memberEvents.detail,
        actorType: schema.memberEvents.actorType,
        staffName: schema.staffUsers.displayName,
      })
      .from(schema.memberEvents)
      .leftJoin(schema.staffUsers, eq(schema.staffUsers.id, schema.memberEvents.staffUserId))
      .where(eq(schema.memberEvents.memberId, memberId))
      .orderBy(desc(schema.memberEvents.at), desc(schema.memberEvents.id)),
    db
      .select()
      .from(schema.payments)
      .where(
        or(
          eq(schema.payments.memberId, memberId),
          member.applicationId ? eq(schema.payments.applicationId, member.applicationId) : sql`false`,
        ),
      )
      .orderBy(desc(schema.payments.createdAt)),
    db
      .select()
      .from(schema.documents)
      .where(and(eq(schema.documents.memberId, memberId), isNull(schema.documents.supersededAt)))
      .orderBy(asc(schema.documents.kind)),
    db
      .select()
      .from(schema.emailLog)
      .where(
        or(
          eq(schema.emailLog.memberId, memberId),
          member.applicationId ? eq(schema.emailLog.applicationId, member.applicationId) : sql`false`,
          eq(schema.emailLog.toEmail, member.email),
        ),
      )
      .orderBy(desc(schema.emailLog.createdAt))
      .limit(200),
    db
      .select({
        id: schema.memberDetailChanges.id,
        field: schema.memberDetailChanges.field,
        oldValue: schema.memberDetailChanges.oldValue,
        newValue: schema.memberDetailChanges.newValue,
        at: schema.memberDetailChanges.at,
        changedByType: schema.memberDetailChanges.changedByType,
        staffName: schema.staffUsers.displayName,
      })
      .from(schema.memberDetailChanges)
      .leftJoin(schema.staffUsers, eq(schema.staffUsers.id, schema.memberDetailChanges.changedByStaffId))
      .where(eq(schema.memberDetailChanges.memberId, memberId))
      .orderBy(desc(schema.memberDetailChanges.at)),
    db
      .select({
        id: schema.upgradeRequests.id,
        status: schema.upgradeRequests.status,
        effectiveDate: schema.upgradeRequests.effectiveDate,
        reason: schema.upgradeRequests.reason,
        feeBeforeCents: schema.upgradeRequests.feeBeforeCents,
        feeAfterCents: schema.upgradeRequests.feeAfterCents,
        requestedAt: schema.upgradeRequests.requestedAt,
        decidedAt: schema.upgradeRequests.decidedAt,
        decisionComment: schema.upgradeRequests.decisionComment,
        appliedAt: schema.upgradeRequests.appliedAt,
        fromName: fromType.name,
        toName: toType.name,
        requestedBy: requester.displayName,
        decidedBy: decider.displayName,
      })
      .from(schema.upgradeRequests)
      .innerJoin(fromType, eq(fromType.id, schema.upgradeRequests.fromTypeId))
      .innerJoin(toType, eq(toType.id, schema.upgradeRequests.toTypeId))
      .innerJoin(requester, eq(requester.id, schema.upgradeRequests.requestedById))
      .leftJoin(decider, eq(decider.id, schema.upgradeRequests.decidedById))
      .where(eq(schema.upgradeRequests.memberId, memberId))
      .orderBy(desc(schema.upgradeRequests.requestedAt)),
    member.accountId
      ? db
          .select({ email: schema.accounts.email, lastLoginAt: schema.accounts.lastLoginAt })
          .from(schema.accounts)
          .where(eq(schema.accounts.id, member.accountId))
          .limit(1)
      : Promise.resolve([]),
  ]);

  // MEM-08: only emails addressed to the member (staff notifications about them are excluded).
  const addresses = new Set(
    [member.email, account[0]?.email, ...changes.filter((c) => c.field === "email").map((c) => c.oldValue)]
      .filter(Boolean)
      .map((a) => String(a).toLowerCase()),
  );
  const memberEmails = emails.filter((e) => addresses.has(e.toEmail.toLowerCase()));

  const today = todayMu();
  const totalMonths = monthsBetween(member.memberSince, today);
  const continuousMonths = monthsBetween(member.continuousSince, today);
  const byType = new Map<string, number>();
  for (const p of periods) {
    if (p.startDate > today) continue;
    const end = p.endDate && p.endDate < today ? p.endDate : today;
    byType.set(p.typeName, (byType.get(p.typeName) ?? 0) + monthsBetween(p.startDate, end));
  }

  // MEM-07: arrears are estimated from the next due date until renewals are billed.
  const fee = member.currentFeeCents;
  const period = type[0]?.feePeriod ?? "monthly";
  let overduePeriods = 0;
  if (member.nextDueOn && member.nextDueOn < today && (member.status === "active" || member.status === "renewal_due")) {
    const m = monthsBetween(member.nextDueOn, today);
    overduePeriods = period === "annual" ? Math.floor(m / 12) + 1 : m + 1;
  }

  return {
    member,
    type: type[0] ?? null,
    account: account[0] ?? null,
    periods,
    events,
    payments,
    documents,
    emails: memberEmails,
    changes,
    upgrades,
    tenure: { totalMonths, continuousMonths, byType: [...byType] },
    arrears: { overduePeriods, amountCents: overduePeriods * fee },
  };
}

export type MemberRecord = NonNullable<Awaited<ReturnType<typeof getMemberRecord>>>;

/**
 * UPG-06: approved type changes take effect on their effective date. Runs whenever
 * the members or upgrades screens load (and from the daily job once it exists),
 * so a change approved for a future date is applied on that date.
 */
export async function applyDueUpgrades(): Promise<number> {
  const db = getDb();
  const today = todayMu();
  const due = await db
    .select()
    .from(schema.upgradeRequests)
    .where(
      and(
        eq(schema.upgradeRequests.status, "approved"),
        isNull(schema.upgradeRequests.appliedAt),
        lte(schema.upgradeRequests.effectiveDate, today),
      ),
    );
  let applied = 0;
  for (const u of due) {
    const done = await db.transaction(async (tx) => {
      const claimed = await tx
        .update(schema.upgradeRequests)
        .set({ appliedAt: new Date() })
        .where(and(eq(schema.upgradeRequests.id, u.id), isNull(schema.upgradeRequests.appliedAt)))
        .returning({ id: schema.upgradeRequests.id });
      if (!claimed.length) return false;
      const [toType] = await tx
        .select()
        .from(schema.membershipTypes)
        .where(eq(schema.membershipTypes.id, u.toTypeId))
        .limit(1);
      await tx
        .update(schema.memberTypePeriods)
        .set({ endDate: u.effectiveDate })
        .where(and(eq(schema.memberTypePeriods.memberId, u.memberId), isNull(schema.memberTypePeriods.endDate)));
      await tx.insert(schema.memberTypePeriods).values({
        memberId: u.memberId,
        membershipTypeId: u.toTypeId,
        startDate: u.effectiveDate,
        feeCents: u.feeAfterCents,
      });
      await tx
        .update(schema.members)
        .set({ membershipTypeId: u.toTypeId, currentFeeCents: u.feeAfterCents, updatedAt: new Date() })
        .where(eq(schema.members.id, u.memberId));
      await tx.insert(schema.memberEvents).values({
        memberId: u.memberId,
        at: new Date(`${u.effectiveDate}T00:00:00+04:00`),
        eventType: "type_changed",
        title: `Membership type changed to ${toType?.name ?? "new type"}`,
        detail: `Fee ${feeLabelEn(u.feeBeforeCents, toType?.feePeriod ?? "monthly")} → ${feeLabelEn(u.feeAfterCents, toType?.feePeriod ?? "monthly")}`,
        actorType: "system",
        data: { upgradeRequestId: u.id },
      });
      return true;
    });
    if (done) {
      applied++;
      await audit({
        actorType: "system",
        action: "upgrade.applied",
        entityType: "member",
        entityId: u.memberId,
        details: { upgradeRequestId: u.id, effectiveDate: u.effectiveDate },
      });
    }
  }
  return applied;
}

/** Staff with a given role, for notification emails (UPG-03). */
export async function staffWithRole(role: "approver" | "administrator" | "finance" | "reviewer") {
  return getDb()
    .select({ id: schema.staffUsers.id, email: schema.staffUsers.email, name: schema.staffUsers.displayName })
    .from(schema.staffUsers)
    .where(sql`${role} = any(${schema.staffUsers.roles})`);
}

export async function activeMembershipTypes() {
  return getDb()
    .select()
    .from(schema.membershipTypes)
    .where(eq(schema.membershipTypes.active, true))
    .orderBy(asc(schema.membershipTypes.sortOrder));
}

export async function pendingUpgradeCount(): Promise<number> {
  const [r] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.upgradeRequests)
    .where(inArray(schema.upgradeRequests.status, ["pending"]));
  return r?.n ?? 0;
}
