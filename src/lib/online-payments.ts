import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { audit } from "./audit";
import { muDate } from "./business-days";
import { admitApplication, AdmissionError } from "./admission";
import { createCheckout, getCheckoutStatus, newMerchantTransactionId, peachEnabled } from "./peach";

export type CardPaymentResult = "paid" | "pending" | "failed" | "unknown";

/** Joining amount for an approved application: one period of its membership type's fee. */
export async function joiningAmountCents(membershipTypeId: string | null): Promise<number> {
  if (!membershipTypeId) return 0;
  const [type] = await getDb()
    .select({ feeCents: schema.membershipTypes.feeCents })
    .from(schema.membershipTypes)
    .where(eq(schema.membershipTypes.id, membershipTypeId))
    .limit(1);
  return type?.feeCents ?? 0;
}

/**
 * Starts a Peach Hosted Checkout for the applicant's approved application and
 * returns the URL to send the browser to. A pending payment row records the attempt.
 */
export async function startCardPayment(accountId: string, ip: string | null): Promise<{ redirectUrl: string } | { error: string }> {
  if (!peachEnabled()) return { error: "indisponible" };
  const db = getDb();
  const [app] = await db
    .select()
    .from(schema.applications)
    .where(and(eq(schema.applications.accountId, accountId), eq(schema.applications.status, "approved")))
    .limit(1);
  if (!app) return { error: "statut" };
  if (app.paymentDueAt && app.paymentDueAt.getTime() < Date.now()) return { error: "delai" };
  const amountCents = await joiningAmountCents(app.membershipTypeId);
  if (amountCents <= 0) return { error: "montant" };
  const [account] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId)).limit(1);

  const merchantTransactionId = newMerchantTransactionId();
  const [payment] = await db
    .insert(schema.payments)
    .values({
      applicationId: app.id,
      purpose: "joining",
      amountCents,
      currency: "MUR",
      status: "pending",
      method: "card",
      reference: merchantTransactionId,
    })
    .returning();

  try {
    const { checkoutId, redirectUrl } = await createCheckout({
      amountCents,
      merchantTransactionId,
      invoiceId: app.reference,
      email: account.email,
      givenName: app.firstNames ?? account.firstNames ?? "",
      surname: app.lastName ?? account.lastName ?? "",
    });
    await db.update(schema.payments).set({ gatewayCheckoutId: checkoutId }).where(eq(schema.payments.id, payment.id));
    await audit({
      actorType: "applicant",
      action: "payment.card_started",
      entityType: "application",
      entityId: app.id,
      accountId,
      ip,
      details: { paymentId: payment.id, merchantTransactionId, amountCents },
    });
    return { redirectUrl };
  } catch (err) {
    console.error(err);
    await db
      .update(schema.payments)
      .set({ status: "failed", failureReason: "Checkout could not be started" })
      .where(eq(schema.payments.id, payment.id));
    return { error: "technique" };
  }
}

/**
 * Confirms a checkout by asking Peach for its status (server to server). Called from
 * the browser return and from the webhook; safe to call any number of times.
 */
export async function confirmCheckout(checkoutId: string, ip: string | null): Promise<CardPaymentResult> {
  if (!checkoutId || checkoutId.length > 64) return "unknown";
  const db = getDb();
  const [payment] = await db
    .select()
    .from(schema.payments)
    .where(eq(schema.payments.gatewayCheckoutId, checkoutId))
    .limit(1);
  if (!payment) return "unknown";
  if (payment.status === "paid") return "paid";
  if (payment.status !== "pending" && payment.status !== "failed") return "failed";

  const status = await getCheckoutStatus(checkoutId);
  // Only what is needed for reconciliation; never card details.
  const detail = {
    code: status.code,
    description: status.description,
    transactionId: status.transactionId,
    paymentBrand: status.paymentBrand,
    amount: status.amount,
    currency: status.currency,
  };

  if (status.outcome === "pending") return "pending";

  if (status.outcome === "failed") {
    await db
      .update(schema.payments)
      .set({ status: "failed", failureReason: `${status.code} ${status.description}`.trim().slice(0, 300), rawCallback: detail })
      .where(and(eq(schema.payments.id, payment.id), eq(schema.payments.status, "pending")));
    return "failed";
  }

  // Success: the amount, currency and our transaction id must match what we asked for.
  const matches =
    Number(status.amount).toFixed(2) === (payment.amountCents / 100).toFixed(2) &&
    (status.currency || "MUR").toUpperCase() === payment.currency &&
    (!status.merchantTransactionId || status.merchantTransactionId === payment.reference);
  if (!matches) {
    await db
      .update(schema.payments)
      .set({ failureReason: "Gateway amount or reference did not match – check in Peach Dashboard", rawCallback: detail })
      .where(eq(schema.payments.id, payment.id));
    await audit({
      actorType: "system",
      action: "payment.card_mismatch",
      entityType: "payment",
      entityId: payment.id,
      ip,
      details: detail,
    });
    return "pending";
  }

  try {
    await admitApplication({
      applicationId: payment.applicationId!,
      amountCents: payment.amountCents,
      paidOn: muDate(new Date()),
      paidAt: new Date(),
      method: "card",
      reference: payment.reference,
      staffId: null,
      pendingPaymentId: payment.id,
      gatewayTransactionId: status.transactionId || undefined,
      gatewayDetail: detail,
      ip,
    });
    return "paid";
  } catch (err) {
    if (!(err instanceof AdmissionError)) throw err;
    // Already admitted by a parallel call, or the application changed meanwhile.
    const [again] = await db.select().from(schema.payments).where(eq(schema.payments.id, payment.id)).limit(1);
    if (again?.status === "paid") return "paid";
    await db
      .update(schema.payments)
      .set({
        status: "paid",
        paidAt: new Date(),
        callbackVerifiedAt: new Date(),
        gatewayTransactionId: status.transactionId || null,
        rawCallback: detail,
        failureReason: `Card payment received but not applied: ${err.message} Reconcile or refund.`,
      })
      .where(and(eq(schema.payments.id, payment.id), eq(schema.payments.status, payment.status)));
    await audit({
      actorType: "system",
      action: "payment.card_unapplied",
      entityType: "payment",
      entityId: payment.id,
      ip,
      details: { ...detail, reason: err.message },
    });
    return "paid";
  }
}
