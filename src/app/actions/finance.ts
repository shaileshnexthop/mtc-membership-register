"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStaffAction } from "@/lib/staff";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/request";
import { formatDateFr, formatMur } from "@/lib/format";
import { todayMu } from "@/lib/members";
import { applyDuesPayment, DuesError } from "@/lib/dues";
import type { FormState } from "./auth";

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const METHODS = ["bank_transfer", "cash", "cheque"] as const;

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/\s|rs|mur/gi, "").replace(/,(\d{1,2})$/, ".$1").replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}


/**
 * REN-03/06 (manual until online renewal): Finance records a dues payment for one or
 * more periods. The next due date moves forward from where it was, a member marked
 * "renewal due" becomes active again, and the member is emailed a receipt.
 */
export async function recordDuesPayment(memberId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const staff = await requireStaffAction("finance");
  const values = {
    periods: str(fd, "periods"),
    amount: str(fd, "amount"),
    paidOn: str(fd, "paidOn"),
    method: str(fd, "method"),
    reference: str(fd, "reference"),
  };
  const today = todayMu();
  const fieldErrors: Record<string, string> = {};
  const periods = Number(values.periods);
  if (!Number.isInteger(periods) || periods < 1 || periods > 24) fieldErrors.periods = "Choose how many periods this pays for.";
  const amountCents = parseAmount(values.amount);
  if (amountCents === null || amountCents <= 0) fieldErrors.amount = "Enter the amount received, e.g. 1500.00";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.paidOn)) fieldErrors.paidOn = "Enter the date the payment was received.";
  else if (values.paidOn > today) fieldErrors.paidOn = "The payment date cannot be in the future.";
  if (!METHODS.includes(values.method as (typeof METHODS)[number])) fieldErrors.method = "Choose how it was paid.";
  if (values.method === "bank_transfer" && !values.reference) fieldErrors.reference = "Enter the bank reference of the transfer.";
  if (Object.keys(fieldErrors).length) return { error: "Check the payment details.", fieldErrors, values };

  try {
    const r = await applyDuesPayment({
      memberId,
      periods,
      amountCents: amountCents!,
      paidOn: values.paidOn,
      paidAt: new Date(`${values.paidOn}T12:00:00+04:00`),
      method: values.method as (typeof METHODS)[number],
      reference: values.reference || null,
      staffId: staff.id,
      ip: await clientIp(),
    });
    revalidatePath(`/staff/members/${memberId}`);
    revalidatePath("/staff/payments");
    return { message: `Recorded ${formatMur(amountCents!)}. Next due ${formatDateFr(r.end)}; the member has been emailed a receipt.` };
  } catch (err) {
    if (err instanceof DuesError) return { error: err.message, values };
    throw err;
  }
}

/** Finance marks a recorded payment as refunded, with the reason (history is kept). */
export async function refundPayment(paymentId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const staff = await requireStaffAction("finance");
  const reason = str(fd, "reason");
  if (!reason) return { error: "Give the reason for the refund." };
  const db = getDb();
  const [p] = await db
    .update(schema.payments)
    .set({ status: "refunded", failureReason: `Refunded: ${reason}`.slice(0, 300) })
    .where(and(eq(schema.payments.id, paymentId), eq(schema.payments.status, "paid")))
    .returning();
  if (!p) return { error: "Only a paid payment can be marked as refunded." };
  if (p.memberId) {
    await db.insert(schema.memberEvents).values({
      memberId: p.memberId,
      eventType: "refund",
      title: "Payment refunded",
      detail: `${formatMur(p.amountCents)} · ${reason}`,
      actorType: "staff",
      staffUserId: staff.id,
      data: { paymentId: p.id },
    });
  }
  await audit({
    actorType: "staff",
    action: "payment.refunded",
    entityType: "payment",
    entityId: p.id,
    staffUserId: staff.id,
    ip: await clientIp(),
    details: { reason, amountCents: p.amountCents },
  });
  revalidatePath("/staff/payments");
  if (p.memberId) revalidatePath(`/staff/members/${p.memberId}`);
  return { message: "Marked as refunded. Adjust the member's next due date or status separately if needed." };
}
