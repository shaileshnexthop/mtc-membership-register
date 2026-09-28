import Link from "next/link";
import { count, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { SiteHeader } from "./SiteHeader";
import { ROLE_LABELS, type Staff } from "@/lib/staff";
import s from "./staff.module.css";

export type StaffSection = "applications" | "members" | "upgrades" | "payments" | "reports" | "settings";

/** Frame for staff pages. Staff pages are in English until MTC decides on the language question. */
export async function StaffShell({
  staff,
  active,
  children,
}: {
  staff: Staff;
  active: StaffSection;
  children: React.ReactNode;
}) {
  const [{ n: toReview }] = await getDb()
    .select({ n: count() })
    .from(schema.applications)
    .where(eq(schema.applications.status, "submitted"));

  const items: { key: StaffSection; label: string; href?: string; badge?: number }[] = [
    { key: "applications", label: "Applications", href: "/staff/applications", badge: toReview },
    { key: "members", label: "Members" },
    { key: "upgrades", label: "Upgrades" },
    { key: "payments", label: "Payments" },
    { key: "reports", label: "Reports" },
    { key: "settings", label: "Settings" },
  ];

  return (
    <div className={s.page}>
      <SiteHeader>
        <span className={s.staffTag}>STAFF</span>
        <span className={s.who}>
          <strong>{staff.displayName}</strong>
          <span className={s.whoRoles}>{staff.roles.map((r) => ROLE_LABELS[r]).join(" · ")}</span>
        </span>
        <form action="/api/auth/staff-logout" method="post">
          <button type="submit" className={s.btn}>
            Sign out
          </button>
        </form>
      </SiteHeader>
      <div className={s.body}>
        <nav aria-label="Staff" className={s.nav}>
          {items.map((it) =>
            it.href ? (
              <Link
                key={it.key}
                href={it.href}
                className={`${s.navLink} ${active === it.key ? s.navActive : ""}`}
                aria-current={active === it.key ? "page" : undefined}
              >
                {it.label}
                {it.badge ? <span className={s.count}>{it.badge}</span> : null}
              </Link>
            ) : (
              <span key={it.key} className={s.navLink} aria-disabled="true">
                {it.label}
                <span className={s.navSoon}>soon</span>
              </span>
            ),
          )}
        </nav>
        <main className={s.main}>{children}</main>
      </div>
    </div>
  );
}
