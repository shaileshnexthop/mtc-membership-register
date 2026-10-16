import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, schema } from "@/db";
import { monthsBetween, todayMu } from "./members";

/** Finance views (REN-06, RPT-01): money in, money expected, and who is behind. */

export const PAYMENT_VIEWS = [
  { key: "received", label: "Payments received" },
  { key: "awaiting", label: "Joining fees awaiting payment" },
  { key: "dues", label: "Dues overdue or due within 14 days" },
  { key: "lapsed", label: "Lapsed members" },
  { key: "card", label: "Card payments not completed" },
] as const;
export type PaymentView = (typeof PAYMENT_VIEWS)[number]["key"];

export const METHOD_EN: Record<string, string> = {
  card: "Card (Peach Payments)",
  mips: "MIPS",
  bank_transfer: "Bank transfer",
  cash: "Cash",
  cheque: "Cheque",
};
export const PURPOSE_EN: Record<string, string> = {
  joining: "Joining fee",
  dues: "Membership dues",
  renewal: "Renewal",
  upgrade_adjustment: "Type change adjustment",
};

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const isoDate = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");

export type PaymentFilters = {
  view: PaymentView;
  from: string;
  to: string;
  method: string;
  purpose: string;
  q: string;
};

export function parsePaymentFilters(p: Params): PaymentFilters {
  const today = todayMu();
  const view = (PAYMENT_VIEWS.find((v) => v.key === one(p.view))?.key ?? "received") as PaymentView;
  return {
    view,
    from: isoDate(one(p.from)) || `${today.slice(0, 8)}01`,
    to: isoDate(one(p.to)) || today,
    method: one(p.method) in METHOD_EN ? one(p.method) : "",
    purpose: one(p.purpose) in PURPOSE_EN ? one(p.purpose) : "",
    q: one(p.q).trim().slice(0, 100),
  };
}

export function paymentFiltersQuery(f: PaymentFilters): string {
  const u = new URLSearchParams({ view: f.view });
  if (f.view === "received") {
    u.set("from", f.from);
    u.set("to", f.to);
    if (f.method) u.set("method", f.method);
    if (f.purpose) u.set("purpose", f.purpose);
  }
  if (f.q) u.set("q", f.q);
  return u.toString();
}

export function describePaymentFilters(f: PaymentFilters): string {
  const parts: string[] = [PAYMENT_VIEWS.find((v) => v.key === f.view)!.label];
  if (f.view === "received") {
    parts.push(`paid ${f.from} to ${f.to}`);
    if (f.method) parts.push(METHOD_EN[f.method]);
    if (f.purpose) parts.push(PURPOSE_EN[f.purpose]);
  }
  if (f.q) parts.push(`matching “${f.q}”`);
  return parts.join(" · ");
}

const like = (q: string) => `%${q}%`;

export async function receivedPayments(f: PaymentFilters) {
  const db = getDb();
  const p = schema.payments;
  const recorder = alias(schema.staffUsers, "recorder");
  const where: SQL[] = [
    inArray(p.status, ["paid", "refunded"]),
    gte(p.paidAt, new Date(`${f.from}T00:00:00+04:00`)),
    lte(p.paidAt, new Date(`${f.to}T23:59:59+04:00`)),
  ];
  if (f.method) where.push(eq(p.method, f.method as (typeof p.method.enumValues)[number]));
  if (f.purpose) where.push(eq(p.purpose, f.purpose as (typeof p.purpose.enumValues)[number]));
  if (f.q) {
    where.push(
      or(
        ilike(schema.members.memberNumber, like(f.q)),
        ilike(schema.members.lastName, like(f.q)),
        ilike(schema.applications.reference, like(f.q)),
        ilike(schema.applications.lastName, like(f.q)),
        ilike(p.reference, like(f.q)),
      )!,
    );
  }
  return db
    .select({
      id: p.id,
      paidAt: p.paidAt,
      amountCents: p.amountCents,
      status: p.status,
      method: p.method,
      purpose: p.purpose,
      reference: p.reference,
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      failureReason: p.failureReason,
      memberId: schema.members.id,
      memberNumber: schema.members.memberNumber,
      memberName: sql<string | null>`${schema.members.lastName} || ', ' || ${schema.members.firstNames}`,
      applicationId: schema.applications.id,
      appReference: schema.applications.reference,
      appName: sql<string | null>`${schema.applications.lastName} || ', ' || ${schema.applications.firstNames}`,
      recordedBy: recorder.displayName,
    })
    .from(p)
    .leftJoin(schema.members, eq(schema.members.id, p.memberId))
    .leftJoin(schema.applications, eq(schema.applications.id, p.applicationId))
    .leftJoin(recorder, eq(recorder.id, p.recordedById))
    .where(and(...where))
    .orderBy(desc(p.paidAt))
    .limit(5000);
}

