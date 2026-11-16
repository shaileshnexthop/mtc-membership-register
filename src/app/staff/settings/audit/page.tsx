import type { Metadata } from "next";
import Link from "next/link";
import { asc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { StaffShell } from "@/components/StaffShell";
import { SettingsTabs } from "@/components/SettingsTabs";
import { requireStaffPage } from "@/lib/staff";
import { formatDateTimeEn } from "@/lib/format";
import { AUDIT_AREAS, PAGE_SIZE, actionLabel, auditQuery, detailsText, entityHref, parseAuditFilters, readAudit } from "@/lib/audit-view";
import s from "@/components/staff.module.css";
import r from "@/components/reports.module.css";

export const metadata: Metadata = { title: "Audit log" };

/** ADM-05: every staff action and status change, searchable. Administrator only. */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaffPage("administrator");
  const f = parseAuditFilters(await searchParams);
  const [rows, people] = await Promise.all([
    readAudit(f),
    getDb()
      .select({ id: schema.staffUsers.id, name: schema.staffUsers.displayName })
      .from(schema.staffUsers)
      .orderBy(asc(schema.staffUsers.displayName)),
  ]);
  const more = rows.length > PAGE_SIZE;
  const shown = rows.slice(0, PAGE_SIZE);

  return (
    <StaffShell staff={staff} active="settings">
      <div className={s.titleRow}>
        <h1 className={s.title}>Settings</h1>
      </div>
      <SettingsTabs staff={staff} active="audit" />
      <form method="get" action="/staff/settings/audit" className={s.card}>
        <div className={r.filters}>
          <div className={r.field}>
            <span className={r.fieldLabel}>Between</span>
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
            <label htmlFor="staff">Who</label>
            <select id="staff" name="staff" defaultValue={f.staff}>
              <option value="">Everyone</option>
              <option value="system">The portal (automatic)</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <label htmlFor="area" style={{ marginTop: 10 }}>
              Area
            </label>
            <select id="area" name="area" defaultValue={f.area}>
              <option value="">All areas</option>
              {AUDIT_AREAS.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          <div className={r.field}>
            <label htmlFor="q">Search</label>
            <input id="q" type="search" name="q" defaultValue={f.q} placeholder="Reference, email, member number, word…" />
          </div>
        </div>
        <div className={r.formActions}>
          <button type="submit" className={s.btnPrimary}>
            Show
          </button>
          <Link href="/staff/settings/audit" className={s.btn}>
            Reset
          </Link>
          <a className={s.btn} href={`/api/audit/export?${auditQuery(f, 1)}`}>
            CSV
          </a>
        </div>
      </form>
      <section className={s.card} aria-label="Audit entries">
        <p className={s.note} style={{ margin: 0 }}>
          Entries are added, never changed or deleted. Showing {shown.length ? (f.page - 1) * PAGE_SIZE + 1 : 0}–
          {(f.page - 1) * PAGE_SIZE + shown.length}, newest first.
        </p>
        {shown.length === 0 ? (
          <p className={s.empty}>No entries match.</p>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>What</th>
                  <th>Details</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((e) => {
                  const href = entityHref(e.entityType, e.entityId);
                  return (
                    <tr key={e.id}>
                      <td className={s.nowrap}>{formatDateTimeEn(e.at)}</td>
                      <td>
                        {e.staffName ?? e.accountEmail ?? (e.actorType === "system" ? "Portal (automatic)" : e.actorType)}
                        <span className={r.sub}>{e.actorType}</span>
                      </td>
                      <td>
                        {href ? <Link href={href}>{actionLabel(e.action)}</Link> : actionLabel(e.action)}
                        <span className={r.sub}>{e.action}</span>
                      </td>
                      <td className={r.comment} style={{ maxWidth: 420, wordBreak: "break-word" }}>
                        {detailsText(e.details) || "—"}
                      </td>
                      <td className={s.nowrap}>{e.ip ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className={s.rowActions}>
          {f.page > 1 ? (
            <Link className={s.btn} href={`/staff/settings/audit?${auditQuery(f, f.page - 1)}`}>
              ← Newer
            </Link>
          ) : null}
          {more ? (
            <Link className={s.btn} href={`/staff/settings/audit?${auditQuery(f, f.page + 1)}`}>
              Older →
            </Link>
          ) : null}
        </div>
      </section>
    </StaffShell>
  );
}
