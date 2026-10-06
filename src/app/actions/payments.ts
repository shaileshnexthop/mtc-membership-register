"use server";

import { revalidatePath } from "next/cache";
import { requireStaffAction } from "@/lib/staff";
import { clientIp } from "@/lib/request";
import { admitApplication, AdmissionError } from "@/lib/admission";
import type { FormState } from "./auth";

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const METHODS = ["bank_transfer", "cash", "cheque"] as const;

/** "1 250,50" or "1250.50" → 125050 cents. */
function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/\s|rs|mur/gi, "").replace(/,(\d{1,2})$/, ".$1").replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

/**
 * Finance records the joining payment of an approved application (bank transfer,
 * cash or cheque), which admits the applicant (PAY-04, MEM-01).
 */
export async function recordJoiningPayment(applicationId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const staff = await requireStaffAction("finance");
  const values = {
    amount: str(fd, "amount"),
    paidOn: str(fd, "paidOn"),
    method: str(fd, "method"),
    reference: str(fd, "reference"),
  };
  const fieldErrors: Record<string, string> = {};
  const amountCents = parseAmount(values.amount);
  if (amountCents === null || amountCents <= 0) fieldErrors.amount = "Enter the amount received, e.g. 1500.00";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.paidOn)) fieldErrors.paidOn = "Enter the date the payment was received.";
  else if (values.paidOn > new Date().toISOString().slice(0, 10)) fieldErrors.paidOn = "The payment date cannot be in the future.";
  if (!METHODS.includes(values.method as (typeof METHODS)[number])) fieldErrors.method = "Choose how it was paid.";
  if (values.method === "bank_transfer" && !values.reference) fieldErrors.reference = "Enter the bank reference of the transfer.";
  if (Object.keys(fieldErrors).length) return { error: "Check the payment details.", fieldErrors, values };

  try {
    const member = await admitApplication({
      applicationId,
      amountCents: amountCents!,
      paidOn: values.paidOn,
      paidAt: new Date(`${values.paidOn}T12:00:00+04:00`),
      method: values.method as (typeof METHODS)[number],
      reference: values.reference || null,
      staffId: staff.id,
      ip: await clientIp(),
    });
    revalidatePath(`/staff/applications/${applicationId}`);
    revalidatePath("/staff/applications");
    return { message: `Payment recorded. ${member.memberNumber} is now an active member and has been emailed a receipt.` };
  } catch (err) {
    if (err instanceof AdmissionError) return { error: err.message, values };
    throw err;
  }
}