export async function awaitingJoining(f: PaymentFilters) {
  const db = getDb();
  const a = schema.applications;
  const where: SQL[] = [eq(a.status, "approved")];
  if (f.q) where.push(or(ilike(a.reference, like(f.q)), ilike(a.lastName, like(f.q)), ilike(schema.accounts.email, like(f.q)))!);
  const rows = await db
    .select({
      id: a.id,
      reference: a.reference,
      lastName: a.lastName,
      firstNames: a.firstNames,
      email: schema.accounts.email,
      mobile: a.mobilePhone,
      typeName: schema.membershipTypes.name,
      feeCents: schema.membershipTypes.feeCents,
      decidedAt: a.decidedAt,
      paymentDueAt: a.paymentDueAt,
      cardAttempts: sql<number>`(select count(*)::int from payments p where p.application_id = ${a.id} and p.method = 'card')`,
      remindersSent: sql<number>`(select count(*)::int from email_log e where e.application_id = ${a.id} and e.template_key = 'payment_reminder')`,
    })
    .from(a)
    .innerJoin(schema.accounts, eq(schema.accounts.id, a.accountId))
    .leftJoin(schema.membershipTypes, eq(schema.membershipTypes.id, a.membershipTypeId))
    .where(and(...where))
    .orderBy(asc(a.paymentDueAt));
  return rows;
}

export async function duesMembers(f: PaymentFilters) {
  const db = getDb();
  const m = schema.members;
  const today = todayMu();
  const soon = new Date(`${today}T12:00:00Z`);
  soon.setUTCDate(soon.getUTCDate() + 14);
  const where: SQL[] = [
    inArray(m.status, ["active", "renewal_due"]),
    isNotNull(m.nextDueOn),
    lte(m.nextDueOn, soon.toISOString().slice(0, 10)),
  ];
  if (f.q) where.push(or(ilike(m.memberNumber, like(f.q)), ilike(m.lastName, like(f.q)), ilike(m.email, like(f.q)))!);
  const rows = await db
    .select({
      id: m.id,
      memberNumber: m.memberNumber,
      lastName: m.lastName,
      firstNames: m.firstNames,
      email: m.email,
      mobile: m.mobilePhone,
      status: m.status,
      feeCents: m.currentFeeCents,
      nextDueOn: m.nextDueOn,
      typeName: schema.membershipTypes.name,
      feePeriod: schema.membershipTypes.feePeriod,
      lastPaidAt: sql<Date | null>`(select max(p.paid_at) from payments p where p.member_id = ${m.id} and p.status = 'paid')`,
    })
    .from(m)
    .innerJoin(schema.membershipTypes, eq(schema.membershipTypes.id, m.membershipTypeId))
    .where(and(...where))
    .orderBy(asc(m.nextDueOn), asc(m.lastName));
  return rows.map((r) => {
    const overdue = r.nextDueOn! < today;
    const months = overdue ? monthsBetween(r.nextDueOn!, today) : 0;
    const periods = overdue ? (r.feePeriod === "annual" ? Math.floor(months / 12) + 1 : months + 1) : 0;
    return { ...r, overdue, periods, arrearsCents: periods * r.feeCents };
  });
}

