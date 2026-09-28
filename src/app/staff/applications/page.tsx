import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, count, desc, eq, isNull, isNotNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { StaffShell } from "@/components/StaffShell";
import { requireStaffPage } from "@/lib/staff";
import { formatDateEn } from "@/lib/format";
import { STATUS_EN } from "@/lib/staff-labels";
import s from "@/components/staff.module.css";

export const metadata: Metadata = { title: "Applications" };

const FILTERS = [
  { key: "submitted", label: "To review" },
  { key: "deferred", label: "Deferred" },
  { key: "approved", label: "Awaiting payment" },
  { key: "admitted", label: "Admitted" },
  { key: "rejected", label: "Rejected" },
  { key: "draft", label: "Drafts" },
] as const;

/** REV-01: the queue of applications, filterable by status. */
export default async function ApplicationsQueue({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaffPage();
  const { status: raw } = await searchParams;
  const status = (FILTERS.find((f) => f.key === raw)?.key ?? "submitted") as (typeof FILTERS)[number]["key"];
  const db = getDb();

  const counts = await db
    .select({ status: schema.applications.status, n: count() })
    .from(schema.applications)
    .groupBy(schema.applications.status);
  const countOf = (k: string) => counts.find((c) => c.status === k)?.n ?? 0;

  const verifiedDocs = db
    .select({
      applicationId: schema.documents.applicationId,
      verified: sql<number>`count(*) filter (where ${schema.documents.reviewStatus} = 'verified' and ${schema.documents.kind} <> 'other')`.as("verified"),
    })
    .from(schema.documents)
    .where(and(isNull(schema.documents.supersededAt), isNotNull(schema.documents.applicationId)))
    .groupBy(schema.documents.applicationId)
    .as("vd");
  const sponsorCounts = db
    .select({
      applicationId: schema.applicationSponsors.applicationId,
      total: sql<number>`count(*)`.as("total"),
      confirmed: sql<number>`count(${schema.applicationSponsors.confirmedAt})`.as("confirmed"),
    })
    .from(schema.applicationSponsors)
    .groupBy(schema.applicationSponsors.applicationId)
    .as("sc");

  const rows = await db
    .select({
      id: schema.applications.id,
      reference: schema.applications.reference,
      lastName: schema.applications.lastName,
      firstNames: schema.applications.firstNames,
      status: schema.applications.status,
      receivedAt: schema.applications.receivedAt,
      lastSubmittedAt: schema.applications.lastSubmittedAt,
      submissionCount: schema.applications.submissionCount,
      compliance: schema.applications.complianceStatus,
      paymentDueAt: schema.applications.paymentDueAt,
      typeName: schema.membershipTypes.name,
      verified: verifiedDocs.verified,
      sponsorsTotal: sponsorCounts.total,
      sponsorsConfirmed: sponsorCounts.confirmed,
    })
    .from(schema.applications)
    .leftJoin(schema.membershipTypes, eq(schema.membershipTypes.id, schema.applications.membershipTypeId))
    .leftJoin(verifiedDocs, eq(verifiedDocs.applicationId, schema.applications.id))
    .leftJoin(sponsorCounts, eq(sponsorCounts.applicationId, schema.applications.id))
    .where(eq(schema.applications.status, status))
    .orderBy(status === "submitted" ? asc(schema.applications.lastSubmittedAt) : desc(schema.applications.updatedAt))
    .limit(200);

  return (
    <StaffShell staff={staff} active="applications">
      <div className={s.titleRow}>
        <h1 className={s.title}>Applications</h1>
      </div>
      <nav aria-label="Filter by status" className={s.tabs}>
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/staff/applications?status=${f.key}`}
            className={`${s.tab} ${f.key === status ? s.tabActive : ""}`}
            aria-current={f.key === status ? "page" : undefined}
          >
            {f.label} <strong>{countOf(f.key)}</strong>
          </Link>
        ))}
      </nav>
      <div className={s.card}>
        {rows.length === 0 ? (
          <p className={s.empty}>No applications in this list.</p>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Applicant</th>
                  <th>Type</th>
                  <th>Received</th>
                  <th>KYC</th>
                  <th>Compliance</th>
                  <th>Sponsors</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className={s.nowrap}>
                      <Link href={`/staff/applications/${r.id}`}>{r.reference}</Link>
                    </td>
                    <td>
                      {r.lastName ?? "—"}, {r.firstNames ?? ""}
                    </td>
                    <td>{r.typeName ?? "—"}</td>
                    <td>
                      {r.receivedAt ? formatDateEn(r.receivedAt) : "—"}
                      {r.submissionCount > 1 ? <span className={s.note}> · resubmitted</span> : null}
                    </td>
                    <td className={s.nowrap}>{Number(r.verified ?? 0)} of 4</td>
                    <td>
                      <span
                        className={`${s.pill} ${r.compliance === "cleared" ? s.pillOk : r.compliance === "not_cleared" ? s.pillBad : s.pillIdle}`}
                      >
                        {r.compliance === "cleared" ? "Cleared" : r.compliance === "not_cleared" ? "Not cleared" : "Pending"}
                      </span>
                    </td>
                    <td className={s.nowrap}>
                      {Number(r.sponsorsConfirmed ?? 0)} of {Number(r.sponsorsTotal ?? 0)}
                    </td>
                    <td>
                      <span className={`${s.pill} ${s[STATUS_EN[r.status][1]]}`}>
                        {STATUS_EN[r.status][0]}
                      </span>
                      {r.status === "approved" && r.paymentDueAt ? (
                        <span className={s.note}> due {formatDateEn(r.paymentDueAt)}</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </StaffShell>
  );
}
