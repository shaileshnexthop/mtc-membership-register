import type { Metadata } from "next";
import { asc, gte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { StaffShell } from "@/components/StaffShell";
import { SettingsTabs } from "@/components/SettingsTabs";
import { HolidayDeleteButton, HolidayForm } from "@/components/SettingsForms";
import { hasRole, requireStaffPage } from "@/lib/staff";
import { formatDateEn } from "@/lib/format";
import { todayMu } from "@/lib/members";
import s from "@/components/staff.module.css";

export const metadata: Metadata = { title: "Public holidays" };

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** ADM-02: the holiday calendar used for business-day deadlines. */
export default async function HolidaysPage() {
  const staff = await requireStaffPage();
  const canEdit = hasRole(staff, "administrator");
  const thisYear = todayMu().slice(0, 4);
  const rows = await getDb()
    .select()
    .from(schema.publicHolidays)
    .where(gte(schema.publicHolidays.day, `${thisYear}-01-01`))
    .orderBy(asc(schema.publicHolidays.day));
  const years = [...new Set(rows.map((r) => String(r.day).slice(0, 4)))];

  return (
    <StaffShell staff={staff} active="settings">
      <div className={s.titleRow}>
        <h1 className={s.title}>Settings</h1>
      </div>
      <SettingsTabs staff={staff} active="holidays" />
      <p className={s.note} style={{ margin: 0 }}>
        Business-day deadlines (payment within 3 business days, approval reminders) skip these dates. Fixed-date holidays
        are pre-loaded; holidays that move each year (Thaipoosam Cavadee, Maha Shivaratree, Ougadi, Eid-ul-Fitr, Ganesh
        Chaturthi, Divali and others) must be added from the official Government list.
      </p>
      {canEdit ? (
        <section className={s.card} aria-label="Add a holiday">
          <HolidayForm />
        </section>
      ) : null}
      {years.map((y) => (
        <section key={y} className={s.card} aria-labelledby={`y-${y}`}>
          <h2 id={`y-${y}`} className={s.cardTitle}>
            {y} <span className={s.note}>· {rows.filter((r) => String(r.day).startsWith(y)).length} holidays</span>
          </h2>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Day</th>
                  <th>Holiday</th>
                  {canEdit ? <th></th> : null}
                </tr>
              </thead>
              <tbody>
                {rows
                  .filter((r) => String(r.day).startsWith(y))
                  .map((r) => (
                    <tr key={String(r.day)}>
                      <td className={s.nowrap}>{formatDateEn(String(r.day))}</td>
                      <td>{WEEKDAY.at(new Date(`${r.day}T12:00:00Z`).getUTCDay())}</td>
                      <td>{r.name}</td>
                      {canEdit ? (
                        <td>
                          <HolidayDeleteButton day={String(r.day)} />
                        </td>
                      ) : null}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </StaffShell>
  );
}
