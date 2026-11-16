import type { Metadata } from "next";
import { asc, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { StaffShell } from "@/components/StaffShell";
import { SettingsTabs } from "@/components/SettingsTabs";
import { MembershipTypeForm } from "@/components/SettingsForms";
import { hasRole, requireStaffPage } from "@/lib/staff";
import { feeLabelEn } from "@/lib/members";
import s from "@/components/staff.module.css";

export const metadata: Metadata = { title: "Settings" };

/** ADM-01: membership types, fees and conditions. */
export default async function SettingsTypesPage() {
  const staff = await requireStaffPage();
  const canEdit = hasRole(staff, "administrator");
  const db = getDb();
  const types = await db
    .select({
      t: schema.membershipTypes,
      members: sql<number>`(select count(*)::int from members m where m.membership_type_id = ${schema.membershipTypes.id} and m.status in ('active','renewal_due'))`,
    })
    .from(schema.membershipTypes)
    .orderBy(asc(schema.membershipTypes.sortOrder), asc(schema.membershipTypes.name));

  return (
    <StaffShell staff={staff} active="settings">
      <div className={s.titleRow}>
        <h1 className={s.title}>Settings</h1>
      </div>
      <SettingsTabs staff={staff} active="types" />
      <p className={s.note} style={{ margin: 0 }}>
        Membership types and their fees. A fee change applies to new approvals and renewals; payments already made keep
        the fee charged at the time.
      </p>
      {types.map(({ t, members }) => (
        <section key={t.id} className={s.card} aria-labelledby={`type-${t.id}`}>
          <div className={s.cardHead}>
            <h2 id={`type-${t.id}`} className={s.cardTitle}>
              {t.name}
            </h2>
            <span className={`${s.pill} ${t.active ? s.pillOk : s.pillIdle}`}>{t.active ? "Available" : "Not available"}</span>
          </div>
          <dl className={s.dl}>
            <div>
              <dt>Code</dt>
              <dd>{t.code}</dd>
            </div>
            <div>
              <dt>Fee</dt>
              <dd>{feeLabelEn(t.feeCents, t.feePeriod)}</dd>
            </div>
            <div>
              <dt>Active members</dt>
              <dd>{members}</dd>
            </div>
            <div className={s.span2}>
              <dt>Description</dt>
              <dd>{t.description || "—"}</dd>
            </div>
            <div className={s.span2}>
              <dt>Conditions (approval email)</dt>
              <dd style={{ whiteSpace: "pre-wrap" }}>{t.conditionsText || "—"}</dd>
            </div>
          </dl>
          <MembershipTypeForm
            canEdit={canEdit}
            initial={{
              id: t.id,
              code: t.code,
              name: t.name,
              description: t.description ?? "",
              fee: (t.feeCents / 100).toFixed(2),
              feePeriod: t.feePeriod,
              conditionsText: t.conditionsText ?? "",
              sortOrder: String(t.sortOrder),
              active: t.active,
            }}
          />
        </section>
      ))}
      {canEdit ? (
        <section className={s.card} aria-label="New membership type">
          <MembershipTypeForm
            canEdit
            initial={{ id: null, code: "", name: "", description: "", fee: "", feePeriod: "monthly", conditionsText: "", sortOrder: String(types.length + 1), active: true }}
          />
        </section>
      ) : null}
    </StaffShell>
  );
}
