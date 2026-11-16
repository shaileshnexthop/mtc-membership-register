import type { Metadata } from "next";
import { StaffShell } from "@/components/StaffShell";
import { SettingsTabs } from "@/components/SettingsTabs";
import { PaymentSettingsForm } from "@/components/SettingsForms";
import { hasRole, requireStaffPage } from "@/lib/staff";
import { getSettings } from "@/lib/settings";
import { PAYMENT_SETTING_KEYS } from "@/lib/settings-keys";
import s from "@/components/staff.module.css";

export const metadata: Metadata = { title: "Payments & renewals settings" };

/** ADM-03: payment deadline, reminder intervals, grace period and bank details. */
export default async function PaymentSettingsPage() {
  const staff = await requireStaffPage();
  const values = await getSettings([...PAYMENT_SETTING_KEYS]);
  const initial = Object.fromEntries(
    PAYMENT_SETTING_KEYS.map((k) => {
      const v = values[k];
      return [k, Array.isArray(v) ? v.join(", ") : v === undefined || v === null ? "" : String(v)];
    }),
  );
  return (
    <StaffShell staff={staff} active="settings">
      <div className={s.titleRow}>
        <h1 className={s.title}>Settings</h1>
      </div>
      <SettingsTabs staff={staff} active="payments" />
      <section className={s.card} aria-labelledby="h-pay">
        <h2 id="h-pay" className={s.cardTitle}>
          Payments &amp; renewals
        </h2>
        <p className={s.note} style={{ margin: 0 }}>
          These rules drive the deadlines, the reminder emails and the scheduled checks. Business days skip weekends and
          the public holidays listed under Public holidays. The bank details appear in the approval email, the payment
          page, reminders and the member&apos;s renewal page.
        </p>
        <PaymentSettingsForm initial={initial} canEdit={hasRole(staff, "administrator")} />
      </section>
    </StaffShell>
  );
}
