import "server-only";
import ExcelJS from "exceljs";
import { formatDateTimeEn } from "./format";

export type Cell = string | number | Date | null;
export type Column = { header: string; width: number; kind?: "date" | "datetime" | "money" | "int" };

/** Calendar date in Mauritius for a timestamp, as a Date at UTC midnight so Excel shows the right day. */
export function muDay(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  if (typeof v === "string") return /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00Z`) : new Date(v);
  const local = new Date(v.getTime() + 4 * 3600 * 1000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

/**
 * RPT-03: the same table as a formatted Excel workbook (title block, navy header,
 * frozen header, filters, banded rows) or as UTF-8 CSV.
 */
export async function exportResponse(p: {
  title: string;
  description: string;
  sheetName: string;
  columns: Column[];
  rows: Cell[][];
  format: "xlsx" | "csv";
  staffName: string;
}): Promise<Response> {
  const { title, description, columns, rows, format } = p;
  const stamp = new Date(Date.now() + 4 * 3600 * 1000).toISOString().slice(0, 10);
  const filename = `MTC ${title} ${stamp}`.replace(/[^\w\- ]+/g, "").replace(/\s+/g, "-");
  const generated = `Generated ${formatDateTimeEn(new Date())} by ${p.staffName}`;

  if (format === "csv") {
    const esc = (v: Cell) => {
      if (v === null || v === undefined) return "";
      const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [columns.map((c) => esc(c.header)).join(","), ...rows.map((r) => r.map(esc).join(","))];
    return new Response("\uFEFF" + lines.join("\r\n") + "\r\n", {
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
  const ws = wb.addWorksheet(p.sheetName, {
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
