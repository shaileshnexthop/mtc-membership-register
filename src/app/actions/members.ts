"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStaffAction } from "@/lib/staff";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/request";
import { todayMu } from "@/lib/members";
import { EDITABLE_FIELDS, type EditableField } from "@/lib/member-labels";
import type { FormState } from "./auth";

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

type Field = EditableField;

/** MEM-10: staff correct a member's contact details; every change keeps old and new values. */
export async function updateMemberDetails(memberId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const staff = await requireStaffAction("reviewer", "administrator");
  const values = Object.fromEntries(Object.keys(EDITABLE_FIELDS).map((k) => [k, str(fd, k)])) as Record<Field, string>;
  const fieldErrors: Record<string, string> = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) fieldErrors.email = "Enter a valid email address.";
  if (values.mobilePhone && !/^[+\d][\d\s-]{6,19}$/.test(values.mobilePhone)) fieldErrors.mobilePhone = "Enter a valid phone number.";
  if (values.homePhone && !/^[+\d][\d\s-]{6,19}$/.test(values.homePhone)) fieldErrors.homePhone = "Enter a valid phone number.";
  if (Object.keys(fieldErrors).length) return { error: "Check the highlighted fields.", fieldErrors, values };
  values.email = values.email.toLowerCase();

  const db = getDb();
  const [m] = await db.select().from(schema.members).where(eq(schema.members.id, memberId)).limit(1);
  if (!m) return { error: "Member not found." };

  const changed = (Object.keys(EDITABLE_FIELDS) as Field[]).filter((k) => (m[k] ?? "") !== values[k]);
  if (!changed.length) return { message: "No changes to save.", values };

  await db.transaction(async (tx) => {
    await tx
      .update(schema.members)
      .set({ ...Object.fromEntries(changed.map((k) => [k, values[k] || null])), updatedAt: new Date() })
      .where(eq(schema.members.id, memberId));
    await tx.insert(schema.memberDetailChanges).values(
      changed.map((k) => ({
        memberId,
        field: k,
        oldValue: m[k] ?? null,
        newValue: values[k] || null,
        changedByType: "staff" as const,
        changedByStaffId: staff.id,
      })),
    );
    await tx.insert(schema.memberEvents).values({
      memberId,
      eventType: "details_updated",
      title: "Contact details updated",
      detail: changed.map((k) => EDITABLE_FIELDS[k]).join(", "),
      actorType: "staff",
      staffUserId: staff.id,
    });
  });
  await audit({
    actorType: "staff",
    action: "member.details_updated",
    entityType: "member",
    entityId: memberId,
    staffUserId: staff.id,
    ip: await clientIp(),
    details: { fields: changed },
  });
  revalidatePath(`/staff/members/${memberId}`);
  return { message: `Saved: ${changed.map((k) => EDITABLE_FIELDS[k]).join(", ")}.`, values };
}

const STATUS_ACTIONS = {
  lapse: { from: ["active", "renewal_due"], to: "lapsed", title: "Membership lapsed" },
  resign: { from: ["active", "renewal_due", "lapsed"], to: "resigned", title: "Member resigned" },
  reinstate: { from: ["lapsed", "resigned"], to: "active", title: "Membership reinstated" },
} as const;

/**
 * Administrator changes a member's status with a recorded reason (MEM-01, MEM-03).
 * Reinstatement restarts continuous membership from today; the member number is kept.
 */
export async function changeMemberStatus(memberId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const staff = await requireStaffAction("administrator");
  const action = str(fd, "action") as keyof typeof STATUS_ACTIONS;
  const reason = str(fd, "reason");
  const spec = STATUS_ACTIONS[action];
  if (!spec) return { error: "Choose what to do.", values: { reason } };
  if (!reason) return { error: "Give the reason. It is kept in the member's history.", values: { reason, action } };

  const db = getDb();
  const today = todayMu();
  const updated = await db
    .update(schema.members)
    .set({
      status: spec.to,
      updatedAt: new Date(),
      ...(action === "reinstate" ? { continuousSince: today, nextDueOn: today } : {}),
    })
    .where(and(eq(schema.members.id, memberId), inArray(schema.members.status, [...spec.from])))
    .returning({ id: schema.members.id });
  if (!updated.length) return { error: "The member's status has changed meanwhile. Reload the page." };

  await db.insert(schema.memberEvents).values({
    memberId,
    eventType: spec.to === "active" ? "reinstated" : spec.to,
    title: spec.title,
    detail: reason,
    actorType: "staff",
    staffUserId: staff.id,
  });
  await audit({
    actorType: "staff",
    action: `member.${action}`,
    entityType: "member",
    entityId: memberId,
    staffUserId: staff.id,
    ip: await clientIp(),
    details: { reason },
  });
  revalidatePath(`/staff/members/${memberId}`);
  revalidatePath("/staff/members");
  return {
    message:
      action === "reinstate"
        ? "Reinstated. Continuous membership restarts today and the next payment is due today."
        : `Status changed to ${spec.to}.`,
  };
}
