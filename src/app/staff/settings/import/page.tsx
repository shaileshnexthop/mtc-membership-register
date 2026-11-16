import type { Metadata } from "next";
import { StaffShell } from "@/components/StaffShell";
import { SettingsTabs } from "@/components/SettingsTabs";
import { RegisterImport } from "@/components/RegisterImport";
import { requireStaffPage } from "@/lib/staff";
import { IMPORT_COLUMNS } from "@/lib/register-import";
import s from "@/components/staff.module.css";

export const metadata: Metadata = { title: "Import register" };

/** Loading the Club's existing member register. Administrator only. */
export default async function ImportPage() {
  const staff = await requireStaffPage("administrator");
  return (
    <StaffShell staff={staff} active="settings">
      <div className={s.titleRow}>
        <h1 className={s.title}>Settings</h1>
      </div>
      <SettingsTabs staff={staff} active="import" />
      <section className={s.card} aria-labelledby="h-import">
        <h2 id="h-import" className={s.cardTitle}>
          Import the existing member register
        </h2>
        <p className={s.note} style={{ margin: 0 }}>
          1. Download the template and fill one row per member (or use your own spreadsheet with the same column names).
          2. Check the file: every row is validated and problems are listed by row number. 3. Import: all rows are added
          in one go, only when there are no errors. Members already in the portal (same member number) are refused, so a
          file can safely be checked and corrected several times.
        </p>
        <p style={{ margin: 0 }}>
          <a className={s.btn} href="/api/import/template">
            Download the CSV template
          </a>
        </p>
        <RegisterImport />
      </section>
      <section className={s.card} aria-labelledby="h-cols">
        <h2 id="h-cols" className={s.cardTitle}>
          Columns
        </h2>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Column</th>
                <th>Required</th>
                <th>What to put</th>
              </tr>
            </thead>
            <tbody>
              {IMPORT_COLUMNS.map((c) => (
                <tr key={c.key}>
                  <td className={s.nowrap}>
                    <code>{c.header}</code>
                  </td>
                  <td>{c.required ? "Yes" : "No"}</td>
                  <td>{c.help}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </StaffShell>
  );
}
