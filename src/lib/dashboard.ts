import "server-only";
import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { todayMu } from "./members";
import { paymentHeadlines } from "./payments-data";

/** ADM-03: the figures on the staff overview. */
export async function dashboardData() {
  const db = getDb();
  const today = todayMu();
  const monthStart = new Date(`${today.slice(0, 8)}01T00:00:00+04:00`);
  const sixAgo = new Date(`${today.slice(0, 8)}01T00:00:00+04:00`);
  sixAgo.setUTCMonth(sixAgo.getUTCMonth() - 5);

  const appCounts = await db
    .select({ status: schema.applications.status, n: sql<number>`count(*)::int` })
    .from(schema.applications)
    .groupBy(schema.applications.status);
  const app = (k: string) => appCounts.find((c) => c.status === k)?.n ?? 0;

  const [decidedThisMonth] = await db
    .select({
      approved: sql<number>`count(*) filter (where ${schema.applications.status} in ('approved','admitted'))::int`,
      deferred: sql<number>`count(*) filter (where ${schema.applications.status} = 'deferred')::int`,
      rejected: sql<number>`count(*) filter (where ${schema.applications.status} = 'rejected')::int`,
    })
    .from(schema.applications)
    .where(gte(schema.applications.decidedAt, monthStart));

  const memberCounts = await db
    .select({ status: schema.members.status, n: sql<number>`count(*)::int` })
    .from(schema.members)
    .groupBy(schema.members.status);
  const mem = (k: string) => memberCounts.find((c) => c.status === k)?.n ?? 0;

  const received = await db
    .select({
      m: sql<string>`to_char(date_trunc('month', ${schema.applications.receivedAt} at time zone 'Indian/Mauritius'), 'YYYY-MM')`,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.applications)
    .where(gte(schema.applications.receivedAt, sixAgo))
    .groupBy(sql`1`);
  const admitted = await db
    .select({
      m: sql<string>`to_char(date_trunc('month', ${schema.applications.admittedAt} at time zone 'Indian/Mauritius'), 'YYYY-MM')`,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.applications)
    .where(gte(schema.applications.admittedAt, sixAgo))
    .groupBy(sql`1`);
  const money = await db
    .select({
      m: sql<string>`to_char(date_trunc('month', ${schema.payments.paidAt} at time zone 'Indian/Mauritius'), 'YYYY-MM')`,
      cents: sql<number>`sum(${schema.payments.amountCents})::bigint`,
    })
    .from(schema.payments)
    .where(and(eq(schema.payments.status, "paid"), gte(schema.payments.paidAt, sixAgo)))
    .groupBy(sql`1`);

  const months: string[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(sixAgo);
    d.setUTCMonth(d.getUTCMonth() + i);
    const local = new Date(d.getTime() + 4 * 3600 * 1000);
    months.push(local.toISOString().slice(0, 7));
  }
  const series = months.map((m) => ({
    month: m,
    received: received.find((r) => r.m === m)?.n ?? 0,
    admitted: admitted.find((r) => r.m === m)?.n ?? 0,
    cents: Number(money.find((r) => r.m === m)?.cents ?? 0),
  }));

  const oldestToReview = await db
    .select({
      id: schema.applications.id,
      reference: schema.applications.reference,
      lastName: schema.applications.lastName,
      firstNames: schema.applications.firstNames,
      receivedAt: schema.applications.lastSubmittedAt,
    })
    .from(schema.applications)
    .where(eq(schema.applications.status, "submitted"))
    .orderBy(asc(schema.applications.lastSubmittedAt))
    .limit(5);
  const dueSoon = await db
    .select({
      id: schema.applications.id,
      reference: schema.applications.reference,
      lastName: schema.applications.lastName,
      firstNames: schema.applications.firstNames,
      paymentDueAt: schema.applications.paymentDueAt,
    })
    .from(schema.applications)
    .where(inArray(schema.applications.status, ["approved"]))
    .orderBy(asc(schema.applications.paymentDueAt))
    .limit(5);

  const pay = await paymentHeadlines();
  const [{ n: pendingUpgrades }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.upgradeRequests)
    .where(eq(schema.upgradeRequests.status, "pending"));

  return {
    applications: {
      toReview: app("submitted"),
      awaitingPayment: app("approved"),
      deferredOpen: app("deferred"),
      drafts: app("draft"),
      ...decidedThisMonth,
    },
    members: { active: mem("active"), renewalDue: mem("renewal_due"), lapsed: mem("lapsed"), resigned: mem("resigned") },
    pay,
    pendingUpgrades,
    series,
    oldestToReview,
    dueSoon,
  };
}
