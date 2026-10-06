import type { Metadata } from "next";
import Link from "next/link";
import { StaffShell } from "@/components/StaffShell";
import { PrintButton } from "@/components/PrintButton";
import { requireStaffPage } from "@/lib/staff";
import { formatDateEn, formatDateTimeEn, formatMur } from "@/lib/format";
import { STATUS_EN } from "@/lib/staff-labels";
import {
  APPLICATION_STATUSES,
  MEMBER_STATUSES,
  MEMBER_STATUS_LABEL,
  PRESETS,
  TENURE_OPTIONS,
  describeFilters,
  filtersToQuery,
  headlineFigures,
  membershipTypeOptions,
  parseFilters,
  reportTitle,
  runApplicationsReport,
  runMembersReport,
  tenureLabel,
  type ApplicationRow,
  type MemberRow,
} from "@/lib/reports";
import s from "@/components/staff.module.css";
import r from "@/components/reports.module.css";

export const metadata: Metadata = { title: "Reports" };

const ROW_LIMIT = 5000;

const MEMBER_PILL: Record<string, string> = {
  active: "pillOk",
  renewal_due: "pillWarn",
  lapsed: "pillBad",
  resigned: "pillIdle",
};

/** RPT-01 … RPT-08: application outcomes and membership reports with filters, print and export. */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaffPage();
  const params = await searchParams;
  const f = parseFilters(params);
  const [figures, types] = await Promise.all([headlineFigures(), membershipTypeOptions()]);
  const typeName = types.find((t) => t.id === f.typeId)?.name;
  const query = filtersToQuery(f);
  const title = reportTitle(f);
  const description = describeFilters(f, typeName);
  const generatedAt = new Date();

  const appRows = f.report === "applications" ? await runApplicationsReport(f) : [];
  const memberRows = f.report === "members" ? await runMembersReport(f) : [];
  const total = f.report === "applications" ? appRows.length : memberRows.length;

  const currentHref = `/staff/reports?${query}`;
  const tiles: { label: string; value: number; href: string; tone: string }[] = [
    { label: "Active members", value: figures.activeMembers, href: PRESETS[0].href, tone: r.tOk },
    { label: "Active 12+ months", value: figures.m12, href: PRESETS[1].href, tone: r.tOk },
    { label: "Active 24+ months", value: figures.m24, href: PRESETS[2].href, tone: r.tOk },
    { label: "Active 36+ months", value: figures.m36, href: PRESETS[3].href, tone: r.tOk },
    { label: "Applications in review", value: figures.inReview, href: PRESETS[7].href, tone: r.tInfo },
    {
      label: "Approved applications",
      value: figures.awaitingPayment + figures.admitted,
      href: PRESETS[4].href,
      tone: r.tOk,
    },
    { label: "Deferred applications", value: figures.deferred, href: PRESETS[5].href, tone: r.tWarn },
    { label: "Rejected applications", value: figures.rejected, href: PRESETS[6].href, tone: r.tBad },
  ];

  return (
    <StaffShell staff={staff} active="reports">
      <div data-report-page className={s.titleRow}>
        <h1 className={`${s.title} ${r.noPrint}`}>Reports</h1>
      </div>

      <section aria-label="Headline figures" className={`${r.tiles} ${r.noPrint}`}>
        {tiles.map((t) => (
          <Link
            key={t.label}
            href={t.href}
            className={`${r.tile} ${t.tone} ${t.href === currentHref ? r.tileActive : ""}`}
            aria-current={t.href === currentHref ? "page" : undefined}
          >
            <span className={r.tileValue}>{t.value}</span>
            <span className={r.tileLabel}>{t.label}</span>
          </Link>
        ))}
      </section>

      <form method="get" action="/staff/reports" className={`${s.card} ${r.noPrint}`}>
        <div className={s.cardHead}>
          <h2 className={s.cardTitle}>Build a report</h2>
        </div>
        <nav aria-label="Report type" className={s.tabs}>
          <Link
            href="/staff/reports?report=applications"
            className={`${s.tab} ${f.report === "applications" ? s.tabActive : ""}`}
            aria-current={f.report === "applications" ? "page" : undefined}
          >
            Membership applications
          </Link>
          <Link
            href="/staff/reports?report=members"
            className={`${s.tab} ${f.report === "members" ? s.tabActive : ""}`}
            aria-current={f.report === "members" ? "page" : undefined}
          >
            Members
          </Link>
        </nav>
        <input type="hidden" name="report" value={f.report} />

        <div className={r.filters}>
          {f.report === "applications" ? (
            <fieldset className={r.field}>
              <legend>Outcome / status</legend>
              <div className={r.checks}>
                {APPLICATION_STATUSES.map((st) => (
                  <label key={st.key} className={r.check}>
                    <input type="checkbox" name="status" value={st.key} defaultChecked={f.statuses.includes(st.key)} />
                    {st.label}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <fieldset className={r.field}>
              <legend>Membership status</legend>
              <div className={r.checks}>
                {MEMBER_STATUSES.map((st) => (
                  <label key={st.key} className={r.check}>
                    <input type="checkbox" name="status" value={st.key} defaultChecked={f.statuses.includes(st.key)} />
                    {st.label}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <div className={r.field}>
            <label htmlFor="type">Membership type</label>
            <select id="type" name="type" defaultValue={f.typeId}>
              <option value="">All types</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {f.report === "members" ? (
              <>
                <label htmlFor="tenure" style={{ marginTop: 10 }}>
                  Length of membership
                </label>
                <select id="tenure" name="tenure" defaultValue={f.tenure}>
                  {TENURE_OPTIONS.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
          </div>

          {f.report === "applications" ? (
            <div className={r.field}>
              <span className={r.fieldLabel}>Received between</span>
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
          ) : (
            <fieldset className={r.field}>
              <legend>Count membership</legend>
              <div className={r.checks}>
                <label className={r.check}>
                  <input type="radio" name="basis" value="continuous" defaultChecked={f.basis === "continuous"} />
                  Continuously (since last re-admission)
                </label>
                <label className={r.check}>
                  <input type="radio" name="basis" value="total" defaultChecked={f.basis === "total"} />
                  In total (since first admission)
                </label>
              </div>
            </fieldset>
          )}

          <div className={r.field}>
            <label htmlFor="q">Search</label>
            <input
              id="q"
              type="search"
              name="q"
              defaultValue={f.q}
              placeholder={f.report === "applications" ? "Name, email or APP reference" : "Name, email or member number"}
            />
          </div>
        </div>
        <div className={r.formActions}>
          <button type="submit" className={s.btnPrimary}>
            Run report
          </button>
          <Link href={`/staff/reports?report=${f.report}`} className={s.btn}>
            Reset filters
          </Link>
        </div>
      </form>

      <section className={`${s.card} ${r.printCard}`} aria-labelledby="report-title">
        <div className={`${r.printOnly} ${r.printHeader}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mtcjc-logo.png" alt="" />
          <div>
            <strong>The Mauritius Turf Club · Membership register</strong>
            <span>Confidential – for internal use only</span>
          </div>
        </div>
        <div className={r.resultHead}>
          <div>
            <h2 id="report-title" className={r.resultTitle}>
              {title}
            </h2>
            <p className={r.resultMeta}>
              {description} · <strong>{total}</strong> {total === 1 ? "record" : "records"}
            </p>
            <p className={r.resultMeta}>
              Generated {formatDateTimeEn(generatedAt)} by {staff.displayName}
            </p>
          </div>
          <div className={`${s.rowActions} ${r.noPrint}`}>
            <PrintButton className={s.btn} />
            <a className={s.btn} href={`/api/reports/export?${query}&format=xlsx`}>
              Excel
            </a>
            <a className={s.btn} href={`/api/reports/export?${query}&format=csv`}>
              CSV
            </a>
          </div>
        </div>

        {f.report === "applications" ? <ApplicationSummary rows={appRows} /> : <MemberSummary rows={memberRows} />}

        {total >= ROW_LIMIT ? (
          <p className={r.truncated}>Showing the first {ROW_LIMIT} records. Narrow the filters or export to see more.</p>
        ) : null}

        {total === 0 ? (
          <p className={s.empty}>No records match these filters.</p>
        ) : f.report === "applications" ? (
          <ApplicationsTable rows={appRows} />
        ) : (
          <MembersTable rows={memberRows} />
        )}
      </section>
    </StaffShell>
  );
}

function ApplicationSummary({ rows }: { rows: ApplicationRow[] }) {
  const by = new Map<string, number>();
  for (const row of rows) by.set(row.status, (by.get(row.status) ?? 0) + 1);
  if (by.size < 2) return null;
  return (
    <div className={r.summary}>
      {APPLICATION_STATUSES.filter((st) => by.has(st.key)).map((st) => (
        <span key={st.key} className={`${s.pill} ${s[STATUS_EN[st.key][1]]}`}>
          {STATUS_EN[st.key][0]}: {by.get(st.key)}
        </span>
      ))}
    </div>
  );
}

function MemberSummary({ rows }: { rows: MemberRow[] }) {
  if (rows.length === 0) return null;
  const byType = new Map<string, number>();
  for (const row of rows) byType.set(row.typeName, (byType.get(row.typeName) ?? 0) + 1);
  const avg = Math.round(rows.reduce((t, row) => t + Number(row.continuousMonths), 0) / rows.length);
  return (
    <div className={r.summary}>
      {[...byType].map(([name, n]) => (
        <span key={name} className={`${s.pill} ${s.pillInfo}`}>
          {name}: {n}
        </span>
      ))}
      <span className={`${s.pill} ${s.pillIdle}`}>Average continuous membership: {tenureLabel(avg)}</span>
    </div>
  );
}

function ApplicationsTable({ rows }: { rows: ApplicationRow[] }) {
  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead>
          <tr>
            <th>Reference</th>
            <th>Applicant</th>
            <th>Type</th>
            <th>Received</th>
            <th>Outcome</th>
            <th>Decided</th>
            <th>Reason / comment</th>
            <th>Checks</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className={s.nowrap}>
                <Link href={`/staff/applications/${row.id}`}>{row.reference}</Link>
                {row.submissions > 1 ? <span className={r.sub}>submitted {row.submissions}×</span> : null}
              </td>
              <td>
                <strong>
                  {row.lastName ?? "—"}
                  {row.firstNames ? `, ${row.firstNames}` : ""}
                </strong>
                <span className={r.sub}>{row.email}</span>
                {row.mobile ? <span className={r.sub}>{row.mobile}</span> : null}
              </td>
              <td>{row.typeName ?? "—"}</td>
              <td className={s.nowrap}>{row.receivedAt ? formatDateEn(row.receivedAt) : "—"}</td>
              <td>
                <span className={`${s.pill} ${s[STATUS_EN[row.status][1]]}`}>{STATUS_EN[row.status][0]}</span>
                {row.status === "approved" && row.paymentDueAt ? (
                  <span className={r.sub}>pay by {formatDateEn(row.paymentDueAt)}</span>
                ) : null}
                {row.status === "admitted" && row.admittedAt ? (
                  <span className={r.sub}>admitted {formatDateEn(row.admittedAt)}</span>
                ) : null}
              </td>
              <td className={s.nowrap}>
                {row.decidedAt ? formatDateEn(row.decidedAt) : "—"}
                {row.decidedBy ? <span className={r.sub}>{row.decidedBy}</span> : null}
              </td>
              <td className={r.comment}>{row.decisionComment || "—"}</td>
              <td className={s.nowrap}>
                <span className={r.sub}>KYC {Number(row.kycVerified ?? 0)}/4</span>
                <span className={r.sub}>
                  Sponsors {Number(row.sponsorsConfirmed ?? 0)}/{Number(row.sponsorsTotal ?? 0)}
                </span>
                <span className={r.sub}>
                  Compliance{" "}
                  {row.compliance === "cleared" ? "cleared" : row.compliance === "not_cleared" ? "not cleared" : "pending"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MembersTable({ rows }: { rows: MemberRow[] }) {
  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead>
          <tr>
            <th>Member no.</th>
            <th>Member</th>
            <th>Type</th>
            <th>Status</th>
            <th>Member since</th>
            <th className={r.num}>Continuous membership</th>
            <th className={r.num}>Fee</th>
            <th>Next due</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className={s.nowrap}>
                {row.applicationId ? (
                  <Link href={`/staff/applications/${row.applicationId}`}>{row.memberNumber}</Link>
                ) : (
                  row.memberNumber
                )}
                {row.imported ? <span className={r.sub}>from register</span> : null}
              </td>
              <td>
                <strong>
                  {row.lastName}, {row.firstNames}
                </strong>
                <span className={r.sub}>{row.email}</span>
                {row.mobile ? <span className={r.sub}>{row.mobile}</span> : null}
              </td>
              <td>{row.typeName}</td>
              <td>
                <span className={`${s.pill} ${s[MEMBER_PILL[row.status] ?? "pillIdle"]}`}>
                  {MEMBER_STATUS_LABEL[row.status] ?? row.status}
                </span>
              </td>
              <td className={s.nowrap}>
                {formatDateEn(row.memberSince)}
                {row.continuousSince !== row.memberSince ? (
                  <span className={r.sub}>re-admitted {formatDateEn(row.continuousSince)}</span>
                ) : null}
              </td>
              <td className={r.num}>
                {tenureLabel(Number(row.continuousMonths))}
                {Number(row.totalMonths) !== Number(row.continuousMonths) ? (
                  <span className={r.sub}>{tenureLabel(Number(row.totalMonths))} in total</span>
                ) : null}
              </td>
              <td className={r.num}>
                {row.feeCents > 0 ? formatMur(row.feeCents) : "—"}
                {row.feeCents > 0 ? <span className={r.sub}>{row.feePeriod === "annual" ? "per year" : "per month"}</span> : null}
              </td>
              <td className={s.nowrap}>{row.nextDueOn ? formatDateEn(row.nextDueOn) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
