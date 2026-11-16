import { getCurrentStaff } from "@/lib/session";
import { hasRole } from "@/lib/staff";
import { IMPORT_COLUMNS } from "@/lib/register-import";

/** The CSV template for the register import, with one fictional example row. */
export async function GET() {
  const staff = await getCurrentStaff();
  if (!staff || !hasRole(staff, "administrator")) return new Response("Not found", { status: 404 });
  const example: Record<string, string> = {
    memberNumber: "MTC-000001",
    lastName: "EXEMPLE",
    firstNames: "Jean",
    email: "jean.exemple@example.com",
    mobilePhone: "+230 5000 0000",
    membershipType: "ASSOCIE",
    status: "active",
    memberSince: "2015-03-01",
    continuousSince: "",
    nextDueOn: "2026-12-01",
    dateOfBirth: "1970-05-20",
    nationality: "Mauricienne",
    idNumber: "",
    residentialAddress: "Port Louis",
    profession: "",
    employerName: "",
  };
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [IMPORT_COLUMNS.map((c) => c.header).join(","), IMPORT_COLUMNS.map((c) => esc(example[c.key] ?? "")).join(",")];
  return new Response("﻿" + lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="MTC-register-import-template.csv"',
      "Cache-Control": "private, no-store",
    },
  });
}
