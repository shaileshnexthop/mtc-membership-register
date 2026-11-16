import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { audit } from "./audit";
import { sendEmail } from "./mail";
import { appBaseUrl } from "./config";
import { formatDateFr, formatMur } from "./format";
import { duesReceiptEmail } from "./email-templates";

export type DuesMethod = "card" | "bank_transfer" | "cash" | "cheque";

const METHOD_FR: Record<DuesMethod, string> = {
  card: "Carte bancaire (paiement en ligne)",
  bank_transfer: "Virement bancaire",
  cash: "Espèces",
  cheque: "Chèque",
};
const METHOD_EN: Record<DuesMethod, string> = { card: "card (online)", bank_transfer: "bank transfer", cash: "cash", cheque: "cheque" };

export function addPeriods(isoDate: string, n: number, period: "monthly" | "annual"): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  if (period === "monthly") d.setUTCMonth(d.getUTCMonth() + n);
  else d.setUTCFullYear(d.getUTCFullYear() + n);
  return d.toISOString().slice(0, 10);
}

export class DuesError extends Error {}

/**
 * REN-03 / REN-06: a dues payment for one or more periods. The next due date moves
 * forward from where it stood, a "renewal due" member becomes active again, the
 * journey and audit log record it, and the member is emailed a receipt.
 * For a card payment, `pendingPaymentId` is the row created when the checkout started;
 * it is switched to paid here, once only.
 */
export async function applyDuesPayment(p: {
  memberId: string;
  periods: number;
  amountCents: number;
  paidOn: string;
  paidAt: Date;
  method: DuesMethod;
  reference: string | null;
  staffId: string | null;
  pendingPaymentId?: string;
  gatewayTransactionId?: string;
  gatewayDetail?: Record<string, unknown>;
  ip?: string | null;
}) {
  const db = getDb();
  const result = await db.transaction(async (tx) => {
    const [m] = await tx.select().from(schema.members).where(eq(schema.members.id, p.memberId)).for("update").limit(1);
    if (!m) throw new DuesError("Member not found.");
    if (m.status !== "active" && m.status !== "renewal_due") {
      throw new DuesError("This member is not active. An Administrator must reinstate them before dues are recorded.");
    }
    const [type] = await tx.select().from(schema.membershipTypes).where(eq(schema.membershipTypes.id, m.membershipTypeId)).limit(1);
    const start = m.nextDueOn ?? p.paidOn;
    const end = addPeriods(start, p.periods, type.feePeriod);

    let paymentId: string;
    if (p.pendingPaymentId) {
      const updated = await tx
        .update(schema.payments)
        .set({
          status: "paid",
          periodStart: start,
          periodEnd: end,
          paidAt: p.paidAt,
          gatewayTransactionId: p.gatewayTransactionId ?? null,
          callbackVerifiedAt: new Date(),
          rawCallback: p.gatewayDetail ?? null,
        })
        .where(and(eq(schema.payments.id, p.pendingPaymentId), eq(schema.payments.status, "pending")))
        .returning({ id: schema.payments.id });
      if (!updated.length) throw new DuesError("This payment has already been processed.");
      paymentId = updated[0].id;
    } else {
      const [row] = await tx
        .insert(schema.payments)
        .values({
          memberId: m.id,
          purpose: "dues",
          periodStart: start,
          periodEnd: end,
          amountCents: p.amountCents,
          status: "paid",
          method: p.method,
          reference: p.reference,
          recordedById: p.staffId,
          paidAt: p.paidAt,
        })
        .returning({ id: schema.payments.id });
      paymentId = row.id;
    }

    await tx
      .update(schema.members)
      .set({
        nextDueOn: end,
        expiresOn: end,
        status: "active",
        // REN-03: renewal is at the type's current fee (a fee change applies from the next renewal).
        currentFeeCents: type.feeCents > 0 ? type.feeCents : m.currentFeeCents,
        updatedAt: new Date(),
      })
      .where(eq(schema.members.id, m.id));
    await tx.insert(schema.memberEvents).values({
      memberId: m.id,
      at: p.paidAt,
      eventType: "payment",
      title: "Dues payment received",
      detail: `${formatMur(p.amountCents)} by ${METHOD_EN[p.method]}${p.reference ? `, ref. ${p.reference}` : ""} · covers ${start} to ${end}`,
      actorType: p.staffId ? "staff" : "member",
      staffUserId: p.staffId,
      data: { paymentId },
    });
    if (m.status === "renewal_due") {
      await tx.insert(schema.memberEvents).values({
        memberId: m.id,
        eventType: "renewed",
        title: "Membership renewed",
        detail: `Next due ${end}`,
        actorType: p.staffId ? "staff" : "member",
        staffUserId: p.staffId,
      });
    }
    return { member: m, start, end, paymentId };
  });

  await audit({
    actorType: p.staffId ? "staff" : "member",
    action: p.method === "card" ? "payment.dues_card_confirmed" : "payment.dues_recorded",
    entityType: "payment",
    entityId: result.paymentId,
    staffUserId: p.staffId,
    accountId: p.staffId ? null : result.member.accountId,
    ip: p.ip ?? null,
    details: { memberId: result.member.id, amountCents: p.amountCents, periods: p.periods, method: p.method, reference: p.reference },
  });
  const m = result.member;
  const mail = duesReceiptEmail({
    name: `${m.firstNames} ${m.lastName}`,
    memberNumber: m.memberNumber,
    amountLabel: formatMur(p.amountCents),
    paidOn: formatDateFr(p.paidOn),
    period: `du ${formatDateFr(result.start)} au ${formatDateFr(result.end)}`,
    method: METHOD_FR[p.method],
    reference: p.reference || result.paymentId.slice(0, 8).toUpperCase(),
    nextDue: formatDateFr(result.end),
    link: `${appBaseUrl()}/espace`,
  });
  await sendEmail({ to: m.email, templateKey: "dues_receipt", memberId: m.id, staffUserId: p.staffId, ...mail });
  return result;
}
