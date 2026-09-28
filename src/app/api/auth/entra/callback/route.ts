import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { ENTRA_FLOW_COOKIE, exchangeCode } from "@/lib/entra";
import { createSession } from "@/lib/session";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/request";
import { appBaseUrl } from "@/lib/config";

const to = (path: string) => Response.redirect(`${appBaseUrl()}${path}`, 302);

/** Completes staff sign-in, records the staff user and their roles, and opens a session. */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const store = await cookies();
  const raw = store.get(ENTRA_FLOW_COOKIE)?.value;
  store.delete({ name: ENTRA_FLOW_COOKIE, path: "/api/auth/entra" });

  if (url.searchParams.get("error")) {
    return to(`/staff?error=${encodeURIComponent(url.searchParams.get("error") ?? "denied")}`);
  }
  let flow: { state: string; nonce: string; verifier: string };
  try {
    flow = JSON.parse(raw ?? "");
  } catch {
    return to("/staff?error=expired");
  }
  const code = url.searchParams.get("code");
  if (!code || url.searchParams.get("state") !== flow.state) return to("/staff?error=state");

  let identity;
  try {
    identity = await exchangeCode(code, flow.verifier, flow.nonce);
  } catch (err) {
    console.error("Entra sign-in failed", err);
    return to("/staff?error=signin");
  }

  const ip = await clientIp();
  if (identity.roles.length === 0) {
    await audit({
      actorType: "staff",
      action: "staff.login_denied_no_role",
      entityType: "staff_user",
      entityId: identity.objectId,
      ip,
      details: { email: identity.email },
    });
    return to("/staff?error=norole");
  }

  const db = getDb();
  const now = new Date();
  const [existing] = await db
    .select()
    .from(schema.staffUsers)
    .where(eq(schema.staffUsers.entraObjectId, identity.objectId))
    .limit(1);
  let staffId: string;
  if (existing) {
    await db
      .update(schema.staffUsers)
      .set({ email: identity.email, displayName: identity.displayName, roles: identity.roles, lastLoginAt: now })
      .where(eq(schema.staffUsers.id, existing.id));
    staffId = existing.id;
  } else {
    const [created] = await db
      .insert(schema.staffUsers)
      .values({
        entraObjectId: identity.objectId,
        email: identity.email,
        displayName: identity.displayName,
        roles: identity.roles,
        lastLoginAt: now,
      })
      .returning({ id: schema.staffUsers.id });
    staffId = created.id;
  }
  await audit({
    actorType: "staff",
    action: "staff.login",
    entityType: "staff_user",
    entityId: staffId,
    staffUserId: staffId,
    ip,
    details: { roles: identity.roles },
  });
  await createSession({ staffUserId: staffId });
  return to("/staff/applications");
}
