import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db";

/**
 * Reporting (RPT-01 … RPT-08). One set of filters drives the on-screen table,
 * the print view and the Excel/CSV exports, so all three always match (RPT-06).
 */

export type ReportKind = "applications" | "members";
type Params = Record<string, string | string[] | undefined>;

export const APPLICATION_STATUSES = [
  { key: "submitted", label: "In review" },
  { key: "approved", label: "Approved – awaiting payment" },
  { key: "admitted", label: "Approved – admitted (paid)" },
  { key: "deferred", label: "Deferred" },
  { key: "rejected", label: "Rejected" },
  { key: "draft", label: "Draft (not submitted)" },
] as const;

export const MEMBER_STATUSES = [
  { key: "active", label: "Active" },
  { key: "renewal_due", label: "Renewal due" },
  { key: "lapsed", label: "Lapsed" },
  { key: "resigned", label: "Resigned" },
] as const;

export const TENURE_OPTIONS = [
  { key: "", label: "Any length" },
  { key: "12", label: "At least 12 months" },
  { key: "24", label: "At least 24 months" },
  { key: "36", label: "At least 36 months" },
  { key: "60", label: "At least 5 years" },
  { key: "120", label: "At least 10 years" },
] as const;

/** One-click reports matching MTC's list. */
export const PRESETS: { key: string; label: string; title: string; href: string }[] = [
  { key: "active", label: "Active membership", title: "Active membership", href: "/staff/reports?report=members&status=active" },
  { key: "m12", label: "Active 12+ months", title: "Members active for 12 months or more", href: "/staff/reports?report=members&status=active&tenure=12" },
  { key: "m24", label: "Active 24+ months", title: "Members active for 24 months or more", href: "/staff/reports?report=members&status=active&tenure=24" },
  { key: "m36", label: "Active 36+ months", title: "Members active for 36 months or more", href: "/staff/reports?report=members&status=active&tenure=36" },
  { key: "approved", label: "Approved applications", title: "Approved membership applications", href: "/staff/reports?report=applications&status=approved&status=admitted" },
  { key: "deferred", label: "Deferred applications", title: "Deferred membership applications", href: "/staff/reports?report=applications&status=deferred" },
  { key: "rejected", label: "Rejected applications", title: "Rejected membership applications", href: "/staff/reports?report=applications&status=rejected" },
  { key: "inreview", label: "In review", title: "Membership applications in review", href: "/staff/reports?report=applications&status=submitted" },
];

/** Report title: the preset's name when the status/tenure filters match one, else a generic title. */
export function reportTitle(f: Filters): string {
  const core = (x: Filters) => filtersToQuery({ ...x, q: "", typeId: "", ...(x.report === "applications" ? { from: "", to: "" } : {}) } as Filters);
  const mine = core(f);
  for (const p of PRESETS) {
    const params: Params = {};
    for (const [k, v] of new URLSearchParams(p.href.split("?")[1])) {
      const prev = params[k];
      params[k] = prev === undefined ? v : [...(Array.isArray(prev) ? prev : [prev]), v];
    }
    if (core(parseFilters(params)) === mine) return p.title;
  }
  return f.report === "applications" ? "Membership applications" : "Members";
}

const list = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const isoDate = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");

export type ApplicationFilters = {
  report: "applications";
  statuses: string[];
  typeId: string;
  from: string;
  to: string;
  q: string;
};
export type MemberFilters = {
  report: "members";
  statuses: string[];
  typeId: string;
  tenure: string;
  basis: "continuous" | "total";
  q: string;
};
export type Filters = ApplicationFilters | MemberFilters;

export function parseFilters(p: Params): Filters {
  const report = one(p.report) === "applications" ? "applications" : "members";
  const typeId = /^[0-9a-f-]{36}$/i.test(one(p.type)) ? one(p.type) : "";
  const q = one(p.q).trim().slice(0, 100);
  if (report === "applications") {
    const allowed = APPLICATION_STATUSES.map((s) => s.key as string);
    const statuses = list(p.status).filter((s) => allowed.includes(s));
    return {
      report,
      statuses: statuses.length ? statuses : ["submitted", "approved", "admitted", "deferred", "rejected"],
      typeId,
      from: isoDate(one(p.from)),
      to: isoDate(one(p.to)),
      q,
    };
  }
  const allowed = MEMBER_STATUSES.map((s) => s.key as string);
  const statuses = list(p.status).filter((s) => allowed.includes(s));
  const tenure = TENURE_OPTIONS.some((t) => t.key === one(p.tenure)) ? one(p.tenure) : "";
  return {
    report,
    statuses: statuses.length ? statuses : ["active"],
    typeId,
    tenure,
    basis: one(p.basis) === "total" ? "total" : "continuous",
    q,
  };
}

