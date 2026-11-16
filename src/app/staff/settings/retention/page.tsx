import type { Metadata } from "next";
import { count } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { StaffShell } from "@/components/StaffShell";
import { SettingsTabs } from "@/components/SettingsTabs";
import { RetentionSettingsForm } from "@/components/SettingsForms";
import { hasRole, requireStaffPage } from "@/lib/staff";
import { retentionRules } from "@/lib/application-retention";
import s from "@/components/staff.module.css";

export const metadata: Metadata = { title: "Data retention settings" };

/** ADM-06: how long deferred and rejected applications, and their records, are kept. */
export default async function RetentionSettingsPage() {
  const staff = await requireStaffPage();
  const rules = await retentionRules();
  const [{ n: records }] = await getDb().select({ n: count() }).from(schema.applicationRecords);
  const initial = {
    application_close_after_days: String(rules.closeAfterDays),
    application_close_warning_days: String(rules.warnDaysBefore),
    application_delete_after_days: String(rules.deleteAfterDays),
    application_record_retention_months: String(rules.keepRecordMonths),
  };
  return (
    <StaffShell staff={staff} active="settings">
      <div className={s.titleRow}>
        <h1 className={s.title}>Settings</h1>
      </div>
      <SettingsTabs staff={staff} active="retention" />
      <section className={s.card} aria-labelledby="h-ret">
        <h2 id="h-ret" className={s.cardTitle}>
          Applications that go nowhere
        </h2>
        <ol className={s.note} style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
          <li>
            A <strong>deferred</strong> application that is not resubmitted, or a <strong>rejected</strong> one, is closed{" "}
            {rules.closeAfterDays} days after the decision. The applicant of a deferred one is warned{" "}
            {rules.warnDaysBefore} days before, and told when it closes; they can start a new application.
          </li>
          <li>
            A closed application stays {rules.deleteAfterDays} more days (an Administrator can still reopen it), then is
            deleted with its form, sponsors, history and KYC documents in the private store.
          </li>
          <li>
            The applicant&apos;s name, the outcome and its reason stay in Reports for {rules.keepRecordMonths} months after
            deletion, then are purged. {records} record{records === 1 ? "" : "s"} kept at present.
          </li>
          <li>The audit log is never deleted: every action, including the deletion itself, stays in it.</li>
        </ol>
        <RetentionSettingsForm initial={initial} canEdit={hasRole(staff, "administrator")} />
      </section>
    </StaffShell>
  );
}
