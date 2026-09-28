import "server-only";
import { getDb, schema } from "@/db";

const MU_OFFSET_MS = 4 * 3600_000; // Mauritius: UTC+4, no daylight saving

/** YYYY-MM-DD of a moment, in Mauritius time. */
export function muDate(d: Date): string {
  return new Date(d.getTime() + MU_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * The end (23:59:59 Mauritius time) of the n-th business day after `from`,
 * skipping weekends and the public holidays kept by the Administrator (ADM-02).
 */
export async function addBusinessDays(from: Date, n: number): Promise<Date> {
  const rows = await getDb().select({ day: schema.publicHolidays.day }).from(schema.publicHolidays);
  const holidays = new Set(rows.map((r) => String(r.day)));
  const cursor = new Date(`${muDate(from)}T00:00:00Z`);
  let counted = 0;
  while (counted < n) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const dow = cursor.getUTCDay();
    const iso = cursor.toISOString().slice(0, 10);
    if (dow !== 0 && dow !== 6 && !holidays.has(iso)) counted++;
  }
  // 23:59:59 local = 19:59:59 UTC
  return new Date(`${cursor.toISOString().slice(0, 10)}T19:59:59Z`);
}
