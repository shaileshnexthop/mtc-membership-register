"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStaffAction } from "@/lib/staff";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/request";
import { sendEmail } from "@/lib/mail";
import { appBaseUrl } from "@/lib/config";
import { addBusinessDays } from "@/lib/business-days";
import { formatDateFr, formatMur } from "@/lib/format";
import { DOCUMENT_REQUIREMENTS } from "@/lib/applications";
import { getBankDetails } from "@/lib/settings";
import {
  applicationApprovedEmail,
  applicationDeferredEmail,
  applicationRejectedEmail,
} from "@/lib/email-templates";
import type { FormState } from "./auth";

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const REQUIRED_KINDS = DOCUMENT_REQUIREMENTS.filter((r) => r.required).map((r) => r.kind);

async function loadApp(id: string) {
  const [app] = await getDb().select().from(schema.applications).where(eq(schema.applications.id, id)).limit(1);
  return app ?? null;
}

async function applicantContact(accountId: string) {
  const [acc] = await getDb().select().from(schema.accounts).where(eq(schema.accounts.id, accountId)).limit(1);
  return acc;
}

/** KYC-05: all required documents verified. */
async function kycComplete(applicationId: string): Promise<boolean> {
  const docs = await getDb()
    .select({ kind: schema.documents.kind, status: schema.documents.reviewStatus })
    .from(schema.documents)
    .where(and(eq(schema.documents.applicationId, applicationId), isNull(schema.documents.supersededAt)));
  return REQUIRED_KINDS.every((k) => docs.some((d) => d.kind === k && d.status === "verified"));
}

/* ------------------------------------------------------------------ */
/* KYC-05 / KYC-07: verify or reject one document                      */
/* ------------------------------------------------------------------ */

export async function reviewDocument(documentId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const staff = await requireStaffAction("reviewer", "compliance_officer");
  const decision = str(fd, "decision");
  const comment = str(fd, "comment");
  if (decision !== "verified" && decision !== "rejected" && decision !== "pending") return { error: "Invalid decision." };
  if (decision === "rejected" && !comment) return { error: "Add a comment explaining why the document is rejected." };

  const db = getDb();
  const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, documentId)).limit(1);
  if (!doc?.applicationId) return { error: "Document not found." };
  const app = await loadApp(doc.applicationId);
  if (!app || app.status !== "submitted") return { error: "Documents can only be reviewed while the application is under review." };

  await db
    .update(schema.documents)
    .set({
      reviewStatus: decision,
      reviewedById: decision === "pending" ? null : staff.id,
      reviewedAt: decision === "pending" ? null : new Date(),
      reviewComment: comment || null,
    })
    .where(eq(schema.documents.id, doc.id));
  const label = DOCUMENT_REQUIREMENTS.find((r) => r.kind === doc.kind);
  await db.insert(schema.applicationEvents).values({
    applicationId: app.id,
    actorType: "staff",
    staffUserId: staff.id,
    eventType: `kyc_${decision}`,
    subject: "KYC",
    comment: `(${label?.letter}) ${decision === "verified" ? "verified" : decision === "rejected" ? "rejected" : "reset to pending"} by ${staff.displayName}${comment ? `: ${comment}` : ""}`,
    internal: true,
  });
  await audit({
    actorType: "staff",
    action: `document.${decision}`,
    entityType: "document",
    entityId: doc.id,
    staffUserId: staff.id,
    ip: await clientIp(),
  });
  revalidatePath(`/staff/applications/${app.id}`);
  return { message: decision === "verified" ? "Document verified." : decision === "rejected" ? "Document rejected." : "Reset." };
}

/* ------------------------------------------------------------------ */
/* REV-06 / REV-07: Compliance Review                                  */
/* ------------------------------------------------------------------ */

