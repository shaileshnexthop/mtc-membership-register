"use server";

import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { getCurrentAccount } from "@/lib/session";
import {
  checkCompleteness,
  createDraft,
  getApplicationForAccount,
  getSponsors,
  isEditable,
  MAX_SPONSORS,
  MIN_SPONSORS,
} from "@/lib/applications";
import { clientIp, userAgent } from "@/lib/request";
import { audit } from "@/lib/audit";
import { randomToken, sha256 } from "@/lib/crypto";
import { appBaseUrl } from "@/lib/config";
import { sendEmail } from "@/lib/mail";
import { applicationSubmittedEmail, sponsorRequestEmail } from "@/lib/email-templates";
import type { FormState } from "./auth";

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const optional = (v: string) => (v === "" ? null : v);

async function editableApplication() {
  const account = await getCurrentAccount();
  if (!account) redirect("/connexion");
  const app = await getApplicationForAccount(account.id);
  if (!app || !isEditable(app.status)) redirect("/candidature");
  return { account, app };
}

function issuesToFieldErrors(issues: z.core.$ZodIssue[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) out[String(i.path.join("."))] ??= i.message;
  return out;
}

/* ------------------------------------------------------------------ */
/* Step 1: type d'adhésion + I. Informations personnelles + II. Emploi */
/* ------------------------------------------------------------------ */

const personalSchema = z.object({
  membershipTypeId: z.uuid({ error: "Choisissez un type d’adhésion." }),
  lastName: z.string().min(1, { error: "Indiquez votre nom." }).max(100),
  firstNames: z.string().min(1, { error: "Indiquez vos prénoms." }).max(150),
  dateOfBirth: z.iso.date({ error: "Indiquez votre date de naissance." }),
  nationality: z.string().min(2, { error: "Indiquez votre nationalité." }).max(80),
  idNumber: z.string().min(4, { error: "Indiquez le numéro de votre CNI ou passeport." }).max(40),
  residentialAddress: z.string().min(5, { error: "Indiquez votre adresse résidentielle." }).max(400),
  mobilePhone: z.string().min(7, { error: "Indiquez votre téléphone portable." }).max(30),
  homePhone: z.string().max(30),
  profession: z.string().min(2, { error: "Indiquez votre profession ou occupation." }).max(120),
  employerName: z.string().max(150),
  workAddress: z.string().max(400),
});

export async function savePersonal(_prev: FormState, fd: FormData): Promise<FormState> {
  const { account, app } = await editableApplication();
  const values = Object.fromEntries(
    Object.keys(personalSchema.shape).map((k) => [k, str(fd, k)]),
  ) as Record<keyof typeof personalSchema.shape, string>;
  const intent = str(fd, "intent");

  const parsed = personalSchema.safeParse(values);
  // "Save draft" keeps whatever is there; "continue" requires the step to be complete.
  if (!parsed.success && intent !== "draft") {
    return {
      fieldErrors: issuesToFieldErrors(parsed.error.issues),
      values,
      error: "Certains champs sont à compléter ou à corriger.",
    };
  }
  const dob = values.dateOfBirth;
  await getDb()
    .update(schema.applications)
    .set({
      membershipTypeId: /^[0-9a-f-]{36}$/i.test(values.membershipTypeId) ? values.membershipTypeId : null,
      lastName: optional(values.lastName),
      firstNames: optional(values.firstNames),
      dateOfBirth: /^\d{4}-\d{2}-\d{2}$/.test(dob) ? dob : null,
      nationality: optional(values.nationality),
      idNumber: optional(values.idNumber.toUpperCase()),
      residentialAddress: optional(values.residentialAddress),
      mobilePhone: optional(values.mobilePhone),
      homePhone: optional(values.homePhone),
      profession: optional(values.profession),
      employerName: optional(values.employerName),
      workAddress: optional(values.workAddress),
      updatedAt: new Date(),
    })
    .where(and(eq(schema.applications.id, app.id), eq(schema.applications.accountId, account.id)));

  if (intent === "draft") return { message: "Brouillon enregistré.", values };
  redirect("/candidature/parrainage");
}

/* ------------------------------------------------------------------ */
/* Step 2: III. Parrainage                                              */
/* ------------------------------------------------------------------ */

const sponsorSchema = z.object({
  lastName: z.string().min(1, { error: "Nom requis." }).max(100),
  firstNames: z.string().min(1, { error: "Prénom(s) requis." }).max(150),
  phone: z.string().max(30),
  email: z.email({ error: "Adresse courriel invalide." }).max(254),
});

