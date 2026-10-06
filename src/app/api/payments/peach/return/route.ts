import { appBaseUrl } from "@/lib/config";
import { clientIp } from "@/lib/request";
import { confirmCheckout } from "@/lib/online-payments";

/**
 * Peach sends the shopper's browser back here (POST, form-encoded) after Hosted Checkout.
 * The posted values are not trusted: the payment is confirmed by asking Peach directly.
 */
async function handle(checkoutId: string) {
  let result = "attente";
  try {
    const r = await confirmCheckout(checkoutId, await clientIp());
    result = r === "paid" ? "ok" : r === "failed" ? "echec" : "attente";
  } catch (err) {
    console.error("Peach return: status check failed", err);
  }
  return Response.redirect(`${appBaseUrl()}/candidature/paiement?resultat=${result}`, 303);
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  return handle(String(form?.get("checkoutId") ?? ""));
}

export async function GET(request: Request) {
  return handle(new URL(request.url).searchParams.get("checkoutId") ?? "");
}
