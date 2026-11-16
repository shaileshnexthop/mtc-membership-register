"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStaffAction } from "@/lib/staff";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/request";
import { PAYMENT_SETTING_KEYS, RETENTION_SETTING_KEYS } from "@/lib/settings-keys";
import type { FormState } from "./auth";

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/\s|rs|mur/gi, "").replace(/,(\d{1,2})$/, ".$1").replace(/,/g, "");
  if (cleaned === "") return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

/** "30, 14, 7, 0" → [30, 14, 7, 0]; null when not a list of whole numbers in range. */
function parseDayList(raw: string, max: number): number[] | null {
  if (!raw) return [];
  const parts = raw.split(/[\s,;]+/).filter(Boolean);
  const nums = parts.map(Number);
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > max)) return null;
  return [...new Set(nums)].sort((a, b) => b - a);
}

/** ADM-01: create or edit a membership type. Fee changes apply to new approvals and renewals only. */
export async function saveMembershipType(typeId: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const staff = await requireStaffAction("administrator");
  const values = {
    code: str(fd, "code").toUpperCase(),
    name: str(fd, "name"),
    description: str(fd, "description"),
    fee: str(fd, "fee"),
    feePeriod: str(fd, "feePeriod"),
    conditionsText: str(fd, "conditionsText"),
    sortOrder: str(fd, "sortOrder"),
    active: fd.get("active") === "on" ? "on" : "",
  };
  const fieldErrors: Record<string, string> = {};
  if (!typeId && !/^[A-Z][A-Z0-9_]{1,19}$/.test(values.code)) fieldErrors.code = "2–20 capital letters, digits or _, e.g. TITULAIRE.";
  if (!values.name) fieldErrors.name = "Enter the name members will see.";
  const feeCents = parseAmount(values.fee);
  if (feeCents === null) fieldErrors.fee = "Enter the fee in rupees, e.g. 1500 or 1500.00.";
  if (values.feePeriod !== "monthly" && values.feePeriod !== "annual") fieldErrors.feePeriod = "Choose monthly or annual.";
  const sortOrder = values.sortOrder ? Number(values.sortOrder) : 0;
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 99) fieldErrors.sortOrder = "A whole number from 0 to 99.";
  if (Object.keys(fieldErrors).length) return { error: "Check the highlighted fields.", fieldErrors, values };

  const db = getDb();
  const record = {
    name: values.name,
    description: values.description || null,
    feeCents: feeCents!,
    feePeriod: values.feePeriod as "monthly" | "annual",
    conditionsText: values.conditionsText || null,
    sortOrder,
    active: values.active === "on",
  };
  if (typeId) {
    const [before] = await db.select().from(schema.membershipTypes).where(eq(schema.membershipTypes.id, typeId)).limit(1);
    if (!before) return { error: "Membership type not found." };
    if (!record.active && before.active) {
      const [{ n }] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.membershipTypes)
        .where(eq(schema.membershipTypes.active, true));
      if (n <= 1) return { error: "At least one membership type must stay available.", values };
    }
    await db.update(schema.membershipTypes).set(record).where(eq(schema.membershipTypes.id, typeId));
    const changed = Object.fromEntries(
      Object.entries(record)
        .filter(([k, v]) => (before as Record<string, unknown>)[k] !== v)
        .map(([k, v]) => [k, { from: (before as Record<string, unknown>)[k], to: v }]),
    );
    await audit({
      actorType: "staff",
      action: "settings.type_updated",
      entityType: "membership_type",
      entityId: typeId,
      staffUserId: staff.id,
      ip: await clientIp(),
      details: changed,
    });
    revalidatePath("/staff/settings");
    return {
      message: changed.feeCents
        ? `Saved. The new fee applies to approvals and renewals from now on; members keep the fee on their past records.`
        : "Saved.",
    };
  }
  const [exists] = await db.select().from(schema.membershipTypes).where(eq(schema.membershipTypes.code, values.code)).limit(1);
  if (exists) return { error: "A type with that code already exists.", fieldErrors: { code: "Already used." }, values };
  const [created] = await db
    .insert(schema.membershipTypes)
    .values({ code: values.code, ...record })
    .returning();
  await audit({
    actorType: "staff",
    action: "settings.type_created",
    entityType: "membership_type",
    entityId: created.id,
    staffUserId: staff.id,
    ip: await clientIp(),
    details: { code: values.code, ...record },
  });
  revalidatePath("/staff/settings");
  return { message: `${values.name} added.` };
}


/** ADM-03: deadlines, reminder intervals and the bank details shown to applicants and members. */
export async function savePaymentSettings(_prev: FormState, fd: FormData): Promise<FormState> {
  const staff = await requireStaffAction("administrator");
  const values = Object.fromEntries(PAYMENT_SETTING_KEYS.map((k) => [k, str(fd, k)])) as Record<string, string>;
  const fieldErrors: Record<string, string> = {};
  const intIn = (k: string, lo: number, hi: number) => {
    const n = Number(values[k]);
    if (!Number.isInteger(n) || n < lo || n > hi) fieldErrors[k] = `A whole number from ${lo} to ${hi}.`;
    return n;
  };
  const deadline = intIn("payment_deadline_business_days", 1, 20);
  const upgradeDays = intIn("upgrade_reminder_business_days", 1, 20);
  const grace = intIn("renewal_grace_days", 0, 365);
  const payReminders = parseDayList(values.payment_reminder_business_days, 20);
  if (!payReminders) fieldErrors.payment_reminder_business_days = "Business days separated by commas, e.g. 2, 3.";
  else if (payReminders.some((d) => d < 1 || d > deadline)) fieldErrors.payment_reminder_business_days = `Each day must be between 1 and the deadline (${deadline}).`;
  const renewalReminders = parseDayList(values.renewal_reminder_days_before, 120);
  if (!renewalReminders) fieldErrors.renewal_reminder_days_before = "Days before the due date, separated by commas, e.g. 14, 7, 0.";
  for (const k of ["payment_bank_name", "payment_bank_holder", "payment_bank_account"]) {
    if (!values[k]) fieldErrors[k] = "Required.";
  }
  if (Object.keys(fieldErrors).length) return { error: "Check the highlighted fields.", fieldErrors, values };

  const next: Record<string, unknown> = {
    payment_deadline_business_days: deadline,
    payment_reminder_business_days: [...payReminders!].sort((a, b) => a - b),
    upgrade_reminder_business_days: upgradeDays,
    renewal_reminder_days_before: renewalReminders,
    renewal_grace_days: grace,
    payment_bank_name: values.payment_bank_name,
    payment_bank_holder: values.payment_bank_holder,
    payment_bank_account: values.payment_bank_account,
  };
  const n = await persistSettings(next, staff.id, "/staff/settings/payments");
  if (!n) return { message: "No changes to save.", values };
  return { message: `Saved ${n} change${n > 1 ? "s" : ""}. New deadlines apply to approvals from now on.`, values };
}

