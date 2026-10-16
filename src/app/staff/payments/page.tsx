import type { Metadata } from "next";
import Link from "next/link";
import { StaffShell } from "@/components/StaffShell";
import { PrintButton } from "@/components/PrintButton";
import { RefundForm } from "@/components/FinanceForms";
import { hasRole, requireStaffPage } from "@/lib/staff";
import { formatDateEn, formatDateTimeEn, formatMur } from "@/lib/format";
import { STATUS_EN } from "@/lib/staff-labels";
import { MEMBER_STATUS_EN, applyDueUpgrades } from "@/lib/members";
import {
  METHOD_EN,
  PAYMENT_VIEWS,
  PURPOSE_EN,
  awaitingJoining,
  describePaymentFilters,
  duesMembers,
  incompleteCardPayments,
  lapsedMembers,
  parsePaymentFilters,
  paymentFiltersQuery,
  paymentHeadlines,
  receivedPayments,
} from "@/lib/payments-data";
import { isPast } from "@/lib/business-days";
import s from "@/components/staff.module.css";
import r from "@/components/reports.module.css";

export const metadata: Metadata = { title: "Payments" };

/** REN-06 / RPT-01: Finance view of money received, expected and overdue. */
export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaffPage();
  await applyDueUpgrades();
  const f = parsePaymentFilters(await searchParams);
  const query = paymentFiltersQuery(f);
  const h = await paymentHeadlines();
  const isFinance = hasRole(staff, "finance");
  const title = PAYMENT_VIEWS.find((v) => v.key === f.view)!.label;

  const tiles = [
    { view: "received", value: formatMur(h.receivedCents), label: `Received this month · ${h.receivedCount} payment${h.receivedCount === 1 ? "" : "s"}`, tone: r.tOk },
    { view: "awaiting", value: String(h.awaitingCount), label: `Joining fees awaiting payment · ${formatMur(h.awaitingCents)}`, tone: r.tInfo },
    { view: "dues", value: String(h.overdueCount), label: `Members overdue · est. ${formatMur(h.overdueCents)}`, tone: r.tWarn },
    { view: "lapsed", value: String(h.lapsedCount), label: "Lapsed members", tone: r.tBad },
    { view: "card", value: String(h.cardCount), label: "Card payments not completed (60 days)", tone: "" },
  ];

  const [received, awaiting, dues, lapsed, card] = await Promise.all([
    f.view === "received" ? receivedPayments(f) : Promise.resolve([]),
    f.view === "awaiting" ? awaitingJoining(f) : Promise.resolve([]),
    f.view === "dues" ? duesMembers(f) : Promise.resolve([]),
    f.view === "lapsed" ? lapsedMembers(f) : Promise.resolve([]),
    f.view === "card" ? incompleteCardPayments(f) : Promise.resolve([]),
  ]);
  const count = { received, awaiting, dues, lapsed, card }[f.view].length;
  const receivedTotal = received.filter((p) => p.status === "paid").reduce((t, p) => t + p.amountCents, 0);
  const byMethod = new Map<string, number>();
  for (const p of received) if (p.status === "paid") byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + p.amountCents);

  return (
    <StaffShell staff={staff} active="payments">
      <div data-report-page className={s.titleRow}>
        <h1 className={`${s.title} ${r.noPrint}`}>Payments</h1>
      </div>

      <section aria-label="Headline figures" className={`${r.tiles} ${r.noPrint}`} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        {tiles.map((t) => (
          <Link
            key={t.view}
            href={`/staff/payments?view=${t.view}`}
            className={`${r.tile} ${t.tone} ${t.view === f.view ? r.tileActive : ""}`}
            aria-current={t.view === f.view ? "page" : undefined}
          >
            <span className={r.tileValue} style={{ fontSize: t.view === "received" ? 24 : undefined }}>
              {t.value}
            </span>
            <span className={r.tileLabel}>{t.label}</span>
          </Link>
        ))}
      </section>

      <form method="get" action="/staff/payments" className={`${s.card} ${r.noPrint}`}>
        <input type="hidden" name="view" value={f.view} />
        <div className={r.filters}>
          {f.view === "received" ? (
            <>
              <div className={r.field}>
                <span className={r.fieldLabel}>Paid between</span>
                <div className={r.dates}>
                  <label>
                    From
                    <input type="date" name="from" defaultValue={f.from} />
                  </label>
                  <label>
                    To
                    <input type="date" name="to" defaultValue={f.to} />
                  </label>
                </div>
              </div>
              <div className={r.field}>
                <label htmlFor="method">Method</label>
                <select id="method" name="method" defaultValue={f.method}>
                  <option value="">All methods</option>
                  {Object.entries(METHOD_EN).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <label htmlFor="purpose" style={{ marginTop: 10 }}>
                  For
                </label>
                <select id="purpose" name="purpose" defaultValue={f.purpose}>
                  <option value="">Everything</option>
                  {Object.entries(PURPOSE_EN).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : null}
          <div className={r.field}>
            <label htmlFor="q">Search</label>
            <input id="q" type="search" name="q" defaultValue={f.q} placeholder="Name, member number, APP reference or payment reference" />
          </div>
        </div>
        <div className={r.formActions}>
          <button type="submit" className={s.btnPrimary}>
            Show
          </button>
          <Link href={`/staff/payments?view=${f.view}`} className={s.btn}>
            Reset
          </Link>
        </div>
      </form>

      <section className={`${s.card} ${r.printCard}`} aria-labelledby="pay-title">
        <div className={`${r.printOnly} ${r.printHeader}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mtcjc-logo.png" alt="" />
          <div>
            <strong>The Mauritius Turf Club · Payments</strong>
            <span>Confidential – for internal use only</span>
          </div>
        </div>
        <div className={r.resultHead}>
          <div>
            <h2 id="pay-title" className={r.resultTitle}>
              {title}
            </h2>
            <p className={r.resultMeta}>
              {describePaymentFilters(f)} · <strong>{count}</strong> {count === 1 ? "record" : "records"}
              {f.view === "received" ? (
                <>
                  {" "}
                  · total received <strong>{formatMur(receivedTotal)}</strong>
                </>
              ) : null}
            </p>
            <p className={r.resultMeta}>
              Generated {formatDateTimeEn(new Date())} by {staff.displayName}
            </p>
          </div>
          <div className={`${s.rowActions} ${r.noPrint}`}>
            <PrintButton className={s.btn} />
            <a className={s.btn} href={`/api/payments/export?${query}&format=xlsx`}>
              Excel
            </a>
            <a className={s.btn} href={`/api/payments/export?${query}&format=csv`}>
              CSV
            </a>
          </div>
        </div>

        {f.view === "received" && byMethod.size > 1 ? (
          <div className={r.summary}>
            {[...byMethod].map(([k, v]) => (
              <span key={k} className={`${s.pill} ${s.pillInfo}`}>
                {METHOD_EN[k]}: {formatMur(v)}
              </span>
            ))}
          </div>
        ) : null}

        {count === 0 ? (
          <p className={s.empty}>Nothing to show.</p>
        ) : (
          <div className={s.tableWrap}>
            {f.view === "received" ? (
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>Paid</th>
                    <th>Payer</th>
                    <th>For</th>
                    <th className={r.num}>Amount</th>
                    <th>Method / reference</th>
                    <th>Recorded by</th>
                    <th className={r.noPrint}></th>
                  </tr>
                </thead>
                <tbody>
                  {received.map((p) => (
                    <tr key={p.id}>
                      <td className={s.nowrap}>{formatDateEn(p.paidAt)}</td>
                      <td>
                        {p.memberId ? (
                          <Link href={`/staff/members/${p.memberId}`}>{p.memberName}</Link>
                        ) : p.applicationId ? (
                          <Link href={`/staff/applications/${p.applicationId}`}>{p.appName}</Link>
                        ) : (
                          "—"
                        )}
                        <span className={r.sub}>{p.memberNumber ?? p.appReference}</span>
                      </td>
                      <td>
                        {PURPOSE_EN[p.purpose]}
                        {p.periodStart && p.periodEnd ? (
                          <span className={r.sub}>
                            {formatDateEn(p.periodStart)} – {formatDateEn(p.periodEnd)}
                          </span>
                        ) : null}
                      </td>
                      <td className={r.num}>
                        {p.status === "refunded" ? <s>{formatMur(p.amountCents)}</s> : formatMur(p.amountCents)}
                        {p.status === "refunded" ? <span className={r.sub}>refunded</span> : null}
                      </td>
                      <td>
                        {METHOD_EN[p.method]}
                        {p.reference ? <span className={r.sub}>{p.reference}</span> : null}
                        {p.failureReason ? <span className={r.sub}>{p.failureReason}</span> : null}
                      </td>
                      <td>{p.recordedBy ?? (p.method === "card" ? "Online" : "—")}</td>
                      <td className={r.noPrint}>
                        <span className={s.rowActions} style={{ flexWrap: "nowrap" }}>
                          {p.status === "paid" && p.memberId ? (
                            <a href={`/recu/${p.id}`} target="_blank" rel="noopener">
                              Receipt
                            </a>
                          ) : null}
                          {isFinance && p.status === "paid" ? <RefundForm paymentId={p.id} /> : null}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : f.view === "awaiting" ? (
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Applicant</th>
                    <th>Type</th>
                    <th className={r.num}>Amount</th>
                    <th>Approved</th>
                    <th>Due by</th>
                    <th>Follow-up</th>
                  </tr>
                </thead>
                <tbody>
                  {awaiting.map((a) => (
                    <tr key={a.id}>
                      <td className={s.nowrap}>
                        <Link href={`/staff/applications/${a.id}`}>{a.reference}</Link>
                      </td>
                      <td>
                        <strong>
                          {a.lastName}, {a.firstNames}
                        </strong>
                        <span className={r.sub}>{a.email}</span>
                        {a.mobile ? <span className={r.sub}>{a.mobile}</span> : null}
                      </td>
                      <td>{a.typeName}</td>
                      <td className={r.num}>{a.feeCents ? formatMur(a.feeCents) : "To be confirmed"}</td>
                      <td className={s.nowrap}>{formatDateEn(a.decidedAt)}</td>
                      <td className={s.nowrap}>
                        {formatDateEn(a.paymentDueAt)}
                        {isPast(a.paymentDueAt) ? (
                          <span className={r.sub} style={{ color: "var(--bad)" }}>
                            past deadline
                          </span>
                        ) : null}
                      </td>
                      <td>
                        <span className={r.sub}>
                          {a.remindersSent} reminder{a.remindersSent === 1 ? "" : "s"} sent
                        </span>
                        <span className={r.sub}>
                          {a.cardAttempts} card attempt{a.cardAttempts === 1 ? "" : "s"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : f.view === "dues" ? (
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th className={r.num}>Fee</th>
                    <th>Next due</th>
                    <th className={r.num}>Est. arrears</th>
                    <th>Last paid</th>
                  </tr>
                </thead>
                <tbody>
                  {dues.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <Link href={`/staff/members/${d.id}`}>
                          <strong>
                            {d.lastName}, {d.firstNames}
                          </strong>
                        </Link>
                        <span className={r.sub}>
                          {d.memberNumber} · {d.email}
                        </span>
                      </td>
                      <td>{d.typeName}</td>
                      <td>
                        <span className={`${s.pill} ${s[MEMBER_STATUS_EN[d.status][1]]}`}>{MEMBER_STATUS_EN[d.status][0]}</span>
                      </td>
                      <td className={r.num}>{d.feeCents > 0 ? formatMur(d.feeCents) : "—"}</td>
                      <td className={s.nowrap}>
                        {formatDateEn(d.nextDueOn)}
                        <span className={r.sub} style={{ color: d.overdue ? "var(--bad)" : undefined }}>
                          {d.overdue ? `overdue · ${d.periods} period${d.periods > 1 ? "s" : ""}` : "due soon"}
                        </span>
                      </td>
                      <td className={r.num}>{d.overdue ? formatMur(d.arrearsCents) : "—"}</td>
                      <td className={s.nowrap}>{d.lastPaidAt ? formatDateEn(d.lastPaidAt) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : f.view === "lapsed" ? (
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Type</th>
                    <th>Member since</th>
                    <th>Was due</th>
                    <th>Lapsed</th>
                    <th>Last paid</th>
                  </tr>
                </thead>
                <tbody>
                  {lapsed.map((l) => (
                    <tr key={l.id}>
                      <td>
                        <Link href={`/staff/members/${l.id}`}>
                          <strong>
                            {l.lastName}, {l.firstNames}
                          </strong>
                        </Link>
                        <span className={r.sub}>
                          {l.memberNumber} · {l.email}
                        </span>
                      </td>
                      <td>{l.typeName}</td>
                      <td className={s.nowrap}>{formatDateEn(l.memberSince)}</td>
                      <td className={s.nowrap}>{l.nextDueOn ? formatDateEn(l.nextDueOn) : "—"}</td>
                      <td className={s.nowrap}>{l.lapsedAt ? formatDateEn(l.lapsedAt) : "—"}</td>
                      <td className={s.nowrap}>{l.lastPaidAt ? formatDateEn(l.lastPaidAt) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>Started</th>
                    <th>Application</th>
                    <th className={r.num}>Amount</th>
                    <th>Outcome</th>
                    <th>Application now</th>
                  </tr>
                </thead>
                <tbody>
                  {card.map((c) => (
                    <tr key={c.id}>
                      <td className={s.nowrap}>{formatDateTimeEn(c.createdAt)}</td>
                      <td>
                        {c.applicationId ? <Link href={`/staff/applications/${c.applicationId}`}>{c.appReference}</Link> : "—"}
                        <span className={r.sub}>
                          {c.lastName}, {c.firstNames}
                        </span>
                      </td>
                      <td className={r.num}>{formatMur(c.amountCents)}</td>
                      <td>
                        <span className={`${s.pill} ${c.status === "pending" ? s.pillInfo : s.pillBad}`}>
                          {c.status === "pending" ? "Started, not completed" : c.status}
                        </span>
                        {c.failureReason ? <span className={r.sub}>{c.failureReason}</span> : null}
                        <span className={r.sub}>Ref. {c.reference}</span>
                      </td>
                      <td>
                        {c.appStatus ? (
                          <span className={`${s.pill} ${s[STATUS_EN[c.appStatus][1]]}`}>{STATUS_EN[c.appStatus][0]}</span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </section>
    </StaffShell>
  );
}
