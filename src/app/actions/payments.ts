"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStaffAction } from "@/lib/staff";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/request";
import { sendEmail } from "@/lib/mail";
import { appBaseUrl } from "@/lib/config";
import { formatDateFr, formatMur } from "@/lib/format";
import { welcomeMemberEmail } from "@/lib/email-templates";
import type { FormState } from "./auth";

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const METHODS = ["bank_transfer", "cash", "cheque"] as const;

/** "1 250,50" or "1250.50" → 125050 cents. */
function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/\s|rs|mur/gi, "").replace(/,(\d{1,2})$/, ".$1").replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

function addPeriod(isoDate: string, period: "monthly" | "annual"): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  if (period === "monthly") d.setUTCMonth(d.getUTCMonth() + 1);
  else d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Finance records the joining payment of an approved application (bank transfer,
 * cash or cheque). This admits the applicant: creates the permanent member
 * record with a member number (PAY-04, MEM-01), starts the journey timeline,
 * and emails the welcome and receipt.
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

  const db = getDb();
  const [app] = await db.select().from(schema.applications).where(eq(schema.applications.id, applicationId)).limit(1);
  if (!app || app.status !== "approved") return { error: "Only an approved application awaiting payment can be paid.", values };
  const [type] = await db
    .select()
    .from(schema.membershipTypes)
    .where(eq(schema.membershipTypes.id, app.membershipTypeId!))
    .limit(1);
  const [account] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, app.accountId)).limit(1);
  if (!type || !account) return { error: "The membership type or applicant account is missing.", values };

  const now = new Date();
  const paidAt = new Date(`${values.paidOn}T12:00:00+04:00`);
  const nextDue = addPeriod(values.paidOn, type.feePeriod);

  const member = await db.transaction(async (tx) => {
    const {
      rows: [{ n }],
    } = await tx.execute<{ n: string }>(sql`select nextval('member_number_seq') as n`);
    const memberNumber = `MTC-${String(n).padStart(6, "0")}`;

    const [m] = await tx
      .insert(schema.members)
      .values({
        memberNumber,
        accountId: account.id,
        applicationId: app.id,
        membershipTypeId: type.id,
        status: "active",
        lastName: app.lastName ?? "",
        firstNames: app.firstNames ?? "",
        email: account.email,
        mobilePhone: app.mobilePhone,
        homePhone: app.homePhone,
        residentialAddress: app.residentialAddress,
        dateOfBirth: app.dateOfBirth,
        nationality: app.nationality,
        idNumber: app.idNumber,
        profession: app.profession,
        employerName: app.employerName,
        memberSince: values.paidOn,
        continuousSince: values.paidOn,
        currentFeeCents: amountCents!,
        nextDueOn: nextDue,
        expiresOn: nextDue,
      })
      .returning();

    await tx.insert(schema.memberTypePeriods).values({
      memberId: m.id,
      membershipTypeId: type.id,
      startDate: values.paidOn,
      feeCents: amountCents!,
    });

    await tx.insert(schema.payments).values({
      applicationId: app.id,
      memberId: m.id,
      purpose: "joining",
      periodStart: values.paidOn,
      periodEnd: nextDue,
      amountCents: amountCents!,
      status: "paid",
      method: values.method as (typeof METHODS)[number],
      reference: values.reference || null,
      recordedById: staff.id,
      paidAt,
    });

    // KYC documents follow the member (MEM-09).
    await tx
      .update(schema.documents)
      .set({ memberId: m.id })
      .where(and(eq(schema.documents.applicationId, app.id), isNull(schema.documents.supersededAt)));

    await tx
      .update(schema.applications)
      .set({ status: "admitted", admittedAt: now, updatedAt: now })
      .where(eq(schema.applications.id, app.id));

    await tx.insert(schema.applicationEvents).values({
      applicationId: app.id,
      actorType: "staff",
      staffUserId: staff.id,
      eventType: "admitted",
      subject: "Admis comme Membre",
      comment: `Paiement de ${formatMur(amountCents!)} reçu le ${formatDateFr(values.paidOn)}. Membre ${memberNumber}.`,
      fromStatus: "approved",
      toStatus: "admitted",
    });

    // MEM-03: the journey starts with the application history.
    const methodLabel = { bank_transfer: "bank transfer", cash: "cash", cheque: "cheque" }[values.method] ?? values.method;
    await tx.insert(schema.memberEvents).values([
      {
        memberId: m.id,
        at: app.receivedAt ?? app.createdAt,
        eventType: "application_submitted",
        title: "Application submitted",
        detail: `${app.reference} received`,
        actorType: "applicant",
      },
      {
        memberId: m.id,
        at: app.decidedAt ?? now,
        eventType: "application_approved",
        title: "Application approved",
        detail: "KYC verified and Compliance Review cleared",
        actorType: "staff",
        staffUserId: app.decidedById,
      },
      {
        memberId: m.id,
        at: paidAt,
        eventType: "payment",
        title: "Joining payment received",
        detail: `${formatMur(amountCents!)} by ${methodLabel}${values.reference ? `, ref. ${values.reference}` : ""}`,
        actorType: "staff",
        staffUserId: staff.id,
      },
      {
        memberId: m.id,
        at: now,
        eventType: "admitted",
        title: `Admitted as ${type.name}`,
        detail: `Member no. ${memberNumber} issued`,
        actorType: "staff",
        staffUserId: staff.id,
      },
    ]);
    return m;
  });

  await audit({
    actorType: "staff",
    action: "payment.recorded",
    entityType: "member",
    entityId: member.id,
    staffUserId: staff.id,
    ip: await clientIp(),
    details: { applicationId: app.id, amountCents, method: values.method, reference: values.reference },
  });

  const mail = welcomeMemberEmail({
    name: `${app.firstNames ?? ""} ${app.lastName ?? ""}`.trim() || account.fullName,
    memberNumber: member.memberNumber,
    typeName: type.name,
    amountLabel: formatMur(amountCents!),
    paidOn: formatDateFr(values.paidOn),
    reference: values.reference || app.reference,
    link: `${appBaseUrl()}/espace`,
  });
  await sendEmail({
    to: account.email,
    templateKey: "welcome_member",
    applicationId: app.id,
    memberId: member.id,
    staffUserId: staff.id,
    ...mail,
  });

  revalidatePath(`/staff/applications/${app.id}`);
  revalidatePath("/staff/applications");
  return { message: `Payment recorded. ${member.memberNumber} is now an active member and has been emailed a receipt.` };
}
