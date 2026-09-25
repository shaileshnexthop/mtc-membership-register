"use server";

import { redirect } from "next/navigation";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { appBaseUrl } from "@/lib/config";
import { hashPassword, randomToken, sha256, verifyPassword } from "@/lib/crypto";
import { checkPassword } from "@/lib/password-policy";
import { createSession, destroyAllAccountSessions, destroySession } from "@/lib/session";
import { sendEmail } from "@/lib/mail";
import { accountExistsEmail, passwordResetEmail, verificationEmail } from "@/lib/email-templates";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/request";

export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
  message?: string;
};

const VERIFY_HOURS = 24; // REG-03
const RESET_HOURS = 1;
const MAX_FAILED_LOGINS = 5; // REG-06
const LOCK_MINUTES = 15;

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const normaliseEmail = (e: string) => e.trim().toLowerCase();

async function issueToken(
  accountId: string,
  purpose: "email_verification" | "password_reset",
  hours: number,
): Promise<string> {
  const token = randomToken(32);
  await getDb()
    .insert(schema.accountTokens)
    .values({
      accountId,
      purpose,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + hours * 3600_000),
    });
  return token;
}

async function sendVerification(account: { id: string; email: string; fullName: string }) {
  const token = await issueToken(account.id, "email_verification", VERIFY_HOURS);
  const link = `${appBaseUrl()}/verification?token=${encodeURIComponent(token)}`;
  const mail = verificationEmail(account.fullName, link);
  await sendEmail({ to: account.email, templateKey: "verification", ...mail });
}

/* ------------------------------------------------------------------ */
/* REG-01 / REG-02: registration                                       */
/* ------------------------------------------------------------------ */

const registerSchema = z
  .object({
    lastName: z.string().trim().min(1, { error: "Indiquez votre nom." }).max(100),
    firstNames: z.string().trim().min(1, { error: "Indiquez vos prénoms." }).max(150),
    email: z.email({ error: "Adresse courriel invalide." }).max(254),
    mobilePhone: z
      .string()
      .trim()
      .min(7, { error: "Indiquez un numéro de téléphone portable." })
      .max(30),
    password: z.string(),
    passwordConfirm: z.string(),
  })
  .refine((v) => v.password === v.passwordConfirm, {
    path: ["passwordConfirm"],
    error: "Les deux mots de passe ne correspondent pas.",
  });

export async function register(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = {
    lastName: str(fd, "lastName"),
    firstNames: str(fd, "firstNames"),
    email: normaliseEmail(str(fd, "email")),
    mobilePhone: str(fd, "mobilePhone"),
  };
  const parsed = registerSchema.safeParse({
    ...values,
    password: String(fd.get("password") ?? ""),
    passwordConfirm: String(fd.get("passwordConfirm") ?? ""),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    return { fieldErrors, values };
  }
  const passwordError = await checkPassword(parsed.data.password);
  if (passwordError) return { fieldErrors: { password: passwordError }, values };

  const db = getDb();
  const [existing] = await db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.email, values.email))
    .limit(1);

  if (existing) {
    // Same response either way, so the form cannot be used to find out who has an account.
    if (existing.emailVerifiedAt) {
      const mail = accountExistsEmail(
        existing.fullName,
        `${appBaseUrl()}/connexion`,
        `${appBaseUrl()}/mot-de-passe-oublie`,
      );
      await sendEmail({ to: existing.email, templateKey: "account_exists", ...mail });
    } else {
      await sendVerification(existing);
    }
  } else {
    const [account] = await db
      .insert(schema.accounts)
      .values({
        email: values.email,
        fullName: `${values.firstNames} ${values.lastName}`,
        lastName: values.lastName,
        firstNames: values.firstNames,
        mobilePhone: values.mobilePhone,
        passwordHash: await hashPassword(parsed.data.password),
      })
      .returning();
    await audit({
      actorType: "applicant",
      action: "account.registered",
      entityType: "account",
      entityId: account.id,
      accountId: account.id,
      ip: await clientIp(),
    });
    await sendVerification(account);
  }
  redirect(`/inscription/envoye?email=${encodeURIComponent(values.email)}`);
}

export async function resendVerification(_prev: FormState, fd: FormData): Promise<FormState> {
  const email = normaliseEmail(str(fd, "email"));
  if (email) {
    const [account] = await getDb()
      .select()
      .from(schema.accounts)
      .where(and(eq(schema.accounts.email, email), isNull(schema.accounts.emailVerifiedAt)))
      .limit(1);
    if (account) await sendVerification(account);
  }
  return {
    message:
      "Si un compte non vérifié existe pour cette adresse, un nouveau lien vient d’être envoyé.",
    values: { email },
  };
}

/* ------------------------------------------------------------------ */
/* REG-02: email verification activates the account                    */
/* ------------------------------------------------------------------ */

export async function verifyEmail(_prev: FormState, fd: FormData): Promise<FormState> {
  const token = str(fd, "token");
  const db = getDb();
  const [row] = token
    ? await db
        .select()
        .from(schema.accountTokens)
        .where(
          and(
            eq(schema.accountTokens.tokenHash, sha256(token)),
            eq(schema.accountTokens.purpose, "email_verification"),
            isNull(schema.accountTokens.usedAt),
            gt(schema.accountTokens.expiresAt, new Date()),
          ),
        )
        .limit(1)
    : [];
  if (!row) {
    return {
      error:
        "Ce lien n’est plus valable. Il a peut-être expiré ou déjà été utilisé. Demandez un nouveau lien ci-dessous.",
    };
  }
  const now = new Date();
  await db.update(schema.accountTokens).set({ usedAt: now }).where(eq(schema.accountTokens.id, row.id));
  await db
    .update(schema.accounts)
    .set({ emailVerifiedAt: now })
    .where(and(eq(schema.accounts.id, row.accountId), isNull(schema.accounts.emailVerifiedAt)));
  await audit({
    actorType: "applicant",
    action: "account.email_verified",
    entityType: "account",
    entityId: row.accountId,
    accountId: row.accountId,
    ip: await clientIp(),
  });
  await createSession({ accountId: row.accountId });
  redirect("/espace?bienvenue=1");
}

