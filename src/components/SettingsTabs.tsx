import Link from "next/link";
import { hasRole, type Staff } from "@/lib/staff";
import s from "./staff.module.css";

export type SettingsTab = "types" | "payments" | "holidays" | "staff" | "import" | "audit";

/** Sub-navigation for Settings. Import and Audit log are for the Administrator only. */
export function SettingsTabs({ staff, active }: { staff: Staff; active: SettingsTab }) {
  const admin = hasRole(staff, "administrator");
  const tabs: { key: SettingsTab; label: string; href: string; adminOnly?: boolean }[] = [
    { key: "types", label: "Membership types", href: "/staff/settings" },
    { key: "payments", label: "Payments & renewals", href: "/staff/settings/payments" },
    { key: "holidays", label: "Public holidays", href: "/staff/settings/holidays" },
    { key: "staff", label: "Staff & roles", href: "/staff/settings/staff" },
    { key: "import", label: "Import register", href: "/staff/settings/import", adminOnly: true },
    { key: "audit", label: "Audit log", href: "/staff/settings/audit", adminOnly: true },
  ];
  return (
    <nav aria-label="Settings sections" className={s.tabs}>
      {tabs
        .filter((t) => admin || !t.adminOnly)
        .map((t) => (
          <Link
            key={t.key}
            href={t.href}
            className={`${s.tab} ${t.key === active ? s.tabActive : ""}`}
            aria-current={t.key === active ? "page" : undefined}
          >
            {t.label}
          </Link>
        ))}
    </nav>
  );
}