export async function recordCompliance(applicationId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const staff = await requireStaffAction("compliance_officer");
  const outcome = str(fd, "outcome");
  const comment = str(fd, "comment");
  if (outcome !== "cleared" && outcome !== "not_cleared") return { error: "Choose cleared or not cleared." };
  if (outcome === "not_cleared" && !comment) return { error: "A comment is required when compliance is not cleared." };
  const app = await loadApp(applicationId);
  if (!app || app.status !== "submitted") return { error: "The application is not under review." };

  const db = getDb();
  await db
    .update(schema.applications)
    .set({
      complianceStatus: outcome,
      complianceOfficerId: staff.id,
      complianceReviewedAt: new Date(),
      complianceComment: comment || null,
      updatedAt: new Date(),
    })
    .where(eq(schema.applications.id, app.id));
  await db.insert(schema.applicationEvents).values({
    applicationId: app.id,
    actorType: "staff",
    staffUserId: staff.id,
    eventType: "compliance_review",
    subject: "Compliance Review",
    comment: `${outcome === "cleared" ? "Cleared" : "Not cleared"} by ${staff.displayName}${comment ? `: ${comment}` : ""}`,
    internal: true,
  });
  await audit({
    actorType: "staff",
    action: `application.compliance_${outcome}`,
    entityType: "application",
    entityId: app.id,
    staffUserId: staff.id,
    ip: await clientIp(),
  });
  revalidatePath(`/staff/applications/${app.id}`);
  return { message: "Compliance Review recorded." };
}

/* ------------------------------------------------------------------ */
/* REV-02: approve, defer or reject                                    */
/* ------------------------------------------------------------------ */

export async function decideApplication(applicationId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const staff = await requireStaffAction("reviewer");
  const decision = str(fd, "decision");
  const comment = str(fd, "comment");
  if (!["approve", "defer", "reject"].includes(decision)) return { error: "Choose approve, defer or reject." };
  if ((decision === "defer" || decision === "reject") && !comment) {
    return { error: "A comment is required to defer or reject. The applicant will see it.", values: { comment } };
  }
  const app = await loadApp(applicationId);
  if (!app || app.status !== "submitted") return { error: "Only submitted applications can be decided." };
  if (decision === "approve") {
    if (!(await kycComplete(app.id))) return { error: "Approval is blocked until documents (a) to (d) are all verified.", values: { comment } };
    if (app.complianceStatus !== "cleared") return { error: "Approval is blocked until the Compliance Review is cleared.", values: { comment } };
  }

  const db = getDb();
  const now = new Date();
  const toStatus = decision === "approve" ? "approved" : decision === "defer" ? "deferred" : "rejected";
  const paymentDueAt = decision === "approve" ? await addBusinessDays(now, 5) : null;

  await db
    .update(schema.applications)
    .set({
      status: toStatus,
      decidedById: staff.id,
      decidedAt: now,
      decisionComment: comment || null,
      paymentDueAt,
      updatedAt: now,
    })
    .where(and(eq(schema.applications.id, app.id), eq(schema.applications.status, "submitted")));

  await db.insert(schema.applicationEvents).values({
    applicationId: app.id,
    actorType: "staff",
    staffUserId: staff.id,
    eventType: toStatus,
    subject: decision === "approve" ? "Candidature approuvée" : decision === "defer" ? "Candidature différée" : "Candidature refusée",
    comment: comment || null,
    fromStatus: "submitted",
    toStatus,
  });
  await audit({
    actorType: "staff",
    action: `application.${toStatus}`,
    entityType: "application",
    entityId: app.id,
    staffUserId: staff.id,
    ip: await clientIp(),
    details: comment ? { comment } : undefined,
  });

  const acc = await applicantContact(app.accountId);
  const name = `${app.firstNames ?? ""} ${app.lastName ?? ""}`.trim() || acc.fullName;
  const link = `${appBaseUrl()}/candidature`;
  let mail;
  if (decision === "approve") {
    const [type] = app.membershipTypeId
      ? await db.select().from(schema.membershipTypes).where(eq(schema.membershipTypes.id, app.membershipTypeId)).limit(1)
      : [];
    mail = applicationApprovedEmail({
      name,
      reference: app.reference,
      typeName: type?.name ?? "Membre",
      feeLabel: type && type.feeCents > 0 ? `${formatMur(type.feeCents)} ${type.feePeriod === "monthly" ? "par mois" : "par an"}` : "[montant à confirmer]",
      dueLabel: formatDateFr(paymentDueAt),
      conditions: type?.conditionsText ?? null,
      ...(await getBankDetails()),
      link,
    });
  } else if (decision === "defer") {
    mail = applicationDeferredEmail(name, app.reference, comment, link);
  } else {
    mail = applicationRejectedEmail(name, app.reference, comment);
  }
  await sendEmail({ to: acc.email, templateKey: `application_${toStatus}`, applicationId: app.id, staffUserId: staff.id, ...mail });

  revalidatePath(`/staff/applications/${app.id}`);
  revalidatePath("/staff/applications");
  return {
    message:
      decision === "approve"
        ? `Approved. The applicant has been emailed the conditions and payment request, due ${formatDateFr(paymentDueAt)}.`
        : decision === "defer"
          ? "Deferred. The applicant has been emailed your comment and can edit and resubmit."
          : "Rejected. The applicant has been emailed your comment. The application is closed.",
  };
}