/** Saves the changed keys and records each change, old and new value, in the audit log. Returns how many changed. */
async function persistSettings(next: Record<string, unknown>, staffId: string, path: string): Promise<number> {
  const db = getDb();
  const before = await db.select().from(schema.settings).where(inArray(schema.settings.key, Object.keys(next)));
  const prev = Object.fromEntries(before.map((r) => [r.key, r.value]));
  const changed = Object.fromEntries(
    Object.entries(next)
      .filter(([k, v]) => JSON.stringify(prev[k]) !== JSON.stringify(v))
      .map(([k, v]) => [k, { from: prev[k] ?? null, to: v }]),
  );
  if (!Object.keys(changed).length) return 0;
  for (const k of Object.keys(changed)) {
    await db
      .insert(schema.settings)
      .values({ key: k, value: next[k], updatedByStaffId: staffId })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: next[k], updatedAt: new Date(), updatedByStaffId: staffId } });
  }
  await audit({
    actorType: "staff",
    action: "settings.updated",
    entityType: "settings",
    staffUserId: staffId,
    ip: await clientIp(),
    details: changed,
  });
  revalidatePath(path);
  return Object.keys(changed).length;
}

/** ADM-06: when deferred and rejected applications are closed and deleted, and how long their record is kept. */
export async function saveRetentionSettings(_prev: FormState, fd: FormData): Promise<FormState> {
  const staff = await requireStaffAction("administrator");
  const values = Object.fromEntries(RETENTION_SETTING_KEYS.map((k) => [k, str(fd, k)])) as Record<string, string>;
  const fieldErrors: Record<string, string> = {};
  const intIn = (k: string, lo: number, hi: number, msg?: string) => {
    const n = Number(values[k]);
    if (values[k] === "" || !Number.isInteger(n) || n < lo || n > hi) fieldErrors[k] = msg ?? `A whole number from ${lo} to ${hi}.`;
    return n;
  };
  const close = intIn("application_close_after_days", 14, 365);
  intIn("application_close_warning_days", 0, Math.max(0, Math.min(60, close - 1)), `A whole number from 0 (no warning) to ${Math.max(0, Math.min(60, close - 1))}.`);
  intIn("application_delete_after_days", 1, 365);
  intIn("application_record_retention_months", 18, 120, "At least 18 months, at most 120.");
  if (Object.keys(fieldErrors).length) return { error: "Check the highlighted fields.", fieldErrors, values };
  const next = Object.fromEntries(RETENTION_SETTING_KEYS.map((k) => [k, Number(values[k])]));
  const n = await persistSettings(next, staff.id, "/staff/settings/retention");
  if (!n) return { message: "No changes to save.", values };
  return { message: `Saved ${n} change${n > 1 ? "s" : ""}. The scheduled check uses them from its next run.`, values };
}

/** ADM-02: public holidays used for business-day deadlines. */
export async function addHoliday(_prev: FormState, fd: FormData): Promise<FormState> {
  const staff = await requireStaffAction("administrator");
  const values = { day: str(fd, "day"), name: str(fd, "name") };
  const fieldErrors: Record<string, string> = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.day)) fieldErrors.day = "Choose the date.";
  if (!values.name) fieldErrors.name = "Enter the holiday's name.";
  if (Object.keys(fieldErrors).length) return { error: "Check the highlighted fields.", fieldErrors, values };
  const db = getDb();
  const inserted = await db.insert(schema.publicHolidays).values(values).onConflictDoNothing().returning();
  if (!inserted.length) return { error: "That date is already a holiday.", values };
  await audit({
    actorType: "staff",
    action: "settings.holiday_added",
    entityType: "public_holiday",
    entityId: values.day,
    staffUserId: staff.id,
    ip: await clientIp(),
    details: values,
  });
  revalidatePath("/staff/settings/holidays");
  return { message: `${values.name} added.` };
}

export async function deleteHoliday(day: string, _prev: FormState, _fd: FormData): Promise<FormState> {
  const staff = await requireStaffAction("administrator");
  const db = getDb();
  const [gone] = await db.delete(schema.publicHolidays).where(eq(schema.publicHolidays.day, day)).returning();
  if (!gone) return { error: "Already removed." };
  await audit({
    actorType: "staff",
    action: "settings.holiday_removed",
    entityType: "public_holiday",
    entityId: day,
    staffUserId: staff.id,
    ip: await clientIp(),
    details: gone,
  });
  revalidatePath("/staff/settings/holidays");
  return { message: "Removed." };
}
