import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { audit } from "./audit";
import { sendEmail } from "./mail";
import { appBaseUrl } from "./config";
import { formatDateFr, formatMur } from "./format";
import { welcomeMemberEmail } from "./email-templates";

export type PaymentMethod = "card" | "bank_transfer" | "cash" | "cheque";

const METHOD_LABEL: Record<PaymentMethod, string> = {
  card: "card (online)",
  bank_transfer: "bank transfer",
  cash: "cash",
  cheque: "cheque",
};

function addPeriod(isoDate: string, period: "monthly" | "annual"): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  if (period === "monthly") d.setUTCMonth(d.getUTCMonth() + 1);
  else d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export class AdmissionError extends Error {}

/**
 * Admits an approved applicant once the joining payment is confirmed (PAY-04, MEM-01):
 * member record with a member number, type period, payment, KYC documents linked,
 * application and journey events, then the welcome email with receipt.
 *
 * For a card payment, `pendingPaymentId` is the payment row created when the checkout
 * started; it is switched to paid here, and only once, so a repeated webhook or return
 * cannot admit twice.
 */
export async function admitApplication(p: {
  applicationId: string;
  amountCents: number;
  paidOn: string; // YYYY-MM-DD, Mauritius
  paidAt: Date;
  method: PaymentMethod;
  reference: string | null;
  staffId: string | null;
  pendingPaymentId?: string;
  gatewayTransactionId?: string;
  gatewayDetail?: Record<string, unknown>;
  ip?: string | null;
}) {
  const db = getDb();
  const [app] = await db.select().from(schema.applications).where(eq(schema.applications.id, p.applicationId)).limit(1);
  if (!app || app.status !== "approved") throw new AdmissionError("Only an approved application awaiting payment can be paid.");
  const [type] = await db
    .select()
    .from(schema.membershipTypes)
    .where(eq(schema.membershipTypes.id, app.membershipTypeId!))
    .limit(1);
  const [account] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, app.accountId)).limit(1);
  if (!type || !account) throw new AdmissionError("The membership type or applicant account is missing.");

  const now = new Date();
  const nextDue = addPeriod(p.paidOn, type.feePeriod);
  const byStaff = p.staffId !== null;

  const member = await db.transaction(async (tx) => {
    // Lock the application so a Finance entry and a card confirmation cannot both admit.
    const locked = await tx.execute<{ status: string }>(
      sql`select status from applications where id = ${app.id} for update`,
    );
    if (locked.rows[0]?.status !== "approved") throw new AdmissionError("This application has already been dealt with.");

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
        memberSince: p.paidOn,
        continuousSince: p.paidOn,
        currentFeeCents: p.amountCents,
        nextDueOn: nextDue,
        expiresOn: nextDue,
      })
      .returning();

    await tx.insert(schema.memberTypePeriods).values({
      memberId: m.id,
      membershipTypeId: type.id,
      startDate: p.paidOn,
      feeCents: p.amountCents,
    });

    if (p.pendingPaymentId) {
      const updated = await tx
        .update(schema.payments)
        .set({
          memberId: m.id,
          status: "paid",
          periodStart: p.paidOn,
          periodEnd: nextDue,
          paidAt: p.paidAt,
          gatewayTransactionId: p.gatewayTransactionId ?? null,
          callbackVerifiedAt: now,
          rawCallback: p.gatewayDetail ?? null,
        })
        .where(and(eq(schema.payments.id, p.pendingPaymentId), eq(schema.payments.status, "pending")))
        .returning({ id: schema.payments.id });
      if (!updated.length) throw new AdmissionError("This payment has already been processed.");
    } else {
      await tx.insert(schema.payments).values({
        applicationId: app.id,
        memberId: m.id,
        purpose: "joining",
        periodStart: p.paidOn,
        periodEnd: nextDue,
        amountCents: p.amountCents,
        status: "paid",
        method: p.method,
        reference: p.reference,
        recordedById: p.staffId,
        paidAt: p.paidAt,
      });
    }

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
      actorType: byStaff ? "staff" : "system",
      staffUserId: p.staffId,
      eventType: "admitted",
      subject: "Admis comme Membre",
      comment: `Paiement de ${formatMur(p.amountCents)} ${p.method === "card" ? "par carte " : ""}reçu le ${formatDateFr(p.paidOn)}. Membre ${memberNumber}.`,
      fromStatus: "approved",
      toStatus: "admitted",
    });

    // MEM-03: the journey starts with the application history.
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
        at: p.paidAt,
        eventType: "payment",
        title: "Joining payment received",
        detail: `${formatMur(p.amountCents)} by ${METHOD_LABEL[p.method]}${p.reference ? `, ref. ${p.reference}` : ""}`,
        actorType: byStaff ? "staff" : "applicant",
        staffUserId: p.staffId,
      },
      {
        memberId: m.id,
        at: now,
        eventType: "admitted",
        title: `Admitted as ${type.name}`,
        detail: `Member no. ${memberNumber} issued`,
        actorType: byStaff ? "staff" : "system",
        staffUserId: p.staffId,
      },
    ]);
    return m;
  });

  await audit({
    actorType: byStaff ? "staff" : "system",
    action: p.method === "card" ? "payment.card_confirmed" : "payment.recorded",
    entityType: "member",
    entityId: member.id,
    staffUserId: p.staffId,
    ip: p.ip ?? null,
    details: { applicationId: app.id, amountCents: p.amountCents, method: p.method, reference: p.reference },
  });

  const mail = welcomeMemberEmail({
    name: `${app.firstNames ?? ""} ${app.lastName ?? ""}`.trim() || account.fullName,
    memberNumber: member.memberNumber,
    typeName: type.name,
    amountLabel: formatMur(p.amountCents),
    paidOn: formatDateFr(p.paidOn),
    reference: p.reference || app.reference,
    link: `${appBaseUrl()}/espace`,
  });
  await sendEmail({
    to: account.email,
    templateKey: "welcome_member",
    applicationId: app.id,
    memberId: member.id,
    staffUserId: p.staffId,
    ...mail,
  });

  return member;
}
