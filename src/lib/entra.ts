import "server-only";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { createHash, randomBytes } from "node:crypto";
import { appBaseUrl, entraConfig } from "./config";

/**
 * Staff sign-in with MTC's Microsoft 365 tenant: OpenID Connect authorisation
 * code flow with PKCE. The ID token's signature, issuer, audience, tenant and
 * nonce are all verified before a staff session is created.
 */

export const ENTRA_FLOW_COOKIE = "mtc_entra_flow";

/** Entra app role values (as configured in the app registration) → portal roles. */
export const ROLE_MAP = {
  Reviewer: "reviewer",
  ComplianceOfficer: "compliance_officer",
  Approver: "approver",
  Finance: "finance",
  Administrator: "administrator",
} as const;
export type StaffRole = (typeof ROLE_MAP)[keyof typeof ROLE_MAP];

export function redirectUri(): string {
  return `${appBaseUrl()}/api/auth/entra/callback`;
}

const b64url = (buf: Buffer) => buf.toString("base64url");

export function newFlow() {
  const state = b64url(randomBytes(24));
  const nonce = b64url(randomBytes(24));
  const verifier = b64url(randomBytes(48));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  return { state, nonce, verifier, challenge };
}

export function authorizeUrl(flow: { state: string; nonce: string; challenge: string }): string {
  const { tenantId, clientId } = entraConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri(),
    response_mode: "query",
    scope: "openid profile email",
    state: flow.state,
    nonce: flow.nonce,
    code_challenge: flow.challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params}`;
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

export type StaffIdentity = {
  objectId: string;
  email: string;
  displayName: string;
  roles: StaffRole[];
};

export async function exchangeCode(code: string, verifier: string, nonce: string): Promise<StaffIdentity> {
  const { tenantId, clientId, clientSecret } = entraConfig();
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
      code_verifier: verifier,
      scope: "openid profile email",
    }),
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  const body = (await res.json()) as { id_token?: string; error?: string; error_description?: string };
  if (!res.ok || !body.id_token) {
    throw new Error(`token exchange failed: ${body.error ?? res.status} ${body.error_description ?? ""}`.trim());
  }

  jwks ??= createRemoteJWKSet(
    new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`),
  );
  const { payload } = await jwtVerify(body.id_token, jwks, {
    issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
    audience: clientId,
  });
  if (payload.nonce !== nonce) throw new Error("nonce mismatch");
  if (payload.tid !== tenantId) throw new Error("wrong tenant");

  const rawRoles = Array.isArray(payload.roles) ? (payload.roles as string[]) : [];
  const roles = rawRoles
    .map((r) => ROLE_MAP[r as keyof typeof ROLE_MAP])
    .filter((r): r is StaffRole => Boolean(r));
  const email = String(payload.email ?? payload.preferred_username ?? "").toLowerCase();
  return {
    objectId: String(payload.oid),
    email,
    displayName: String(payload.name ?? email),
    roles,
  };
}