export async function lapsedMembers(f: PaymentFilters) {
  const db = getDb();
  const m = schema.members;
  const where: SQL[] = [eq(m.status, "lapsed")];
  if (f.q) where.push(or(ilike(m.memberNumber, like(f.q)), ilike(m.lastName, like(f.q)), ilike(m.email, like(f.q)))!);
  return db
    .select({
      id: m.id,
      memberNumber: m.memberNumber,
      lastName: m.lastName,
      firstNames: m.firstNames,
      email: m.email,
      mobile: m.mobilePhone,
      feeCents: m.currentFeeCents,
      nextDueOn: m.nextDueOn,
      memberSince: m.memberSince,
      typeName: schema.membershipTypes.name,
      lapsedAt: sql<Date | null>`(select max(e.at) from member_events e where e.member_id = ${m.id} and e.event_type = 'lapsed')`,
      lastPaidAt: sql<Date | null>`(select max(p.paid_at) from payments p where p.member_id = ${m.id} and p.status = 'paid')`,
    })
    .from(m)
    .innerJoin(schema.membershipTypes, eq(schema.membershipTypes.id, m.membershipTypeId))
    .where(and(...where))
    .orderBy(asc(m.lastName));
}

export async function incompleteCardPayments(f: PaymentFilters) {
  const db = getDb();
  const p = schema.payments;
  const where: SQL[] = [
    eq(p.method, "card"),
    ne(p.status, "paid"),
    gte(p.createdAt, sql`now() - interval '60 days'`),
  ];
  if (f.q) where.push(or(ilike(schema.applications.reference, like(f.q)), ilike(schema.applications.lastName, like(f.q)), ilike(p.reference, like(f.q)))!);
  return db
    .select({
      id: p.id,
      createdAt: p.createdAt,
      amountCents: p.amountCents,
      status: p.status,
      reference: p.reference,
      failureReason: p.failureReason,
      applicationId: schema.applications.id,
      appReference: schema.applications.reference,
      appStatus: schema.applications.status,
      lastName: schema.applications.lastName,
      firstNames: schema.applications.firstNames,
    })
    .from(p)
    .leftJoin(schema.applications, eq(schema.applications.id, p.applicationId))
    .where(and(...where))
    .orderBy(desc(p.createdAt))
    .limit(500);
}

/** Headline figures for the Payments screen. */
export async function paymentHeadlines() {
  const db = getDb();
  const today = todayMu();
  const monthStart = `${today.slice(0, 8)}01`;
  const [received] = await db
    .select({
      n: sql<number>`count(*)::int`,
      cents: sql<number>`coalesce(sum(${schema.payments.amountCents}), 0)::bigint`,
    })
    .from(schema.payments)
    .where(and(eq(schema.payments.status, "paid"), gte(schema.payments.paidAt, new Date(`${monthStart}T00:00:00+04:00`))));
  const awaiting = await awaitingJoining({ view: "awaiting", from: "", to: "", method: "", purpose: "", q: "" });
  const dues = (await duesMembers({ view: "dues", from: "", to: "", method: "", purpose: "", q: "" })).filter((d) => d.overdue);
  const [lapsed] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.members)
    .where(eq(schema.members.status, "lapsed"));
  const [card] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.payments)
    .where(and(eq(schema.payments.method, "card"), ne(schema.payments.status, "paid"), gte(schema.payments.createdAt, sql`now() - interval '60 days'`)));
  return {
    receivedCount: received.n,
    receivedCents: Number(received.cents),
    awaitingCount: awaiting.length,
    awaitingCents: awaiting.reduce((t, a) => t + (a.feeCents ?? 0), 0),
    overdueCount: dues.length,
    overdueCents: dues.reduce((t, d) => t + d.arrearsCents, 0),
    lapsedCount: lapsed.n,
    cardCount: card.n,
  };
}
