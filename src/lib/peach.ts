import "server-only";
import crypto from "node:crypto";
import { appBaseUrl } from "./config";

/**
 * Peach Payments Hosted Checkout V2 (PAY-01). Card details are entered on Peach's
 * page only; this portal never sees or stores them. A payment counts as paid only
 * after the server has asked Peach for the checkout status with its own credentials
 * (PAY-03) — the browser return and the webhook merely trigger that check.
 */

export function peachConfig() {
  const mode = process.env.PEACH_MODE === "live" ? "live" : "test";
  return {
    mode,
    entityId: process.env.PEACH_ENTITY_ID ?? "",
    clientId: process.env.PEACH_CLIENT_ID ?? "",
    clientSecret: process.env.PEACH_CLIENT_SECRET ?? "",
    merchantId: process.env.PEACH_MERCHANT_ID ?? "",
    webhookSecret: process.env.PEACH_WEBHOOK_SECRET ?? "",
    authUrl:
      process.env.PEACH_AUTH_URL ??
      (mode === "live" ? "https://dashboard.peachpayments.com" : "https://sandbox-dashboard.peachpayments.com"),
    checkoutUrl:
      process.env.PEACH_CHECKOUT_URL ??
      (mode === "live" ? "https://secure.peachpayments.com" : "https://testsecure.peachpayments.com"),
  };
}

export function peachEnabled(): boolean {
  const c = peachConfig();
  return Boolean(c.entityId && c.clientId && c.clientSecret && c.merchantId);
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const c = peachConfig();
  const res = await fetch(`${c.authUrl}/api/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ clientId: c.clientId, clientSecret: c.clientSecret, merchantId: c.merchantId }),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const token = String(json.access_token ?? json.accessToken ?? json.token ?? "");
  if (!res.ok || !token) throw new Error(`Peach authentication failed (${res.status})`);
  const ttl = Number(json.expires_in ?? json.expiresIn ?? 600);
  cachedToken = { value: token, expiresAt: Date.now() + Math.max(60, ttl) * 1000 };
  return token;
}

/** 13-character merchant transaction id (Peach allows 8–16). */
export function newMerchantTransactionId(): string {
  return `MTC${crypto.randomBytes(8).toString("hex").slice(0, 10).toUpperCase()}`;
}

export async function createCheckout(p: {
  amountCents: number;
  merchantTransactionId: string;
  invoiceId: string;
  email: string;
  givenName: string;
  surname: string;
}): Promise<{ checkoutId: string; redirectUrl: string }> {
  const c = peachConfig();
  const base = appBaseUrl();
  const res = await fetch(`${c.checkoutUrl}/v2/checkout`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      authorization: `Bearer ${await accessToken()}`,
      // Peach only accepts checkouts from domains allowlisted in its Dashboard.
      referer: `${base}/`,
    },
    body: JSON.stringify({
      authentication: { entityId: c.entityId },
      merchantTransactionId: p.merchantTransactionId,
      merchantInvoiceId: p.invoiceId,
      amount: Number((p.amountCents / 100).toFixed(2)),
      currency: "MUR",
      paymentType: "DB",
      nonce: crypto.randomUUID(),
      shopperResultUrl: `${base}/api/payments/peach/return`,
      notificationUrl: `${base}/api/payments/peach/webhook`,
      customer: { email: p.email, givenName: p.givenName.slice(0, 50), surname: p.surname.slice(0, 50) },
      merchant: { name: "Mauritius Turf Club" },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const checkoutId = String(json.checkoutId ?? "");
  const redirectUrl = String(json.redirectUrl ?? "");
  if (!res.ok || !checkoutId || !/^https:\/\//.test(redirectUrl)) {
    throw new Error(`Peach checkout creation failed (${res.status}): ${JSON.stringify(json).slice(0, 300)}`);
  }
  return { checkoutId, redirectUrl };
}

export type CheckoutStatus = {
  outcome: "success" | "pending" | "failed";
  code: string;
  description: string;
  amount: string;
  currency: string;
  merchantTransactionId: string;
  transactionId: string;
  paymentBrand: string;
};

/** Peach / ACI result codes: successful, pending, everything else is a failure. */
export function classifyResultCode(code: string): CheckoutStatus["outcome"] {
  if (/^(000\.000\.|000\.100\.1|000\.[36])/.test(code)) return "success";
  if (/^(000\.200|800\.400\.5|100\.400\.500)/.test(code)) return "pending";
  return "failed";
}

const pick = (o: Record<string, unknown>, ...paths: string[]): string => {
  for (const p of paths) {
    const v = p.includes(".") && !(p in o) ? p.split(".").reduce<unknown>((a, k) => (a as Record<string, unknown>)?.[k], o) : o[p];
    if (v !== undefined && v !== null && v !== "") return String(v);
  }
  return "";
};

/** Authoritative status, asked by the server with its own credentials. */
export async function getCheckoutStatus(checkoutId: string): Promise<CheckoutStatus> {
  const c = peachConfig();
  const res = await fetch(`${c.checkoutUrl}/v2/checkout/${encodeURIComponent(checkoutId)}/status`, {
    headers: { accept: "application/json", authorization: `Bearer ${await accessToken()}`, referer: `${appBaseUrl()}/` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Peach status query failed (${res.status})`);
  const json = (await res.json()) as Record<string, unknown>;
  const code = pick(json, "result.code", "resultCode");
  return {
    outcome: code ? classifyResultCode(code) : "pending",
    code,
    description: pick(json, "result.description", "resultDescription"),
    amount: pick(json, "amount"),
    currency: pick(json, "currency"),
    merchantTransactionId: pick(json, "merchantTransactionId"),
    transactionId: pick(json, "id", "transactionId", "paymentId"),
    paymentBrand: pick(json, "paymentBrand"),
  };
}

/**
 * Webhook signing (Peach Dashboard → Checkout → webhook signing):
 * HMAC-SHA256 over `${timestamp}.${webhookId}.${url}.${rawBody}`.
 */
export function verifyWebhookSignature(h: Headers, rawBody: string, url: string): boolean {
  const secret = peachConfig().webhookSecret;
  if (!secret) return false;
  const timestamp = h.get("x-webhook-timestamp") ?? "";
  const id = h.get("x-webhook-id") ?? "";
  const received = (h.get("x-webhook-signature") ?? "").replace(/^sha256=/i, "");
  if (!timestamp || !id || !received) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${id}.${url}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received.toLowerCase(), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
