import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StaffShell } from "@/components/StaffShell";
import { DetailsForm, StatusForm, UpgradeRequestForm } from "@/components/MemberForms";
import { hasRole, requireStaffPage } from "@/lib/staff";
import { formatDateEn, formatDateTimeEn, formatMur, formatSizeEn } from "@/lib/format";
import { tenureLabel } from "@/lib/reports";
import { DOC_EN } from "@/lib/staff-labels";
import { EDITABLE_FIELDS, type EditableField } from "@/lib/member-labels";
import {
  MEMBER_STATUS_EN,
  activeMembershipTypes,
  applyDueUpgrades,
  feeLabelEn,
  getMemberRecord,
  todayMu,
} from "@/lib/members";
import s from "@/components/staff.module.css";
import r from "@/components/reports.module.css";

export const metadata: Metadata = { title: "Member" };

const PURPOSE_EN: Record<string, string> = {
  joining: "Joining fee",
  dues: "Membership dues",
  renewal: "Renewal",
  upgrade_adjustment: "Type change adjustment",
};
const METHOD_EN: Record<string, string> = {
  card: "Card (Peach Payments)",
  mips: "MIPS",
  bank_transfer: "Bank transfer",
  cash: "Cash",
  cheque: "Cheque",
};
const PAY_PILL: Record<string, string> = { paid: "pillOk", pending: "pillInfo", failed: "pillBad", cancelled: "pillIdle", refunded: "pillWarn" };
const MAIL_PILL: Record<string, string> = { sent: "pillOk", delivered: "pillOk", queued: "pillInfo", failed: "pillBad", bounced: "pillBad" };
const UPG_PILL: Record<string, string> = { pending: "pillInfo", approved: "pillOk", rejected: "pillBad" };

