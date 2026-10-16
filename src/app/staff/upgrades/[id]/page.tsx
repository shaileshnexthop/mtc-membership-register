import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StaffShell } from "@/components/StaffShell";
import { UpgradeDecisionForm } from "@/components/MemberForms";
import { hasRole, requireStaffPage } from "@/lib/staff";
import { formatDateEn, formatDateTimeEn } from "@/lib/format";
import { tenureLabel } from "@/lib/reports";
import { MEMBER_STATUS_EN, applyDueUpgrades, feeLabelEn, monthsBetween, todayMu } from "@/lib/members";
import { listUpgradeRequests } from "@/lib/upgrades";
import s from "@/components/staff.module.css";

export const metadata: Metadata = { title: "Membership change" };

const PILL: Record<string, string> = { pending: "pillInfo", approved: "pillOk", rejected: "pillBad" };

/** UPG-03 … UPG-06: the request an Approver opens from the email link (after M365 sign-in). */
export default async function UpgradeRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaffPage();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  await applyDueUpgrades();
  const [u] = await listUpgradeRequests({ id });
  if (!u) notFound();
  const ownRequest = u.requestedById === staff.id;
  const feeChanges = u.feeBeforeCents !== u.feeAfterCents || u.fromPeriod !== u.toPeriod;

  return (
    <StaffShell staff={staff} active="upgrades">
      <span className={s.crumb}>
        <Link href="/staff/upgrades">Upgrades</Link> / {u.memberNumber}
      </span>
      <div className={s.titleRow}>
        <h1 className={s.title}>
          {u.fromName} → {u.toName}
        </h1>
        <span className={`${s.pill} ${s[PILL[u.status]]}`}>
          {u.status === "pending" ? "Waiting for approval" : u.status === "approved" ? "Approved" : "Rejected"}
        </span>
      </div>

      <div className={s.columns}>
        <div className={s.stack}>
          <section className={s.card} aria-labelledby="h-req">
            <h2 id="h-req" className={s.cardTitle}>
              Request
            </h2>
            <dl className={s.dl}>
              <div>
                <dt>Member</dt>
                <dd>
                  <Link href={`/staff/members/${u.memberId}`}>
                    {u.firstNames} {u.lastName}
                  </Link>{" "}
                  · {u.memberNumber}
                </dd>
              </div>
              <div>
                <dt>Member status</dt>
                <dd>
                  {MEMBER_STATUS_EN[u.memberStatus][0]} · {tenureLabel(monthsBetween(u.continuousSince, todayMu()))} continuous
                </dd>
              </div>
              <div>
                <dt>Effective from</dt>
                <dd>{formatDateEn(u.effectiveDate)}</dd>
              </div>
              <div>
                <dt>Current type and fee</dt>
                <dd>
                  {u.fromName} · {feeLabelEn(u.feeBeforeCents, u.fromPeriod)}
                </dd>
              </div>
              <div>
                <dt>New type and fee</dt>
                <dd>
                  <strong>
                    {u.toName} · {feeLabelEn(u.feeAfterCents, u.toPeriod)}
                  </strong>
                </dd>
              </div>
              <div>
                <dt>Fee change</dt>
                <dd>{feeChanges ? "Yes – the member will be told the new fee" : "No change"}</dd>
              </div>
              <div className={s.span2}>
                <dt>Reason</dt>
                <dd>{u.reason}</dd>
              </div>
              <div>
                <dt>Requested by</dt>
                <dd>
                  {u.requestedBy}
                  <br />
                  <span className={s.note}>{formatDateTimeEn(u.requestedAt)}</span>
                </dd>
              </div>
            </dl>
          </section>
        </div>

        <div className={s.stack}>
          <section className={`${s.card} ${u.status === "pending" ? s.cardStrong : ""}`} aria-labelledby="h-decision">
            <h2 id="h-decision" className={s.cardTitle}>
              Decision
            </h2>
            {u.status !== "pending" ? (
              <>
                <p style={{ margin: 0 }}>
                  {u.status === "approved" ? "Approved" : "Rejected"} by {u.decidedBy}, {formatDateTimeEn(u.decidedAt)}.
                </p>
                {u.decisionComment ? <p className={s.note} style={{ margin: 0 }}>“{u.decisionComment}”</p> : null}
                {u.status === "approved" ? (
                  <p className={s.note} style={{ margin: 0 }}>
                    {u.appliedAt
                      ? `Applied to the member record on ${formatDateEn(u.appliedAt)}.`
                      : `Will be applied on ${formatDateEn(u.effectiveDate)}.`}{" "}
                    {u.memberNotifiedAt ? `Member emailed ${formatDateTimeEn(u.memberNotifiedAt)}.` : "Member email not confirmed as sent."}
                  </p>
                ) : null}
              </>
            ) : ownRequest ? (
              <p className={s.hint} style={{ margin: 0 }}>
                You raised this request, so another Approver must decide it.
              </p>
            ) : hasRole(staff, "approver") ? (
              <UpgradeDecisionForm requestId={u.id} />
            ) : (
              <p className={s.note} style={{ margin: 0 }}>
                Waiting for an Approver.
              </p>
            )}
          </section>
        </div>
      </div>
    </StaffShell>
  );
}
