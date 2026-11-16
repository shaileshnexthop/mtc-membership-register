import type { Metadata } from "next";
import Link from "next/link";
import { StaffShell } from "@/components/StaffShell";
import { requireStaffPage } from "@/lib/staff";
import { formatDateEn, formatMur } from "@/lib/format";
import { dashboardData } from "@/lib/dashboard";
import { applyDueUpgrades } from "@/lib/members";
import { isPast } from "@/lib/business-days";
import s from "@/components/staff.module.css";
import r from "@/components/reports.module.css";

export const metadata: Metadata = { title: "Overview" };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (m: string) => `${MONTHS.at(Number(m.slice(5, 7)) - 1)} ${m.slice(2, 4)}`;

/** Bars for one value per month; the latest month in the accent colour. */
function MonthBars({
  title,
  rows,
  value,
  label,
}: {
  title: string;
  rows: { month: string }[];
  value: (i: number) => number;
  label: (v: number) => string;
}) {
  const W = 560, H = 210, left = 16, base = 170, top = 40;
  const vals = rows.map((_, i) => value(i));
  const max = Math.max(1, ...vals);
  const slot = (W - left * 2) / rows.length;
  const bw = Math.min(56, slot * 0.6);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} style={{ width: "100%", height: "auto" }}>
      <line x1={left} x2={W - left} y1={base} y2={base} stroke="var(--line-strong)" />
      {rows.map((row, i) => {
        const v = vals.at(i) ?? 0;
        const h = ((base - top) * v) / max;
        const x = left + slot * i + (slot - bw) / 2;
        const last = i === rows.length - 1;
        return (
          <g key={row.month}>
            <rect x={x} y={base - h} width={bw} height={Math.max(h, v > 0 ? 2 : 0)} rx="4" fill="var(--mtc-navy)" fillOpacity={last ? 1 : 0.35} />
            <text x={x + bw / 2} y={base - h - 8} textAnchor="middle" fontSize="13" fontWeight={last ? 700 : 500} fill="var(--ink)">
              {label(v)}
            </text>
            <text x={x + bw / 2} y={base + 20} textAnchor="middle" fontSize="12" fill="var(--muted)">
              {monthLabel(row.month)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** ADM-03: what needs attention today, and how the last six months went. */
export default async function OverviewPage() {
  const staff = await requireStaffPage();
  await applyDueUpgrades();
  const d = await dashboardData();
  const tiles: { label: string; value: string; href: string; tone: string }[] = [
    { label: "Applications to review", value: String(d.applications.toReview), href: "/staff/applications", tone: r.tInfo },
    { label: "Approved, awaiting payment", value: String(d.applications.awaitingPayment), href: "/staff/payments?view=awaiting", tone: r.tWarn },
    { label: "Changes of type to approve", value: String(d.pendingUpgrades), href: "/staff/upgrades", tone: r.tInfo },
    { label: "Received this month", value: formatMur(d.pay.receivedCents), href: "/staff/payments", tone: r.tOk },
    { label: "Active members", value: String(d.members.active), href: "/staff/members?status=active", tone: r.tOk },
    { label: "Renewal due", value: String(d.members.renewalDue), href: "/staff/members?status=renewal_due", tone: r.tWarn },
    { label: "Lapsed members", value: String(d.members.lapsed), href: "/staff/members?status=lapsed", tone: r.tBad },
    { label: "Dues overdue (est.)", value: formatMur(d.pay.overdueCents), href: "/staff/payments?view=dues", tone: r.tWarn },
  ];

  return (
    <StaffShell staff={staff} active="overview">
      <div className={s.titleRow}>
        <h1 className={s.title}>Overview</h1>
      </div>
      <p className={s.note} style={{ margin: 0 }}>
        This month: {d.applications.approved} application{d.applications.approved === 1 ? "" : "s"} approved,{" "}
        {d.applications.deferred} deferred, {d.applications.rejected} rejected; {d.pay.receivedCount} payment
        {d.pay.receivedCount === 1 ? "" : "s"} received.
      </p>
      <section aria-label="Headline figures" className={r.tiles}>
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className={`${r.tile} ${t.tone}`}>
            <span className={r.tileValue} style={{ fontSize: t.value.startsWith("Rs") ? 22 : undefined }}>
              {t.value}
            </span>
            <span className={r.tileLabel}>{t.label}</span>
          </Link>
        ))}
      </section>

      <div className={s.columns}>
        <div className={s.stack}>
          <section className={s.card} aria-labelledby="h-apps">
            <h2 id="h-apps" className={s.cardTitle}>
              Applications received <span className={s.note}>· last 6 months</span>
            </h2>
            <MonthBars title="Applications received per month" rows={d.series} value={(i) => d.series.at(i)?.received ?? 0} label={(v) => String(v)} />
          </section>
          <section className={s.card} aria-labelledby="h-money">
            <h2 id="h-money" className={s.cardTitle}>
              Payments received <span className={s.note}>· last 6 months, Rs thousands</span>
            </h2>
            <MonthBars
              title="Payments received per month"
              rows={d.series}
              value={(i) => d.series.at(i)?.cents ?? 0}
              label={(v) => (v ? `${(v / 100000).toFixed(v >= 1000000 ? 0 : 1)}k` : "0")}
            />
          </section>
        </div>
        <div className={s.stack}>
          <section className={`${s.card} ${s.cardStrong}`} aria-labelledby="h-review">
            <h2 id="h-review" className={s.cardTitle}>
              Waiting longest for review
            </h2>
            {d.oldestToReview.length === 0 ? (
              <p className={s.note} style={{ margin: 0 }}>
                Nothing to review.
              </p>
            ) : (
              <ul className={s.log}>
                {d.oldestToReview.map((a) => (
                  <li key={a.id}>
                    <span className={s.logHead}>
                      <Link href={`/staff/applications/${a.id}`}>
                        {a.lastName}, {a.firstNames}
                      </Link>
                    </span>
                    <span className={s.note}>
                      {a.reference} · submitted {formatDateEn(a.receivedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className={s.card} aria-labelledby="h-due">
            <h2 id="h-due" className={s.cardTitle}>
              Joining fees due next
            </h2>
            {d.dueSoon.length === 0 ? (
              <p className={s.note} style={{ margin: 0 }}>
                No approved application is waiting for payment.
              </p>
            ) : (
              <ul className={s.log}>
                {d.dueSoon.map((a) => (
                  <li key={a.id}>
                    <span className={s.logHead}>
                      <Link href={`/staff/applications/${a.id}`}>
                        {a.lastName}, {a.firstNames}
                      </Link>
                    </span>
                    <span className={s.note} style={{ color: isPast(a.paymentDueAt) ? "var(--bad)" : undefined }}>
                      {a.reference} · due {formatDateEn(a.paymentDueAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className={s.card} aria-labelledby="h-mem">
            <h2 id="h-mem" className={s.cardTitle}>
              Members
            </h2>
            <dl className={s.dl} style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
              <div><dt>Active</dt><dd>{d.members.active}</dd></div>
              <div><dt>Renewal due</dt><dd>{d.members.renewalDue}</dd></div>
              <div><dt>Lapsed</dt><dd>{d.members.lapsed}</dd></div>
              <div><dt>Resigned</dt><dd>{d.members.resigned}</dd></div>
            </dl>
          </section>
        </div>
      </div>
    </StaffShell>
  );
}
