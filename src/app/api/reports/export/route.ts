import { getCurrentStaff } from "@/lib/session";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/request";
import {
  APP_STATUS_LABEL,
  MEMBER_STATUS_LABEL,
  describeFilters,
  membershipTypeOptions,
  parseFilters,
  reportTitle,
  runApplicationsReport,
  runMembersReport,
  tenureLabel,
} from "@/lib/reports";
import { exportResponse, muDay, type Cell, type Column } from "@/lib/export";

/** RPT-07/08: the on-screen report as Excel or CSV, same filters, export logged. */
export async function GET(request: Request) {
  const staff = await getCurrentStaff();
  if (!staff) return new Response("Not found", { status: 404 });

  const url = new URL(request.url);
  const params: Record<string, string | string[]> = {};
  for (const [k, v] of url.searchParams) {
    const prev = params[k];
    params[k] = prev === undefined ? v : [...(Array.isArray(prev) ? prev : [prev]), v];
  }
  const format = url.searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const f = parseFilters(params);
  const types = await membershipTypeOptions();
  const title = reportTitle(f);
  const description = describeFilters(f, types.find((t) => t.id === f.typeId)?.name);

  let columns: Column[];
  let rows: Cell[][];
  if (f.report === "applications") {
    const data = await runApplicationsReport(f);
    columns = [
      { header: "Reference", width: 15 },
      { header: "Surname", width: 18 },
      { header: "First names", width: 22 },
      { header: "Email", width: 30 },
      { header: "Mobile", width: 16 },
      { header: "Membership type", width: 18 },
      { header: "Status", width: 26 },
      { header: "Received", width: 13, kind: "date" },
      { header: "Submissions", width: 12, kind: "int" },
      { header: "Decided", width: 13, kind: "date" },
      { header: "Decided by", width: 20 },
      { header: "Reason / comment", width: 50 },
      { header: "Compliance", width: 13 },
      { header: "KYC verified (of 4)", width: 12, kind: "int" },
      { header: "Sponsors confirmed", width: 12, kind: "int" },
      { header: "Sponsors named", width: 12, kind: "int" },
      { header: "Payment due", width: 13, kind: "date" },
      { header: "Admitted", width: 13, kind: "date" },
    ];
    rows = data.map((r) => [
      r.reference,
      r.lastName,
      r.firstNames,
      r.email,
      r.mobile,
      r.typeName,
      APP_STATUS_LABEL[r.status] ?? r.status,
      muDay(r.receivedAt),
      r.submissions,
      muDay(r.decidedAt),
      r.decidedBy,
      r.decisionComment,
      r.compliance === "cleared" ? "Cleared" : r.compliance === "not_cleared" ? "Not cleared" : "Pending",
      Number(r.kycVerified ?? 0),
      Number(r.sponsorsConfirmed ?? 0),
      Number(r.sponsorsTotal ?? 0),
      muDay(r.paymentDueAt),
      muDay(r.admittedAt),
    ]);
  } else {
    const data = await runMembersReport(f);
    columns = [
      { header: "Member no.", width: 13 },
      { header: "Surname", width: 18 },
      { header: "First names", width: 22 },
      { header: "Email", width: 30 },
      { header: "Mobile", width: 16 },
      { header: "Membership type", width: 18 },
      { header: "Status", width: 13 },
      { header: "Member since", width: 13, kind: "date" },
      { header: "Continuous since", width: 13, kind: "date" },
      { header: "Continuous months", width: 12, kind: "int" },
      { header: "Continuous membership", width: 18 },
      { header: "Total months", width: 12, kind: "int" },
      { header: "Fee (Rs)", width: 12, kind: "money" },
      { header: "Fee period", width: 11 },
      { header: "Next due", width: 13, kind: "date" },
      { header: "Source", width: 16 },
    ];
    rows = data.map((r) => [
      r.memberNumber,
      r.lastName,
      r.firstNames,
      r.email,
      r.mobile,
      r.typeName,
      MEMBER_STATUS_LABEL[r.status] ?? r.status,
      muDay(r.memberSince),
      muDay(r.continuousSince),
      Number(r.continuousMonths),
      tenureLabel(Number(r.continuousMonths)),
      Number(r.totalMonths),
      r.feeCents / 100,
      r.feePeriod === "annual" ? "Annual" : "Monthly",
      muDay(r.nextDueOn),
      r.imported ? "Existing register" : "Online application",
    ]);
  }

  await audit({
    actorType: "staff",
    action: "report.exported",
    entityType: "report",
    staffUserId: staff.id,
    ip: await clientIp(),
    details: { format, title, filters: description, rows: rows.length },
  });

  return exportResponse({
    title,
    description,
    sheetName: f.report === "applications" ? "Applications" : "Members",
    columns,
    rows,
    format,
    staffName: staff.displayName,
  });
}
