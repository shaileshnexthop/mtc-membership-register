import "server-only";
import { and, desc, eq, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db";

/** ADM-05: reading the audit log. */

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const isoDate = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");

export type AuditFilters = { from: string; to: string; staff: string; area: string; q: string; page: number };

export const AUDIT_AREAS: { key: string; label: string }[] = [
  { key: "application", label: "Applications" },
  { key: "document", label: "Documents" },
  { key: "sponsor", label: "Sponsors" },
  { key: "member", label: "Members" },
  { key: "upgrade", label: "Changes of type" },
  { key: "payment", label: "Payments" },
  { key: "report", label: "Exports" },
  { key: "settings", label: "Settings" },
  { key: "import", label: "Register import" },
  { key: "account", label: "Applicant accounts" },
  { key: "staff", label: "Staff sign-in" },
];

export function parseAuditFilters(p: Params): AuditFilters {
  const page = Math.max(1, Math.min(1000, Number(one(p.page)) || 1));
  return {
    from: isoDate(one(p.from)),
    to: isoDate(one(p.to)),
    staff: /^[0-9a-f-]{36}$/i.test(one(p.staff)) ? one(p.staff) : one(p.staff) === "system" ? "system" : "",
    area: AUDIT_AREAS.some((a) => a.key === one(p.area)) ? one(p.area) : "",
    q: one(p.q).trim().slice(0, 100),
    page,
  };
}

export function auditQuery(f: AuditFilters, page = f.page): string {
  const u = new URLSearchParams();
  if (f.from) u.set("from", f.from);
  if (f.to) u.set("to", f.to);
  if (f.staff) u.set("staff", f.staff);
  if (f.area) u.set("area", f.area);
  if (f.q) u.set("q", f.q);
  if (page > 1) u.set("page", String(page));
  return u.toString();
}

export const PAGE_SIZE = 100;

export async function readAudit(f: AuditFilters, limit = PAGE_SIZE) {
  const a = schema.auditLog;
  const where: SQL[] = [];
  if (f.from) where.push(gte(a.at, new Date(`${f.from}T00:00:00+04:00`)));
  if (f.to) where.push(lte(a.at, new Date(`${f.to}T23:59:59+04:00`)));
  if (f.staff === "system") where.push(eq(a.actorType, "system"));
  else if (f.staff) where.push(eq(a.staffUserId, f.staff));
  if (f.area) where.push(ilike(a.action, `${f.area}.%`));
  if (f.q) {
    const like = `%${f.q}%`;
    where.push(or(ilike(a.action, like), ilike(a.entityId, like), sql`${a.details}::text ilike ${like}`, ilike(schema.accounts.email, like))!);
  }
  return getDb()
    .select({
      id: a.id,
      at: a.at,
      actorType: a.actorType,
      action: a.action,
      entityType: a.entityType,
      entityId: a.entityId,
      ip: sql<string | null>`host(${a.ip})`,
      details: a.details,
      staffName: schema.staffUsers.displayName,
      accountEmail: schema.accounts.email,
    })
    .from(a)
    .leftJoin(schema.staffUsers, eq(schema.staffUsers.id, a.staffUserId))
    .leftJoin(schema.accounts, eq(schema.accounts.id, a.accountId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(a.at), desc(a.id))
    .limit(limit + 1)
    .offset((f.page - 1) * PAGE_SIZE);
}

const LABELS: Record<string, string> = {
  "account.registered": "Applicant registered",
  "account.email_verified": "Email confirmed",
  "account.login": "Applicant signed in",
  "account.password_reset": "Password reset",
  "staff.login": "Staff signed in",
  "staff.login_denied_no_role": "Staff sign-in refused (no role)",
  "document.uploaded": "Document uploaded",
  "document.viewed": "Document opened",
  "document.verified": "Document verified",
  "document.rejected": "Document rejected",
  "document.pending": "Document check undone",
  "application.submitted": "Application submitted",
  "application.approved": "Application approved",
  "application.deferred": "Application deferred",
  "application.rejected": "Application rejected",
  "application.deferred_unpaid": "Deferred automatically (unpaid)",
  "application.reopened": "Rejected application reopened",
  "application.compliance_cleared": "Compliance Review cleared",
  "application.compliance_not_cleared": "Compliance Review not cleared",
  "sponsor.request_resent": "Sponsor request resent",
  "member.details_updated": "Member details corrected",
  "member.lapse": "Member marked lapsed",
  "member.resign": "Member marked resigned",
  "member.reinstate": "Member reinstated",
  "member.lapsed_unpaid": "Member lapsed (unpaid)",
  "upgrade.requested": "Change of type requested",
  "upgrade.approved": "Change of type approved",
  "upgrade.rejected": "Change of type rejected",
  "upgrade.applied": "Change of type applied",
  "payment.recorded": "Joining payment recorded",
  "payment.dues_recorded": "Dues payment recorded",
  "payment.card_started": "Card payment started",
  "payment.card_confirmed": "Card payment confirmed",
  "payment.dues_card_confirmed": "Dues paid by card",
  "payment.card_mismatch": "Card payment did not match",
  "payment.card_unapplied": "Card payment received but not applied",
  "payment.refunded": "Payment marked refunded",
  "payment.webhook_rejected": "Payment notification refused",
  "report.exported": "Report exported",
  "settings.updated": "Settings changed",
  "settings.type_created": "Membership type added",
  "settings.type_updated": "Membership type changed",
  "settings.holiday_added": "Holiday added",
  "settings.holiday_removed": "Holiday removed",
  "import.members": "Register imported",
};

export function actionLabel(action: string): string {
  return LABELS[action] ?? action.replace(/[._]/g, " ");
}

/** Link to the record an entry is about, where there is a page for it. */
export function entityHref(type: string, id: string | null): string | null {
  if (!id) return null;
  if (type === "application") return `/staff/applications/${id}`;
  if (type === "member") return `/staff/members/${id}`;
  if (type === "upgrade_request") return `/staff/upgrades/${id}`;
  return null;
}

export function detailsText(d: unknown): string {
  if (!d || typeof d !== "object") return "";
  return Object.entries(d as Record<string, unknown>)
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ")
    .slice(0, 400);
}
