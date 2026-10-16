"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStaffAction } from "@/lib/staff";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/request";
import { sendEmail } from "@/lib/mail";
import { appBaseUrl } from "@/lib/config";
import { formatDateEn, formatDateFr } from "@/lib/format";
import { applyDueUpgrades, feeLabelEn, feeLabelFr, staffWithRole, todayMu } from "@/lib/members";
import {
  membershipChangedEmail,
  upgradeDecisionStaffEmail,
  upgradeRequestedStaffEmail,
} from "@/lib/email-templates";
import type { FormState } from "./auth";

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

function shiftDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** UPG-01 … UPG-03: Reviewer or Administrator raises a change of membership type. */
export async function requestUpgrade(memberId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const staff = await requireStaffAction("reviewer", "administrator");
  const values = { toTypeId: str(fd, "toTypeId"), effectiveDate: str(fd, "effectiveDate"), reason: str(fd, "reason") };
  const fieldErrors: Record<string, string> = {};
  const today = todayMu();
  if (!values.toTypeId) fieldErrors.toTypeId = "Choose the new membership type.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.effectiveDate)) fieldErrors.effectiveDate = "Enter the date the change takes effect.";
  else if (values.effectiveDate < shiftDays(today, -31)) fieldErrors.effectiveDate = "The date cannot be more than a month in the past.";
  else if (values.effectiveDate > shiftDays(today, 366)) fieldErrors.effectiveDate = "The date cannot be more than a year ahead.";
  if (!values.reason) fieldErrors.reason = "Give the reason for the change.";
  if (Object.keys(fieldErrors).length) return { error: "Check the highlighted fields.", fieldErrors, values };

  const db = getDb();
  const [m] = await db.select().from(schema.members).where(eq(schema.members.id, memberId)).limit(1);
  if (!m) return { error: "Member not found." };
  if (m.status !== "active" && m.status !== "renewal_due") return { error: "Only an active member's type can be changed.", values };
  if (values.toTypeId === m.membershipTypeId) return { error: "Choose a type different from the current one.", values };
  if (values.effectiveDate < m.continuousSince) return { error: "The date cannot be before the member's current membership started.", values };
  const types = await db
    .select()
    .from(schema.membershipTypes)
    .where(inArray(schema.membershipTypes.id, [m.membershipTypeId, values.toTypeId]));
  const fromType = types.find((t) => t.id === m.membershipTypeId)!;
  const toType = types.find((t) => t.id === values.toTypeId && t.active);
  if (!toType) return { error: "That membership type is not available.", values };

  let request;
  try {
    [request] = await db
      .insert(schema.upgradeRequests)
      .values({
        memberId,
        fromTypeId: fromType.id,
        toTypeId: toType.id,
        effectiveDate: values.effectiveDate,
        reason: values.reason.slice(0, 1000),
        feeBeforeCents: m.currentFeeCents,
        feeAfterCents: toType.feeCents,
        requestedById: staff.id,
      })
      .returning();
  } catch {
    return { error: "This member already has a change waiting for approval.", values };
  }

  await db.insert(schema.memberEvents).values({
    memberId,
    eventType: "upgrade_requested",
    title: `Change to ${toType.name} requested`,
    detail: `Effective ${formatDateEn(values.effectiveDate)} · ${values.reason}`,
    actorType: "staff",
    staffUserId: staff.id,
    data: { upgradeRequestId: request.id },
  });
  await audit({
    actorType: "staff",
    action: "upgrade.requested",
    entityType: "upgrade_request",
    entityId: request.id,
    staffUserId: staff.id,
    ip: await clientIp(),
    details: { memberId, from: fromType.code, to: toType.code, effectiveDate: values.effectiveDate },
  });

  const approvers = (await staffWithRole("approver")).filter((a) => a.id !== staff.id);
  const mail = upgradeRequestedStaffEmail({
    memberName: `${m.firstNames} ${m.lastName}`,
    memberNumber: m.memberNumber,
    fromType: fromType.name,
    toType: toType.name,
    feeBefore: feeLabelEn(m.currentFeeCents, fromType.feePeriod),
    feeAfter: feeLabelEn(toType.feeCents, toType.feePeriod),
    effective: formatDateEn(values.effectiveDate),
    reason: values.reason,
    requestedBy: staff.displayName,
    link: `${appBaseUrl()}/staff/upgrades/${request.id}`,
  });
  for (const a of approvers) {
    await sendEmail({ to: a.email, templateKey: "upgrade_requested", memberId, staffUserId: staff.id, ...mail });
  }

  revalidatePath(`/staff/members/${memberId}`);
  revalidatePath("/staff/upgrades");
  return {
    message: approvers.length
      ? `Request sent for approval to ${approvers.map((a) => a.name).join(", ")}.`
      : "Request saved. No other staff member has the Approver role yet, so nobody else could be emailed; it must be approved by someone other than you.",
  };
}