export async function saveSponsors(_prev: FormState, fd: FormData): Promise<FormState> {
  const { account, app } = await editableApplication();
  const intent = str(fd, "intent");
  const values: Record<string, string> = {};
  const rows: { position: number; data: z.infer<typeof sponsorSchema> }[] = [];
  const fieldErrors: Record<string, string> = {};

  for (let n = 1; n <= MAX_SPONSORS; n++) {
    const row = {
      lastName: str(fd, `s${n}_lastName`),
      firstNames: str(fd, `s${n}_firstNames`),
      phone: str(fd, `s${n}_phone`),
      email: str(fd, `s${n}_email`).toLowerCase(),
    };
    for (const [k, v] of Object.entries(row)) values[`s${n}_${k}`] = v;
    if (!row.lastName && !row.firstNames && !row.phone && !row.email) continue;
    const parsed = sponsorSchema.safeParse(row);
    if (!parsed.success) {
      for (const i of parsed.error.issues) fieldErrors[`s${n}_${String(i.path[0])}`] ??= i.message;
      continue;
    }
    if (row.email === account.email) {
      fieldErrors[`s${n}_email`] = "Vous ne pouvez pas être votre propre parrain.";
      continue;
    }
    rows.push({ position: n, data: parsed.data });
  }

  const emails = rows.map((r) => r.data.email);
  if (new Set(emails).size !== emails.length) {
    return { error: "Chaque parrain doit avoir une adresse courriel différente.", values, fieldErrors };
  }
  if (Object.keys(fieldErrors).length && intent !== "draft") {
    return { error: "Certains champs sont à compléter ou à corriger.", values, fieldErrors };
  }
  if (rows.length < MIN_SPONSORS && intent !== "draft") {
    return {
      error: `Indiquez au moins ${MIN_SPONSORS} parrain${MIN_SPONSORS > 1 ? "s" : ""}.`,
      values,
      fieldErrors,
    };
  }

  const db = getDb();
  const existing = await getSponsors(app.id);
  await db.transaction(async (tx) => {
    for (let n = 1; n <= MAX_SPONSORS; n++) {
      const row = rows.find((r) => r.position === n);
      const prev = existing.find((e) => e.position === n);
      if (!row) {
        if (prev) await tx.delete(schema.applicationSponsors).where(eq(schema.applicationSponsors.id, prev.id));
        continue;
      }
      if (prev) {
        const sameSponsor = prev.email === row.data.email;
        await tx
          .update(schema.applicationSponsors)
          .set({
            ...row.data,
            phone: optional(row.data.phone),
            // A different person must confirm again.
            ...(sameSponsor
              ? {}
              : { confirmedAt: null, declinedAt: null, requestedAt: null, confirmTokenHash: null }),
          })
          .where(eq(schema.applicationSponsors.id, prev.id));
      } else {
        await tx.insert(schema.applicationSponsors).values({
          applicationId: app.id,
          position: n,
          ...row.data,
          phone: optional(row.data.phone),
        });
      }
    }
    await tx.update(schema.applications).set({ updatedAt: new Date() }).where(eq(schema.applications.id, app.id));
  });

  if (intent === "draft") return { message: "Brouillon enregistré.", values };
  redirect("/candidature/documents");
}

/* ------------------------------------------------------------------ */
/* Step 4: IV–VII declarations, electronic signature, submission        */
/* ------------------------------------------------------------------ */

