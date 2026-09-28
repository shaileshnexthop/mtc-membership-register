import { cookies } from "next/headers";
import { authorizeUrl, ENTRA_FLOW_COOKIE, newFlow } from "@/lib/entra";
import { entraConfig, isHttps } from "@/lib/config";

/** Starts staff sign-in: sends the browser to MTC's Microsoft 365 sign-in page. */
export async function GET() {
  const cfg = entraConfig();
  if (!cfg.tenantId || !cfg.clientId || !cfg.clientSecret) {
    return new Response("Staff sign-in is not configured.", { status: 503 });
  }
  const flow = newFlow();
  const store = await cookies();
  store.set(ENTRA_FLOW_COOKIE, JSON.stringify({ state: flow.state, nonce: flow.nonce, verifier: flow.verifier }), {
    httpOnly: true,
    secure: isHttps(),
    sameSite: "lax",
    path: "/api/auth/entra",
    maxAge: 600,
  });
  return Response.redirect(authorizeUrl(flow), 302);
}
