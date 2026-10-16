import type { Metadata } from "next";
import Link from "next/link";
import { sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { StaffShell } from "@/components/StaffShell";
import { requireStaffPage } from "@/lib/staff";
import { formatDateEn } from "@/lib/format";
import { applyDueUpgrades, feeLabelEn } from "@/lib/members";
import { listUpgradeRequests } from "@/lib/upgrades";
import s from "@/components/staff.module.css";
import r from "@/components/reports.module.css";

export const metadata: Metadata = { title: "Upgrades" };

const TABS = [
  { key: "pending", label: "Waiting for approval" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
] as const;

/** UPG-01 … UPG-08: changes of membership type and their approval. */
export default async function UpgradesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaffPage();
  await applyDueUpgrades();
  const { status: raw } = await searchParams;
  const status = (TABS.find((t) => t.key === raw)?.key ?? "pending") as (typeof TABS)[number]["key"];
  const [rows, counts] = await Promise.all([
    listUpgradeRequests({ status }),
    getDb()
      .select({ status: schema.upgradeRequests.status, n: sql<number>`count(*)::int` })
      .from(schema.upgradeRequests)
      .groupBy(schema.upgradeRequests.status),
  ]);
  const countOf = (k: string) => counts.find((c) => c.status === k)?.n ?? 0;

  return (
    <StaffShell staff={staff} active="upgrades">
      <div className={s.titleRow}>
        <h1 className={s.title}>Upgrades</h1>
      </div>
      <p className={s.note} style={{ margin: 0 }}>
        Changes of membership type are raised from the member&apos;s record by a Reviewer or Administrator, and approved
        by an Approver who did not raise them. The member is emailed once approved.
      </p>
      <nav aria-label="Filter by status" className={s.tabs}>
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/staff/upgrades?status=${t.key}`}
            className={`${s.tab} ${t.key === status ? s.tabActive : ""}`}
            aria-current={t.key === status ? "page" : undefined}
          >
            {t.label} <strong>{countOf(t.key)}</strong>
          </Link>
        ))}
      </nav>
      <div className={s.card}>
        {rows.length === 0 ? (
          <p className={s.empty}>
            {status === "pending" ? "Nothing waiting for approval." : "No requests in this list."}
            <br />
            <span className={s.note}>To raise one, open a member from Members and choose “Change membership type”.</span>
          </p>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Change</th>
                  <th>Fee</th>
                  <th>Effective</th>
                  <th>Requested</th>
                  <th>{status === "pending" ? "" : "Decided"}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <Link href={`/staff/upgrades/${u.id}`}>
                        <strong>
                          {u.lastName}, {u.firstNames}
                        </strong>
                      </Link>
                      <span className={r.sub}>{u.memberNumber}</span>
                    </td>
                    <td>
                      {u.fromName} → <strong>{u.toName}</strong>
                    </td>
                    <td>
                      {feeLabelEn(u.feeBeforeCents, u.fromPeriod)}
                      <span className={r.sub}>→ {feeLabelEn(u.feeAfterCents, u.toPeriod)}</span>
                    </td>
                    <td className={s.nowrap}>{formatDateEn(u.effectiveDate)}</td>
                    <td>
                      {u.requestedBy}
                      <span className={r.sub}>{formatDateEn(u.requestedAt)}</span>
                    </td>
                    <td>
                      {status === "pending" ? (
                        <Link href={`/staff/upgrades/${u.id}`} className={s.btn}>
                          {u.requestedById === staff.id ? "View" : "Review"}
                        </Link>
                      ) : (
                        <>
                          {u.decidedBy}
                          <span className={r.sub}>
                            {formatDateEn(u.decidedAt)}
                            {u.status === "approved" ? (u.appliedAt ? " · applied" : " · applies on effective date") : ""}
                          </span>
                        </>
                      )}
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
