import "server-only";
import { desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, schema } from "@/db";

/** Upgrade requests with member, types and staff names, for the Upgrades screens. */
export async function listUpgradeRequests(filter: { status?: "pending" | "approved" | "rejected"; id?: string }) {
  const db = getDb();
  const requester = alias(schema.staffUsers, "requester");
  const decider = alias(schema.staffUsers, "decider");
  const fromType = alias(schema.membershipTypes, "from_type");
  const toType = alias(schema.membershipTypes, "to_type");
  const u = schema.upgradeRequests;
  return db
    .select({
      id: u.id,
      status: u.status,
      effectiveDate: u.effectiveDate,
      reason: u.reason,
      feeBeforeCents: u.feeBeforeCents,
      feeAfterCents: u.feeAfterCents,
      requestedAt: u.requestedAt,
      requestedById: u.requestedById,
      decidedAt: u.decidedAt,
      decisionComment: u.decisionComment,
      appliedAt: u.appliedAt,
      memberNotifiedAt: u.memberNotifiedAt,
      memberId: schema.members.id,
      memberNumber: schema.members.memberNumber,
      lastName: schema.members.lastName,
      firstNames: schema.members.firstNames,
      memberStatus: schema.members.status,
      continuousSince: schema.members.continuousSince,
      fromName: fromType.name,
      fromPeriod: fromType.feePeriod,
      toName: toType.name,
      toPeriod: toType.feePeriod,
      requestedBy: requester.displayName,
      decidedBy: decider.displayName,
    })
    .from(u)
    .innerJoin(schema.members, eq(schema.members.id, u.memberId))
    .innerJoin(fromType, eq(fromType.id, u.fromTypeId))
    .innerJoin(toType, eq(toType.id, u.toTypeId))
    .innerJoin(requester, eq(requester.id, u.requestedById))
    .leftJoin(decider, eq(decider.id, u.decidedById))
    .where(filter.id ? eq(u.id, filter.id) : filter.status ? eq(u.status, filter.status) : undefined)
    .orderBy(filter.status === "pending" ? u.requestedAt : desc(u.requestedAt))
    .limit(300);
}