/** Query string for the same filters, used by export links and presets. */
export function filtersToQuery(f: Filters): string {
  const u = new URLSearchParams({ report: f.report });
  for (const s of f.statuses) u.append("status", s);
  if (f.typeId) u.set("type", f.typeId);
  if (f.q) u.set("q", f.q);
  if (f.report === "applications") {
    if (f.from) u.set("from", f.from);
    if (f.to) u.set("to", f.to);
  } else {
    if (f.tenure) u.set("tenure", f.tenure);
    if (f.basis === "total") u.set("basis", "total");
  }
  return u.toString();
}

/** Plain-language summary of the filters, printed above the table and in exports. */
export function describeFilters(f: Filters, typeName?: string): string {
  const parts: string[] = [];
  if (f.report === "applications") {
    parts.push(
      f.statuses
        .map((s) => APPLICATION_STATUSES.find((x) => x.key === s)?.label ?? s)
        .join(", "),
    );
    if (f.from || f.to) parts.push(`received ${f.from ? `from ${f.from}` : ""}${f.from && f.to ? " " : ""}${f.to ? `to ${f.to}` : ""}`);
  } else {
    parts.push(f.statuses.map((s) => MEMBER_STATUSES.find((x) => x.key === s)?.label ?? s).join(", "));
    if (f.tenure) {
      parts.push(
        `${TENURE_OPTIONS.find((t) => t.key === f.tenure)?.label.toLowerCase()} ${f.basis === "total" ? "in total since first admission" : "continuously"}`,
      );
    }
  }
  if (typeName) parts.push(typeName);
  if (f.q) parts.push(`matching “${f.q}”`);
  return parts.join(" · ");
}

/* ------------------------------------------------------------------ */
/* Applications report                                                 */
/* ------------------------------------------------------------------ */

export async function runApplicationsReport(f: ApplicationFilters) {
  const db = getDb();
  const a = schema.applications;
  const decider = db
    .select({ id: schema.staffUsers.id, name: schema.staffUsers.displayName })
    .from(schema.staffUsers)
    .as("decider");
  const kyc = db
    .select({
      applicationId: schema.documents.applicationId,
      verified:
        sql<number>`count(*) filter (where ${schema.documents.reviewStatus} = 'verified' and ${schema.documents.kind} <> 'other')`.as(
          "verified",
        ),
    })
    .from(schema.documents)
    .where(and(isNull(schema.documents.supersededAt), isNotNull(schema.documents.applicationId)))
    .groupBy(schema.documents.applicationId)
    .as("kyc");
  const sponsors = db
    .select({
      applicationId: schema.applicationSponsors.applicationId,
      total: sql<number>`count(*)`.as("total"),
      confirmed: sql<number>`count(${schema.applicationSponsors.confirmedAt})`.as("confirmed"),
    })
    .from(schema.applicationSponsors)
    .groupBy(schema.applicationSponsors.applicationId)
    .as("spons");

  const where: SQL[] = [inArray(a.status, f.statuses as (typeof a.status.enumValues)[number][])];
  if (f.typeId) where.push(eq(a.membershipTypeId, f.typeId));
  if (f.from) where.push(gte(a.receivedAt, new Date(`${f.from}T00:00:00+04:00`)));
  if (f.to) where.push(lte(a.receivedAt, new Date(`${f.to}T23:59:59+04:00`)));
  if (f.q) {
    const like = `%${f.q}%`;
    where.push(
      or(ilike(a.reference, like), ilike(a.lastName, like), ilike(a.firstNames, like), ilike(schema.accounts.email, like))!,
    );
  }

  return db
    .select({
      id: a.id,
      reference: a.reference,
      lastName: a.lastName,
      firstNames: a.firstNames,
      email: schema.accounts.email,
      mobile: a.mobilePhone,
      typeName: schema.membershipTypes.name,
      status: a.status,
      receivedAt: a.receivedAt,
      submissions: a.submissionCount,
      decidedAt: a.decidedAt,
      decidedBy: decider.name,
      decisionComment: a.decisionComment,
      compliance: a.complianceStatus,
      kycVerified: kyc.verified,
      sponsorsTotal: sponsors.total,
      sponsorsConfirmed: sponsors.confirmed,
      paymentDueAt: a.paymentDueAt,
      admittedAt: a.admittedAt,
    })
    .from(a)
    .innerJoin(schema.accounts, eq(schema.accounts.id, a.accountId))
    .leftJoin(schema.membershipTypes, eq(schema.membershipTypes.id, a.membershipTypeId))
    .leftJoin(decider, eq(decider.id, a.decidedById))
    .leftJoin(kyc, eq(kyc.applicationId, a.id))
    .leftJoin(sponsors, eq(sponsors.applicationId, a.id))
    .where(and(...where))
    .orderBy(desc(sql`coalesce(${a.decidedAt}, ${a.receivedAt}, ${a.createdAt})`))
    .limit(5000);
}

export type ApplicationRow = Awaited<ReturnType<typeof runApplicationsReport>>[number];