/** UPG-04 … UPG-06: an Approver who did not raise the request approves or rejects it. */
export async function decideUpgrade(requestId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const staff = await requireStaffAction("approver");
  const decision = str(fd, "decision");
  const comment = str(fd, "comment");
  if (decision !== "approve" && decision !== "reject") return { error: "Choose approve or reject.", values: { comment } };
  if (decision === "reject" && !comment) return { error: "A comment is required to reject.", values: { comment, decision } };

  const db = getDb();
  const [u] = await db.select().from(schema.upgradeRequests).where(eq(schema.upgradeRequests.id, requestId)).limit(1);
  if (!u || u.status !== "pending") return { error: "This request has already been decided." };
  if (u.requestedById === staff.id) {
    return { error: "You raised this request, so another Approver must decide it.", values: { comment } };
  }

  const now = new Date();
  const updated = await db
    .update(schema.upgradeRequests)
    .set({
      status: decision === "approve" ? "approved" : "rejected",
      decidedById: staff.id,
      decidedAt: now,
      decisionComment: comment || null,
    })
    .where(and(eq(schema.upgradeRequests.id, requestId), eq(schema.upgradeRequests.status, "pending")))
    .returning();
  if (!updated.length) return { error: "This request has already been decided." };

  const [m] = await db.select().from(schema.members).where(eq(schema.members.id, u.memberId)).limit(1);
  const types = await db
    .select()
    .from(schema.membershipTypes)
    .where(inArray(schema.membershipTypes.id, [u.fromTypeId, u.toTypeId]));
  const fromType = types.find((t) => t.id === u.fromTypeId)!;
  const toType = types.find((t) => t.id === u.toTypeId)!;
  const [requester] = await db.select().from(schema.staffUsers).where(eq(schema.staffUsers.id, u.requestedById)).limit(1);

  await db.insert(schema.memberEvents).values({
    memberId: u.memberId,
    eventType: decision === "approve" ? "upgrade_approved" : "upgrade_rejected",
    title: decision === "approve" ? `Change to ${toType.name} approved` : `Change to ${toType.name} rejected`,
    detail: comment || (decision === "approve" ? `Effective ${formatDateEn(u.effectiveDate)}` : null),
    actorType: "staff",
    staffUserId: staff.id,
    data: { upgradeRequestId: u.id },
  });
  await audit({
    actorType: "staff",
    action: decision === "approve" ? "upgrade.approved" : "upgrade.rejected",
    entityType: "upgrade_request",
    entityId: u.id,
    staffUserId: staff.id,
    ip: await clientIp(),
    details: comment ? { comment } : undefined,
  });

  const memberLink = `${appBaseUrl()}/staff/members/${u.memberId}`;
  if (requester) {
    const mail = upgradeDecisionStaffEmail({
      memberName: `${m.firstNames} ${m.lastName}`,
      memberNumber: m.memberNumber,
      toType: toType.name,
      approved: decision === "approve",
      decidedBy: staff.displayName,
      comment: comment || null,
      effective: formatDateEn(u.effectiveDate),
      link: memberLink,
    });
    await sendEmail({ to: requester.email, templateKey: `upgrade_${decision}d_staff`, memberId: m.id, staffUserId: staff.id, ...mail });
  }

  if (decision === "approve") {
    const mail = membershipChangedEmail({
      name: `${m.firstNames} ${m.lastName}`,
      memberNumber: m.memberNumber,
      fromType: fromType.name,
      toType: toType.name,
      effective: formatDateFr(u.effectiveDate),
      feeBefore: feeLabelFr(u.feeBeforeCents, fromType.feePeriod),
      feeAfter: feeLabelFr(u.feeAfterCents, toType.feePeriod),
      feeChanged: u.feeAfterCents !== u.feeBeforeCents || fromType.feePeriod !== toType.feePeriod,
      link: `${appBaseUrl()}/espace`,
    });
    const sent = await sendEmail({ to: m.email, templateKey: "membership_changed", memberId: m.id, staffUserId: staff.id, ...mail });
    if (sent) {
      await db.update(schema.upgradeRequests).set({ memberNotifiedAt: new Date() }).where(eq(schema.upgradeRequests.id, u.id));
    }
    await db.insert(schema.memberEvents).values({
      memberId: m.id,
      eventType: "email",
      title: "Member emailed the confirmation of the new membership type",
      detail: sent ? m.email : `Sending to ${m.email} failed – see communications`,
      actorType: "system",
    });
    await applyDueUpgrades();
  }

  revalidatePath(`/staff/upgrades/${requestId}`);
  revalidatePath("/staff/upgrades");
  revalidatePath(`/staff/members/${u.memberId}`);
  return {
    message:
      decision === "approve"
        ? u.effectiveDate <= todayMu()
          ? `Approved and applied. ${m.firstNames} ${m.lastName} is now ${toType.name}; the member has been emailed.`
          : `Approved. The change applies on ${formatDateEn(u.effectiveDate)}; the member has been emailed.`
        : "Rejected. The requester has been emailed your comment.",
  };
}
