/**
 * Idempotent reference data. Existing rows are left untouched, so values
 * changed later by an Administrator are never overwritten by a deploy.
 *
 * Membership type names and fees are placeholders until MTC confirms them
 * (open item in the functional specification).
 */
import type { Pool } from "pg";

const membershipTypes = [
  {
    code: "ASSOCIE",
    name: "Membre Associé",
    description: "Associate member",
    feeCents: 0, // [fee to be confirmed by MTC]
    sortOrder: 1,
  },
  {
    code: "TYPE_B",
    name: "[Type B – to be confirmed]",
    description: "Placeholder until MTC confirms its membership types",
    feeCents: 0,
    sortOrder: 2,
  },
];

const settings: Record<string, unknown> = {
  payment_deadline_business_days: 5,
  payment_reminder_business_days: [3, 5],
  sponsor_reminder_business_days: 3,
  upgrade_reminder_business_days: 3,
  renewal_reminder_days_before: [30, 14, 7, 0],
  renewal_grace_days: 30,
  verification_link_hours: 24,
  unverified_account_delete_days: 30,
  proof_of_address_max_age_months: 3,
  certificate_of_character_max_age_months: 6,
  upload_max_bytes: 10 * 1024 * 1024,
};

/**
 * Fixed-date Mauritius public holidays only. Holidays that move each year
 * (lunar and religious calendars, and those that alternate by year) must be
 * entered by the Administrator from the official list (ADM-02).
 */
const fixedHolidays: [string, string][] = [
  ["01-01", "New Year's Day"],
  ["01-02", "New Year (second day)"],
  ["02-01", "Abolition of Slavery"],
  ["03-12", "Independence and Republic Day"],
  ["05-01", "Labour Day"],
  ["11-02", "Arrival of Indentured Labourers"],
  ["12-25", "Christmas Day"],
];
const holidayYears = [2026, 2027];
const holidays: [string, string][] = holidayYears.flatMap((y) =>
  fixedHolidays.map(([md, name]) => [`${y}-${md}`, name] as [string, string]),
);

export async function seedReferenceData(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const t of membershipTypes) {
      await client.query(
        `insert into membership_types (code, name, description, fee_cents, sort_order)
         values ($1, $2, $3, $4, $5)
         on conflict (code) do nothing`,
        [t.code, t.name, t.description, t.feeCents, t.sortOrder],
      );
    }
    for (const [key, value] of Object.entries(settings)) {
      await client.query(
        `insert into settings (key, value) values ($1, $2::jsonb)
         on conflict (key) do nothing`,
        [key, JSON.stringify(value)],
      );
    }
    for (const [day, name] of holidays) {
      await client.query(
        `insert into public_holidays (day, name) values ($1, $2)
         on conflict (day) do nothing`,
        [day, name],
      );
    }
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