/* ------------------------------------------------------------------ */
/* REV-03 / REV-06: observations (internal log)                        */
/* ------------------------------------------------------------------ */

export async function addObservation(applicationId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const staff = await requireStaffAction("reviewer", "compliance_officer", "administrator");
  const subject = str(fd, "subject");
  const comment = str(fd, "comment");
  if (!subject || !comment) return { error: "Enter a subject and a comment.", values: { subject, comment } };
  await getDb().insert(schema.applicationEvents).values({
    applicationId,
    actorType: "staff",
    staffUserId: staff.id,
    eventType: "observation",
    subject: subject.slice(0, 120),
    comment: comment.slice(0, 2000),
    internal: true,
  });
  revalidatePath(`/staff/applications/${applicationId}`);
  return { message: "Observation added." };
}

/* ------------------------------------------------------------------ */
/* Administrator override: reopen a rejected application               */
/* ------------------------------------------------------------------ */

/**
 * A rejection is final for reviewers and applicants. Only an Administrator can
 * reopen one, with a recorded reason: either back to review (e.g. rejected by
 * mistake) or back to the applicant to edit and resubmit (as if deferred).
 */
export async function reopenApplication(applicationId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const staff = await requireStaffAction("administrator");
  const mode = str(fd, "mode");
  const reason = str(fd, "reason");
  if (mode !== "review" && mode !== "edit") return { error: "Choose how to reopen the application.", values: { reason } };
  if (reason.length < 5) return { error: "Give the reason for reopening. It is kept in the history.", values: { reason } };

  const app = await loadApp(applicationId);
  if (!app || app.status !== "rejected") return { error: "Only a rejected application can be reopened." };

  const db = getDb();
  const [otherOpen] = await db
    .select({ reference: schema.applications.reference })
    .from(schema.applications)
    .where(
      and(
        eq(schema.applications.accountId, app.accountId),
        inArray(schema.applications.status, ["draft", "submitted", "deferred", "approved"]),
      ),
    )
    .limit(1);
  if (otherOpen) return { error: `This applicant already has an open application (${otherOpen.reference}).` };

  const toStatus = mode === "review" ? "submitted" : "deferred";
  const now = new Date();
  await db
    .update(schema.applications)
    .set({
      status: toStatus,
      decisionComment: mode === "edit" ? reason : app.decisionComment,
      updatedAt: now,
    })
    .where(and(eq(schema.applications.id, app.id), eq(schema.applications.status, "rejected")));
  await db.insert(schema.applicationEvents).values({
    applicationId: app.id,
    actorType: "staff",
    staffUserId: staff.id,
    eventType: "reopened",
    subject: mode === "review" ? "Rejection overridden – back to review" : "Rejection overridden – returned to applicant",
    comment: `By ${staff.displayName} (Administrator): ${reason}`,
    internal: mode === "review",
    fromStatus: "rejected",
    toStatus,
  });
  await audit({
    actorType: "staff",
    action: "application.reopened",
    entityType: "application",
    entityId: app.id,
    staffUserId: staff.id,
    ip: await clientIp(),
    details: { mode, reason },
  });

  if (mode === "edit") {
    const acc = await applicantContact(app.accountId);
    const name = `${app.firstNames ?? ""} ${app.lastName ?? ""}`.trim() || acc.fullName;
    const mail = applicationDeferredEmail(name, app.reference, reason, `${appBaseUrl()}/candidature`);
    await sendEmail({ to: acc.email, templateKey: "application_reopened", applicationId: app.id, staffUserId: staff.id, ...mail });
  }

  revalidatePath(`/staff/applications/${app.id}`);
  revalidatePath("/staff/applications");
  return {
    message:
      mode === "review"
        ? "Reopened and back in the review queue."
        : "Reopened. The applicant has been emailed the reason and can edit and resubmit.",
  };
}