/** MEM-02 … MEM-10: one member's permanent record. */
export default async function MemberRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaffPage();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  await applyDueUpgrades();
  const rec = await getMemberRecord(id);
  if (!rec) notFound();
  const { member: m, type, tenure, arrears } = rec;
  const today = todayMu();
  const canEdit = hasRole(staff, "reviewer", "administrator");
  const pendingUpgrade = rec.upgrades.find((u) => u.status === "pending");
  const types = await activeMembershipTypes();
  const period = type?.feePeriod ?? "monthly";
  const overdue = arrears.overduePeriods > 0;

  const dot = (state: "ok" | "warn" | "bad" | "idle") =>
    `${s.dot} ${state === "ok" ? s.dotOk : state === "warn" ? s.dotWarn : state === "bad" ? s.dotBad : s.dotIdle}`;

  return (
    <StaffShell staff={staff} active="members">
      <span className={s.crumb}>
        <Link href="/staff/members">Members</Link> / {m.memberNumber}
      </span>
      <div className={s.titleRow}>
        <h1 className={s.title}>
          {m.firstNames} {m.lastName}
        </h1>
        <span className={`${s.pill} ${s[MEMBER_STATUS_EN[m.status][1]]}`}>{MEMBER_STATUS_EN[m.status][0]}</span>
      </div>
      <p className={s.note} style={{ margin: 0 }}>
        {m.memberNumber} · {type?.name} · member since {formatDateEn(m.memberSince)}
        {m.importedFromRegister ? " · imported from the existing register" : ""}
      </p>

      <ol aria-label="Membership at a glance" className={s.rail}>
        <li>
          <span className={dot("ok")} />
          <span className={s.railText}>
            {tenureLabel(tenure.totalMonths)}
            <span className={s.railSub}>in total since {formatDateEn(m.memberSince)}</span>
          </span>
        </li>
        <li>
          <span className={dot(m.status === "active" ? "ok" : "idle")} />
          <span className={s.railText}>
            {tenureLabel(tenure.continuousMonths)}
            <span className={s.railSub}>continuous since {formatDateEn(m.continuousSince)}</span>
          </span>
        </li>
        <li>
          <span className={dot("idle")} />
          <span className={s.railText}>
            {m.currentFeeCents > 0 ? formatMur(m.currentFeeCents) : "Fee to be confirmed"}
            <span className={s.railSub}>{period === "annual" ? "per year" : "per month"}</span>
          </span>
        </li>
        <li>
          <span className={dot(overdue ? "bad" : "ok")} />
          <span className={s.railText}>
            {m.nextDueOn ? formatDateEn(m.nextDueOn) : "—"}
            <span className={s.railSub}>{overdue ? "next due · overdue" : "next due"}</span>
          </span>
        </li>
        <li>
          <span className={dot(overdue ? "bad" : "ok")} />
          <span className={s.railText}>
            {overdue ? formatMur(arrears.amountCents) : "Rs 0.00"}
            <span className={s.railSub}>
              {overdue ? `estimated arrears · ${arrears.overduePeriods} period${arrears.overduePeriods > 1 ? "s" : ""}` : "no arrears"}
            </span>
          </span>
        </li>
      </ol>

      <div className={s.columns}>
        <div className={s.stack}>
          <section className={s.card} aria-labelledby="h-details">
            <h2 id="h-details" className={s.cardTitle}>
              Member details
            </h2>
            <dl className={s.dl}>
              <div><dt>Member no.</dt><dd>{m.memberNumber}</dd></div>
              <div><dt>Membership type</dt><dd>{type?.name}</dd></div>
              <div><dt>Status</dt><dd>{MEMBER_STATUS_EN[m.status][0]}</dd></div>
              <div><dt>Nom</dt><dd>{m.lastName}</dd></div>
              <div><dt>Prénoms</dt><dd>{m.firstNames}</dd></div>
              <div><dt>Date of birth</dt><dd>{m.dateOfBirth ? formatDateEn(m.dateOfBirth) : "—"}</dd></div>
              <div><dt>Contact email</dt><dd>{m.email}</dd></div>
              <div><dt>Mobile</dt><dd>{m.mobilePhone || "—"}</dd></div>
              <div><dt>Home phone</dt><dd>{m.homePhone || "—"}</dd></div>
              <div className={s.span2}><dt>Residential address</dt><dd>{m.residentialAddress || "—"}</dd></div>
              <div><dt>Nationality</dt><dd>{m.nationality || "—"}</dd></div>
              <div><dt>Profession</dt><dd>{m.profession || "—"}</dd></div>
              <div><dt>Employer</dt><dd>{m.employerName || "—"}</dd></div>
              <div>
                <dt>Portal account</dt>
                <dd>
                  {rec.account
                    ? `${rec.account.email}${rec.account.lastLoginAt ? ` · last sign-in ${formatDateEn(rec.account.lastLoginAt)}` : ""}`
                    : "None yet (imported member)"}
                </dd>
              </div>
            </dl>
            {canEdit ? (
              <DetailsForm
                memberId={m.id}
                current={Object.fromEntries((Object.keys(EDITABLE_FIELDS) as EditableField[]).map((k) => [k, m[k] ?? ""])) as Record<EditableField, string>}
              />
            ) : null}
          </section>

          <section className={s.card} aria-labelledby="h-journey">
            <h2 id="h-journey" className={s.cardTitle}>
              Journey <span className={s.note}>· newest first</span>
            </h2>
            {rec.events.length === 0 ? (
              <p className={s.note}>No history recorded.</p>
            ) : (
              <ul className={s.log}>
                {rec.events.map((e) => (
                  <li key={e.id} data-event={e.eventType}>
                    <span className={s.logHead}>
                      {formatDateEn(e.at)} · {e.title}
                    </span>
                    {e.detail ? <span>{e.detail}</span> : null}
                    {e.staffName ? <span className={s.note}>{e.staffName}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={s.card} aria-labelledby="h-payments">
            <h2 id="h-payments" className={s.cardTitle}>
              Payment history
            </h2>
            {rec.payments.length === 0 ? (
              <p className={s.note}>No payments recorded in the portal.</p>
            ) : (
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>For</th>
                      <th className={r.num}>Amount</th>
                      <th>Method / reference</th>
                      <th>Status</th>
                      <th>Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rec.payments.map((p) => (
                      <tr key={p.id}>
                        <td className={s.nowrap}>{formatDateEn(p.paidAt ?? p.createdAt)}</td>
                        <td>
                          {PURPOSE_EN[p.purpose] ?? p.purpose}
                          {p.periodStart && p.periodEnd ? (
                            <span className={r.sub}>
                              {formatDateEn(p.periodStart)} – {formatDateEn(p.periodEnd)}
                            </span>
                          ) : null}
                        </td>
                        <td className={r.num}>{formatMur(p.amountCents)}</td>
                        <td>
                          {METHOD_EN[p.method] ?? p.method}
                          {p.reference ? <span className={r.sub}>{p.reference}</span> : null}
                          {p.failureReason ? <span className={r.sub}>{p.failureReason}</span> : null}
                        </td>
                        <td>
                          <span className={`${s.pill} ${s[PAY_PILL[p.status] ?? "pillIdle"]}`}>{p.status}</span>
                        </td>
                        <td>
                          {p.status === "paid" ? (
                            <a href={`/recu/${p.id}`} target="_blank" rel="noopener">
                              View
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={s.card} aria-labelledby="h-mail">
            <h2 id="h-mail" className={s.cardTitle}>
              Communications <span className={s.note}>· emails sent to this person</span>
            </h2>
            {rec.emails.length === 0 ? (
              <p className={s.note}>No emails sent.</p>
            ) : (
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th>Sent</th>
                      <th>Subject</th>
                      <th>To</th>
                      <th>Delivery</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rec.emails.map((e) => (
                      <tr key={e.id}>
                        <td className={s.nowrap}>{formatDateTimeEn(e.sentAt ?? e.createdAt)}</td>
                        <td>
                          {e.subject}
                          <span className={r.sub}>{e.templateKey.replace(/_/g, " ")}</span>
                        </td>
                        <td>{e.toEmail}</td>
                        <td>
                          <span className={`${s.pill} ${s[MAIL_PILL[e.status] ?? "pillIdle"]}`}>{e.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {rec.changes.length ? (
            <section className={s.card} aria-labelledby="h-changes">
              <h2 id="h-changes" className={s.cardTitle}>
                Changes to details
              </h2>
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Field</th>
                      <th>Old value</th>
                      <th>New value</th>
                      <th>By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rec.changes.map((c) => (
                      <tr key={c.id}>
                        <td className={s.nowrap}>{formatDateTimeEn(c.at)}</td>
                        <td>{EDITABLE_FIELDS[c.field as EditableField] ?? c.field}</td>
                        <td>{c.oldValue || "—"}</td>
                        <td>{c.newValue || "—"}</td>
                        <td>{c.staffName ?? (c.changedByType === "member" ? "Member" : c.changedByType)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </div>

        <div className={s.stack}>
          <section className={`${s.card} ${s.cardStrong}`} aria-labelledby="h-type">
            <h2 id="h-type" className={s.cardTitle}>
              Membership type
            </h2>
            <p style={{ margin: 0 }}>
              <strong>{type?.name}</strong> · {feeLabelEn(m.currentFeeCents, period)}
            </p>
            {pendingUpgrade ? (
              <p className={s.hint} style={{ margin: 0 }}>
                Change to <strong>{pendingUpgrade.toName}</strong> from {formatDateEn(pendingUpgrade.effectiveDate)}, requested
                by {pendingUpgrade.requestedBy} on {formatDateEn(pendingUpgrade.requestedAt)}, is waiting for approval. The
                Approvers have been emailed. <Link href={`/staff/upgrades/${pendingUpgrade.id}`}>Open the request</Link>
              </p>
            ) : canEdit && (m.status === "active" || m.status === "renewal_due") ? (
              <UpgradeRequestForm
                memberId={m.id}
                currentTypeId={m.membershipTypeId}
                currentFeeLabel={feeLabelEn(m.currentFeeCents, period)}
                types={types.map((t) => ({ id: t.id, name: t.name, feeLabel: feeLabelEn(t.feeCents, t.feePeriod) }))}
                today={today}
              />
            ) : null}
          </section>

          <section className={s.card} aria-labelledby="h-years">
            <h2 id="h-years" className={s.cardTitle}>
              Years of membership
            </h2>
            <dl className={s.dl} style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}>
              <div><dt>Total</dt><dd>{tenureLabel(tenure.totalMonths)}</dd></div>
              <div><dt>Continuous</dt><dd>{tenureLabel(tenure.continuousMonths)}</dd></div>
              {tenure.byType.map(([name, months]) => (
                <div key={name}>
                  <dt>As {name}</dt>
                  <dd>{tenureLabel(months)}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className={s.card} aria-labelledby="h-path">
            <h2 id="h-path" className={s.cardTitle}>
              Upgrade path
            </h2>
            <ul className={s.log}>
              {rec.periods.map((p) => (
                <li key={p.id}>
                  <span className={s.logHead}>{p.typeName}</span>
                  <span>
                    {formatDateEn(p.startDate)} – {p.endDate ? formatDateEn(p.endDate) : p.startDate > today ? "(starts later)" : "today"} ·{" "}
                    {feeLabelEn(p.feeCents, p.feePeriod)}
                  </span>
                </li>
              ))}
            </ul>
            {rec.upgrades.length ? (
              <>
                <h3 className={s.cardTitle} style={{ fontSize: 14, marginTop: 8 }}>
                  Requests
                </h3>
                <ul className={s.log}>
                  {rec.upgrades.map((u) => (
                    <li key={u.id}>
                      <span className={s.logHead}>
                        <Link href={`/staff/upgrades/${u.id}`}>
                          {u.fromName} → {u.toName}
                        </Link>{" "}
                        <span className={`${s.pill} ${s[UPG_PILL[u.status]]}`}>
                          {u.status === "approved" && !u.appliedAt ? "approved · applies later" : u.status}
                        </span>
                      </span>
                      <span>
                        Effective {formatDateEn(u.effectiveDate)} · {formatMur(u.feeBeforeCents)} → {formatMur(u.feeAfterCents)}
                      </span>
                      <span className={s.note}>
                        Requested by {u.requestedBy} {formatDateEn(u.requestedAt)}
                        {u.decidedBy ? ` · ${u.status} by ${u.decidedBy} ${formatDateEn(u.decidedAt)}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>

          <section className={s.card} aria-labelledby="h-docs">
            <h2 id="h-docs" className={s.cardTitle}>
              Documents
            </h2>
            {rec.documents.length === 0 ? (
              <p className={s.note}>{m.importedFromRegister ? "Held on paper (imported member)." : "No documents."}</p>
            ) : (
              <ul className={s.log}>
                {rec.documents.map((d) => (
                  <li key={d.id}>
                    <span className={s.logHead}>{DOC_EN[d.kind]}</span>
                    <span>
                      {hasRole(staff, "reviewer", "compliance_officer", "administrator") ? (
                        <a href={`/api/documents/${d.id}`} target="_blank" rel="noopener">
                          {d.originalFilename}
                        </a>
                      ) : (
                        d.originalFilename
                      )}{" "}
                      · {formatSizeEn(d.sizeBytes)} · {d.reviewStatus}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {m.applicationId ? (
              <p className={s.note} style={{ margin: 0 }}>
                <Link href={`/staff/applications/${m.applicationId}`}>Open the original application</Link>
              </p>
            ) : null}
          </section>

          {hasRole(staff, "administrator") ? (
            <section className={s.card} aria-labelledby="h-status">
              <h2 id="h-status" className={s.cardTitle}>
                Status <span className={s.note}>· Administrator</span>
              </h2>
              <StatusForm key={m.status} memberId={m.id} status={m.status} />
            </section>
          ) : null}
        </div>
      </div>
    </StaffShell>
  );
}
