import { appBaseUrl } from "@/lib/config";
import { clientIp } from "@/lib/request";
import { audit } from "@/lib/audit";
import { peachConfig, verifyWebhookSignature } from "@/lib/peach";
import { confirmCheckout } from "@/lib/online-payments";

/**
 * Peach Checkout webhook (PAY-03). When webhook signing is enabled in the Peach Dashboard
 * (PEACH_WEBHOOK_SECRET set), unsigned or badly signed calls are refused. Either way the
 * body is only a prompt: the payment is confirmed by querying Peach for the checkout status.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const url = `${appBaseUrl()}/api/payments/peach/webhook`;
  if (peachConfig().webhookSecret && !verifyWebhookSignature(request.headers, raw, url)) {
    await audit({ actorType: "system", action: "payment.webhook_rejected", entityType: "payment", ip: await clientIp() });
    return new Response("Invalid signature", { status: 401 });
  }

  let checkoutId = "";
  if ((request.headers.get("content-type") ?? "").includes("json")) {
    try {
      const j = JSON.parse(raw) as Record<string, unknown>;
      checkoutId = String(j.checkoutId ?? "");
    } catch {
      /* ignore */
    }
  } else {
    checkoutId = new URLSearchParams(raw).get("checkoutId") ?? "";
  }
  if (!checkoutId) return new Response("OK"); // e.g. the configuration test call

  try {
    await confirmCheckout(checkoutId, await clientIp());
    return new Response("OK");
  } catch (err) {
    console.error("Peach webhook: status check failed", err);
    return new Response("Retry later", { status: 503 }); // Peach retries
  }
}
