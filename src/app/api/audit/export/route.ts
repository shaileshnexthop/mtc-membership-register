import { getCurrentStaff } from "@/lib/session";
import { hasRole } from "@/lib/staff";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/request";
import { exportResponse } from "@/lib/export";
import { actionLabel, detailsText, parseAuditFilters, readAudit } from "@/lib/audit-view";

/** ADM-05: the filtered audit log as CSV (up to 20,000 entries). Administrator only. */
export async function GET(request: Request) {
  const staff = await getCurrentStaff();
  if (!staff || !hasRole(staff, "administrator")) return new Response("Not found", { status: 404 });
  const f = { ...parseAuditFilters(Object.fromEntries(new URL(request.url).searchParams)), page: 1 };
  const rows = (await readAudit(f, 20000)).slice(0, 20000);
  await audit({
    actorType: "staff",
    action: "report.exported",
    entityType: "report",
    staffUserId: staff.id,
    ip: await clientIp(),
    details: { format: "csv", title: "Audit log", rows: rows.length },
  });
  return exportResponse({
    title: "Audit log",
    description: [f.from && `from ${f.from}`, f.to && `to ${f.to}`, f.area, f.q && `matching “${f.q}”`].filter(Boolean).join(" · ") || "All entries",
    sheetName: "Audit log",
    columns: [
      { header: "When (UTC)", width: 20 },
      { header: "Who", width: 26 },
      { header: "Actor type", width: 10 },
      { header: "What", width: 30 },
      { header: "Action code", width: 26 },
      { header: "Record type", width: 16 },
      { header: "Record id", width: 38 },
      { header: "IP", width: 16 },
      { header: "Details", width: 60 },
    ],
    rows: rows.map((e) => [
      e.at.toISOString().replace("T", " ").slice(0, 19),
      e.staffName ?? e.accountEmail ?? (e.actorType === "system" ? "Portal (automatic)" : null),
      e.actorType,
      actionLabel(e.action),
      e.action,
      e.entityType,
      e.entityId,
      e.ip,
      detailsText(e.details),
    ]),
    format: "csv",
    staffName: staff.displayName,
  });
}