/* ------------------------------------------------------------------ */
/* Members report                                                       */
/* ------------------------------------------------------------------ */

/** Whole months between a date column and today (Mauritius). */
const monthsSince = (col: AnyColumn | SQL) =>
  sql<number>`(extract(year from age((now() at time zone 'Indian/Mauritius')::date, ${col})) * 12 + extract(month from age((now() at time zone 'Indian/Mauritius')::date, ${col})))::int`;

export async function runMembersReport(f: MemberFilters) {
  const db = getDb();
  const m = schema.members;
  const continuousMonths = monthsSince(m.continuousSince);
  const totalMonths = monthsSince(m.memberSince);

  const where: SQL[] = [inArray(m.status, f.statuses as (typeof m.status.enumValues)[number][])];
  if (f.typeId) where.push(eq(m.membershipTypeId, f.typeId));
  if (f.tenure) where.push(sql`${f.basis === "total" ? totalMonths : continuousMonths} >= ${Number(f.tenure)}`);
  if (f.q) {
    const like = `%${f.q}%`;
    where.push(or(ilike(m.memberNumber, like), ilike(m.lastName, like), ilike(m.firstNames, like), ilike(m.email, like))!);
  }

  return db
    .select({
      id: m.id,
      applicationId: m.applicationId,
      memberNumber: m.memberNumber,
      lastName: m.lastName,
      firstNames: m.firstNames,
      email: m.email,
      mobile: m.mobilePhone,
      typeName: schema.membershipTypes.name,
      status: m.status,
      memberSince: m.memberSince,
      continuousSince: m.continuousSince,
      continuousMonths,
      totalMonths,
      feeCents: m.currentFeeCents,
      feePeriod: schema.membershipTypes.feePeriod,
      nextDueOn: m.nextDueOn,
      imported: m.importedFromRegister,
    })
    .from(m)
    .innerJoin(schema.membershipTypes, eq(schema.membershipTypes.id, m.membershipTypeId))
    .where(and(...where))
    .orderBy(asc(m.continuousSince), asc(m.lastName))
    .limit(5000);
}

export type MemberRow = Awaited<ReturnType<typeof runMembersReport>>[number];

/* ------------------------------------------------------------------ */
/* Headline figures (RPT-01)                                            */
/* ------------------------------------------------------------------ */

export async function headlineFigures() {
  const db = getDb();
  const [apps, members, tenure] = await Promise.all([
    db
      .select({ status: schema.applications.status, n: sql<number>`count(*)::int` })
      .from(schema.applications)
      .groupBy(schema.applications.status),
    db
      .select({ status: schema.members.status, n: sql<number>`count(*)::int` })
      .from(schema.members)
      .groupBy(schema.members.status),
    db
      .select({
        m12: sql<number>`count(*) filter (where ${monthsSince(schema.members.continuousSince)} >= 12)::int`,
        m24: sql<number>`count(*) filter (where ${monthsSince(schema.members.continuousSince)} >= 24)::int`,
        m36: sql<number>`count(*) filter (where ${monthsSince(schema.members.continuousSince)} >= 36)::int`,
      })
      .from(schema.members)
      .where(eq(schema.members.status, "active")),
  ]);
  const a = (k: string) => apps.find((r) => r.status === k)?.n ?? 0;
  const mm = (k: string) => members.find((r) => r.status === k)?.n ?? 0;
  return {
    activeMembers: mm("active"),
    inReview: a("submitted"),
    awaitingPayment: a("approved"),
    admitted: a("admitted"),
    deferred: a("deferred"),
    rejected: a("rejected"),
    m12: tenure[0]?.m12 ?? 0,
    m24: tenure[0]?.m24 ?? 0,
    m36: tenure[0]?.m36 ?? 0,
  };
}

export async function membershipTypeOptions() {
  return getDb()
    .select({ id: schema.membershipTypes.id, name: schema.membershipTypes.name })
    .from(schema.membershipTypes)
    .orderBy(asc(schema.membershipTypes.sortOrder));
}

/* ------------------------------------------------------------------ */
/* Shared labels                                                        */
/* ------------------------------------------------------------------ */

export const APP_STATUS_LABEL: Record<string, string> = Object.fromEntries(
  APPLICATION_STATUSES.map((s) => [s.key, s.label]),
);
export const MEMBER_STATUS_LABEL: Record<string, string> = Object.fromEntries(
  MEMBER_STATUSES.map((s) => [s.key, s.label]),
);

/** "3 yrs 4 mths" from whole months. */
export function tenureLabel(months: number): string {
  if (months < 1) return "Under 1 month";
  const y = Math.floor(months / 12);
  const mo = months % 12;
  return [y ? `${y} yr${y > 1 ? "s" : ""}` : "", mo ? `${mo} mth${mo > 1 ? "s" : ""}` : ""].filter(Boolean).join(" ");
}
