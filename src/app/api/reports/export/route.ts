import ExcelJS from "exceljs";
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
import { formatDateTimeEn } from "@/lib/format";

type Cell = string | number | Date | null;
type Column = { header: string; width: number; kind?: "date" | "datetime" | "money" | "int" };

/** Calendar date in Mauritius for a timestamp, as a Date at UTC midnight so Excel shows the right day. */
function muDay(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  if (typeof v === "string") return /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00Z`) : new Date(v);
  const local = new Date(v.getTime() + 4 * 3600 * 1000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

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

  const stamp = new Date(Date.now() + 4 * 3600 * 1000).toISOString().slice(0, 10);
  const filename = `MTC ${title} ${stamp}`.replace(/[^\w\- ]+/g, "").replace(/\s+/g, "-");
  const generated = `Generated ${formatDateTimeEn(new Date())} by ${staff.displayName}`;

  if (format === "csv") {
    const esc = (v: Cell) => {
      if (v === null || v === undefined) return "";
      const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [columns.map((c) => esc(c.header)).join(","), ...rows.map((r) => r.map(esc).join(","))];
    return new Response("﻿" + lines.join("\r\n") + "\r\n", {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "MTC Membership Register";
  wb.created = new Date();
  const ws = wb.addWorksheet(f.report === "applications" ? "Applications" : "Members", {
    pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ state: "frozen", ySplit: 5 }],
  });
  const navy = "FF1B2A5C";
  const last = columns.length;

  ws.mergeCells(1, 1, 1, last);
  ws.getCell(1, 1).value = `The Mauritius Turf Club — ${title}`;
  ws.getCell(1, 1).font = { bold: true, size: 15, color: { argb: navy } };
  ws.getRow(1).height = 24;
  ws.mergeCells(2, 1, 2, last);
  ws.getCell(2, 1).value = `${description} · ${rows.length} ${rows.length === 1 ? "record" : "records"}`;
  ws.getCell(2, 1).font = { size: 11, color: { argb: "FF444444" } };
  ws.mergeCells(3, 1, 3, last);
  ws.getCell(3, 1).value = `${generated} · Confidential – for internal use only`;
  ws.getCell(3, 1).font = { italic: true, size: 9, color: { argb: "FF777777" } };

  const header = ws.getRow(5);
  columns.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navy } };
    cell.alignment = { vertical: "middle", wrapText: true };
    ws.getColumn(i + 1).width = c.width;
  });
  header.height = 30;

  rows.forEach((r, ri) => {
    const row = ws.getRow(6 + ri);
    r.forEach((v, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = v ?? null;
      const kind = columns[ci].kind;
      if (kind === "date") cell.numFmt = "d mmm yyyy";
      if (kind === "money") cell.numFmt = "#,##0.00";
      cell.alignment = { vertical: "top", wrapText: columns[ci].width >= 40 };
    });
    if (ri % 2 === 1) {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F2EC" } };
      });
    }
  });
  if (rows.length) {
    ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5 + rows.length, column: last } };
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