export async function submitApplication(_prev: FormState, fd: FormData): Promise<FormState> {
  const { account, app } = await editableApplication();
  const values = {
    signatureName: str(fd, "signatureName"),
    signaturePlace: str(fd, "signaturePlace"),
  };
  const fieldErrors: Record<string, string> = {};
  if (values.signatureName.length < 3) fieldErrors.signatureName = "Saisissez vos nom et prénoms complets.";
  if (values.signaturePlace.length < 2) fieldErrors.signaturePlace = "Indiquez le lieu (Fait à).";
  const checks = ["declAccurate", "declNoRight", "declDiscretion", "dataProtection", "aml"];
  for (const c of checks) if (fd.get(c) !== "on") fieldErrors[c] = "Cette déclaration est requise.";
  if (Object.keys(fieldErrors).length) {
    return { error: "Complétez les déclarations et la signature.", fieldErrors, values };
  }

  const missing = await checkCompleteness(app.id);
  const gaps = [...missing.personal, ...missing.sponsors, ...missing.documents];
  if (gaps.length) {
    return { error: `Votre dossier est incomplet : ${gaps.join(", ")}.`, values };
  }

  const db = getDb();
  const now = new Date();
  const ip = await clientIp();
  const fromStatus = app.status;
  await db
    .update(schema.applications)
    .set({
      status: "submitted",
      declarationAcceptedAt: now,
      dataProtectionAckAt: now,
      amlAckAt: now,
      signatureName: values.signatureName,
      signaturePlace: values.signaturePlace,
      signedAt: now,
      signatureIp: ip,
      signatureUserAgent: await userAgent(),
      receivedAt: app.receivedAt ?? now, // Date de réception du dossier = first submission
      lastSubmittedAt: now,
      submissionCount: app.submissionCount + 1,
      updatedAt: now,
    })
    .where(eq(schema.applications.id, app.id));
  await db.insert(schema.applicationEvents).values({
    applicationId: app.id,
    actorType: "applicant",
    accountId: account.id,
    eventType: fromStatus === "deferred" ? "resubmitted" : "submitted",
    subject: fromStatus === "deferred" ? "Dossier modifié et soumis à nouveau" : "Dossier reçu",
    comment: `Signé électroniquement par ${values.signatureName}, fait à ${values.signaturePlace}.`,
    fromStatus,
    toStatus: "submitted",
  });
  await audit({
    actorType: "applicant",
    action: fromStatus === "deferred" ? "application.resubmitted" : "application.submitted",
    entityType: "application",
    entityId: app.id,
    accountId: account.id,
    ip,
  });

  // APP-07: ask each sponsor who has not yet answered to confirm by email.
  const applicantName = `${app.firstNames ?? ""} ${app.lastName ?? ""}`.trim() || account.fullName;
  const sponsors = await getSponsors(app.id);
  for (const sp of sponsors) {
    if (sp.confirmedAt || sp.declinedAt) continue;
    const token = randomToken(32);
    await db
      .update(schema.applicationSponsors)
      .set({ confirmTokenHash: sha256(token), requestedAt: now })
      .where(eq(schema.applicationSponsors.id, sp.id));
    const mail = sponsorRequestEmail(
      `${sp.firstNames} ${sp.lastName}`,
      applicantName,
      app.reference,
      `${appBaseUrl()}/parrainage?token=${encodeURIComponent(token)}`,
    );
    await sendEmail({ to: sp.email, templateKey: "sponsor_request", applicationId: app.id, ...mail });
  }

  const ack = applicationSubmittedEmail(applicantName, app.reference, `${appBaseUrl()}/candidature`);
  await sendEmail({ to: account.email, templateKey: "application_submitted", applicationId: app.id, ...ack });

  redirect("/candidature?soumise=1");
}

/* ------------------------------------------------------------------ */
/* Sponsor confirmation (APP-07), no account needed                     */
/* ------------------------------------------------------------------ */

export async function answerSponsorship(_prev: FormState, fd: FormData): Promise<FormState> {
  const token = str(fd, "token");
  const answer = str(fd, "answer");
  if (!token || (answer !== "confirm" && answer !== "decline")) {
    return { error: "Demande invalide." };
  }
  const db = getDb();
  const [sp] = await db
    .select()
    .from(schema.applicationSponsors)
    .where(
      and(
        eq(schema.applicationSponsors.confirmTokenHash, sha256(token)),
        isNull(schema.applicationSponsors.confirmedAt),
        isNull(schema.applicationSponsors.declinedAt),
      ),
    )
    .limit(1);
  if (!sp) return { error: "Ce lien n’est plus valable ou une réponse a déjà été enregistrée." };

  const now = new Date();
  await db
    .update(schema.applicationSponsors)
    .set(answer === "confirm" ? { confirmedAt: now } : { declinedAt: now })
    .where(eq(schema.applicationSponsors.id, sp.id));
  await db.insert(schema.applicationEvents).values({
    applicationId: sp.applicationId,
    actorType: "system",
    eventType: answer === "confirm" ? "sponsor_confirmed" : "sponsor_declined",
    subject: "Parrainage",
    comment: `${sp.firstNames} ${sp.lastName} (${sp.email}) a ${answer === "confirm" ? "confirmé" : "décliné"} le parrainage.`,
  });
  await audit({
    actorType: "system",
    action: answer === "confirm" ? "sponsor.confirmed" : "sponsor.declined",
    entityType: "application_sponsor",
    entityId: sp.id,
    ip: await clientIp(),
  });
  return {
    message:
      answer === "confirm"
        ? "Merci. Votre parrainage a été confirmé et transmis au Club."
        : "Votre réponse a été enregistrée. Le Club en sera informé.",
  };
}

/** APP-01: only verified accounts reach this; creates the draft if none is open. */
export async function startApplication(): Promise<void> {
  const account = await getCurrentAccount();
  if (!account) redirect("/connexion");
  const existing = await getApplicationForAccount(account.id);
  // A rejected application is final; whether a new one may follow is an open item for MTC.
  if (existing && !isEditable(existing.status)) redirect("/candidature");
  if (!existing) await createDraft(account.id);
  redirect("/candidature/informations");
}
