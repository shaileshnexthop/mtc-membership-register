import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { StaffShell } from "@/components/StaffShell";
import { SettingsTabs } from "@/components/SettingsTabs";
import { ROLE_LABELS, requireStaffPage } from "@/lib/staff";
import { formatDateTimeEn } from "@/lib/format";
import s from "@/components/staff.module.css";

export const metadata: Metadata = { title: "Staff & roles" };

const ROLE_HELP: [string, string][] = [
  ["Reviewer", "Checks KYC documents and sponsors; approves, defers or rejects applications; corrects contact details; raises changes of type"],
  ["Compliance Officer", "Records the Compliance Review; checks KYC documents and sponsors"],
  ["Approver", "Approves or rejects changes of membership type raised by someone else"],
  ["Finance", "Records joining and dues payments; marks refunds"],
  ["Administrator", "Settings, register import, audit log; reopens rejected applications; lapses, resigns or reinstates members"],
];

/** ADM-03: who has signed in and with which roles. Roles themselves are managed in Microsoft Entra ID. */
export default async function StaffRolesPage() {
  const staff = await requireStaffPage();
  const people = await getDb().select().from(schema.staffUsers).orderBy(desc(schema.staffUsers.lastLoginAt));
  return (
    <StaffShell staff={staff} active="settings">
      <div className={s.titleRow}>
        <h1 className={s.title}>Settings</h1>
      </div>
      <SettingsTabs staff={staff} active="staff" />
      <section className={s.card} aria-labelledby="h-roles">
        <h2 id="h-roles" className={s.cardTitle}>
          The five staff roles
        </h2>
        <p className={s.note} style={{ margin: 0 }}>
          Roles are assigned in Microsoft Entra ID (Enterprise applications → MTC Membership Portal → Users and groups)
          by MTC&apos;s Microsoft 365 administrator. The portal reads them at each sign-in, so a change applies at the
          person&apos;s next sign-in.
        </p>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <tbody>
              {ROLE_HELP.map(([r, h]) => (
                <tr key={r}>
                  <th scope="row" style={{ whiteSpace: "nowrap" }}>
                    {r}
                  </th>
                  <td>{h}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className={s.card} aria-labelledby="h-people">
        <h2 id="h-people" className={s.cardTitle}>
          Staff who have signed in <span className={s.note}>· {people.length}</span>
        </h2>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Roles at last sign-in</th>
                <th>Last sign-in</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.displayName}</strong>
                  </td>
                  <td>{p.email}</td>
                  <td>{p.roles.length ? p.roles.map((r) => ROLE_LABELS[r]).join(", ") : <span className={s.note}>No role</span>}</td>
                  <td className={s.nowrap}>{p.lastLoginAt ? formatDateTimeEn(p.lastLoginAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </StaffShell>
  );
}