/* ------------------------------------------------------------------ */
/* Sign-in with lockout (REG-06)                                        */
/* ------------------------------------------------------------------ */

export async function login(_prev: FormState, fd: FormData): Promise<FormState> {
  const email = normaliseEmail(str(fd, "email"));
  const password = String(fd.get("password") ?? "");
  const values = { email };
  const generic = { error: "Adresse courriel ou mot de passe incorrect.", values };
  if (!email || !password) return generic;

  const db = getDb();
  const [account] = await db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.email, email))
    .limit(1);
  if (!account) {
    await hashPassword(password); // similar timing whether or not the account exists
    return generic;
  }

  const now = new Date();
  if (account.lockedUntil && account.lockedUntil > now) {
    return {
      error: `Trop de tentatives. Votre compte est bloqué pendant ${LOCK_MINUTES} minutes. Réessayez plus tard ou réinitialisez votre mot de passe.`,
      values,
    };
  }

  const ip = await clientIp();
  if (!(await verifyPassword(password, account.passwordHash))) {
    const failed = account.failedLogins + 1;
    const lock = failed >= MAX_FAILED_LOGINS;
    await db
      .update(schema.accounts)
      .set({
        failedLogins: lock ? 0 : failed,
        lockedUntil: lock ? new Date(now.getTime() + LOCK_MINUTES * 60_000) : account.lockedUntil,
      })
      .where(eq(schema.accounts.id, account.id));
    await audit({
      actorType: "applicant",
      action: lock ? "account.locked" : "account.login_failed",
      entityType: "account",
      entityId: account.id,
      accountId: account.id,
      ip,
    });
    return generic;
  }

  if (!account.emailVerifiedAt) {
    return {
      error:
        "Votre adresse courriel n’est pas encore confirmée. Ouvrez le lien reçu par courriel, ou demandez un nouveau lien.",
      values,
    };
  }

  await db
    .update(schema.accounts)
    .set({ failedLogins: 0, lockedUntil: null, lastLoginAt: now })
    .where(eq(schema.accounts.id, account.id));
  await audit({
    actorType: "applicant",
    action: "account.login",
    entityType: "account",
    entityId: account.id,
    accountId: account.id,
    ip,
  });
  await createSession({ accountId: account.id });
  redirect("/espace");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/connexion?deconnecte=1");
}

/* ------------------------------------------------------------------ */
/* REG-05: password reset by email link                                 */
/* ------------------------------------------------------------------ */

export async function requestPasswordReset(_prev: FormState, fd: FormData): Promise<FormState> {
  const email = normaliseEmail(str(fd, "email"));
  if (email) {
    const [account] = await getDb()
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.email, email))
      .limit(1);
    if (account) {
      const token = await issueToken(account.id, "password_reset", RESET_HOURS);
      const link = `${appBaseUrl()}/mot-de-passe/nouveau?token=${encodeURIComponent(token)}`;
      const mail = passwordResetEmail(account.fullName, link);
      await sendEmail({ to: account.email, templateKey: "password_reset", ...mail });
    }
  }
  return {
    message:
      "Si un compte existe pour cette adresse, vous allez recevoir un courriel avec un lien pour choisir un nouveau mot de passe.",
    values: { email },
  };
}

export async function resetPassword(_prev: FormState, fd: FormData): Promise<FormState> {
  const token = str(fd, "token");
  const password = String(fd.get("password") ?? "");
  const confirm = String(fd.get("passwordConfirm") ?? "");
  if (password !== confirm) {
    return { fieldErrors: { passwordConfirm: "Les deux mots de passe ne correspondent pas." } };
  }
  const passwordError = await checkPassword(password);
  if (passwordError) return { fieldErrors: { password: passwordError } };

  const db = getDb();
  const [row] = token
    ? await db
        .select()
        .from(schema.accountTokens)
        .where(
          and(
            eq(schema.accountTokens.tokenHash, sha256(token)),
            eq(schema.accountTokens.purpose, "password_reset"),
            isNull(schema.accountTokens.usedAt),
            gt(schema.accountTokens.expiresAt, new Date()),
          ),
        )
        .limit(1)
    : [];
  if (!row) {
    return { error: "Ce lien n’est plus valable. Demandez un nouveau lien de réinitialisation." };
  }
  const now = new Date();
  await db.update(schema.accountTokens).set({ usedAt: now }).where(eq(schema.accountTokens.id, row.id));
  await db
    .update(schema.accounts)
    .set({
      passwordHash: await hashPassword(password),
      failedLogins: 0,
      lockedUntil: null,
      // The reset link proves control of the mailbox; keep the original date if already verified.
      emailVerifiedAt: sql`coalesce(${schema.accounts.emailVerifiedAt}, now())`,
    })
    .where(eq(schema.accounts.id, row.accountId));
  await destroyAllAccountSessions(row.accountId);
  await audit({
    actorType: "applicant",
    action: "account.password_reset",
    entityType: "account",
    entityId: row.accountId,
    accountId: row.accountId,
    ip: await clientIp(),
  });
  redirect("/connexion?reinitialise=1");
}
