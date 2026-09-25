import "server-only";
import { cookies } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { randomToken, sha256 } from "./crypto";
import { isHttps } from "./config";
import { clientIp, userAgent } from "./request";

export const SESSION_COOKIE = "mtc_session";
const ACCOUNT_SESSION_DAYS = 7;
const STAFF_SESSION_HOURS = 10;

type SessionOwner = { accountId: string } | { staffUserId: string };

/** Creates a server-side session and sets its cookie. Only the hash is stored. */
export async function createSession(owner: SessionOwner): Promise<void> {
  const token = randomToken(32);
  const isStaff = "staffUserId" in owner;
  const ttlMs = isStaff
    ? STAFF_SESSION_HOURS * 3600_000
    : ACCOUNT_SESSION_DAYS * 86400_000;
  const expiresAt = new Date(Date.now() + ttlMs);

  await getDb()
    .insert(schema.sessions)
    .values({
      id: sha256(token),
      accountId: isStaff ? null : owner.accountId,
      staffUserId: isStaff ? owner.staffUserId : null,
      expiresAt,
      ip: await clientIp(),
      userAgent: await userAgent(),
    });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isHttps(),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

async function currentSessionRow() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [row] = await getDb()
    .select()
    .from(schema.sessions)
    .where(
      and(
        eq(schema.sessions.id, sha256(token)),
        gt(schema.sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** The signed-in applicant or member account, or null. */
export async function getCurrentAccount() {
  const session = await currentSessionRow();
  if (!session?.accountId) return null;
  const [account] = await getDb()
    .select({
      id: schema.accounts.id,
      email: schema.accounts.email,
      fullName: schema.accounts.fullName,
      emailVerifiedAt: schema.accounts.emailVerifiedAt,
    })
    .from(schema.accounts)
    .where(eq(schema.accounts.id, session.accountId))
    .limit(1);
  return account ?? null;
}

/** The signed-in staff user, or null. */
export async function getCurrentStaff() {
  const session = await currentSessionRow();
  if (!session?.staffUserId) return null;
  const [staff] = await getDb()
    .select()
    .from(schema.staffUsers)
    .where(eq(schema.staffUsers.id, session.staffUserId))
    .limit(1);
  return staff ?? null;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await getDb().delete(schema.sessions).where(eq(schema.sessions.id, sha256(token)));
  }
  store.delete(SESSION_COOKIE);
}

/** Signs an account out everywhere, e.g. after a password reset. */
export async function destroyAllAccountSessions(accountId: string): Promise<void> {
  await getDb().delete(schema.sessions).where(eq(schema.sessions.accountId, accountId));
}
