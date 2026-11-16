import { getCurrentStaff } from "@/lib/session";
import { hasRole } from "@/lib/staff";
import { clientIp } from "@/lib/request";
import { todayMu } from "@/lib/members";
import { checkImportFile, importRows } from "@/lib/register-import";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Register import (Administrator). mode=check validates the file and returns a preview;
 * mode=import validates it again and writes it, only if every row is valid.
 */
export async function POST(request: Request) {
  const staff = await getCurrentStaff();
  if (!staff || !hasRole(staff, "administrator")) return Response.json({ error: "Not authorised" }, { status: 403 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const mode = form?.get("mode") === "import" ? "import" : "check";
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: "Choose a CSV or Excel file." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "The file is larger than 5 MB." }, { status: 400 });
  if (!/\.(csv|xlsx)$/i.test(file.name)) return Response.json({ error: "Use a .csv or .xlsx file." }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  let check;
  try {
    check = await checkImportFile(buf, file.name, todayMu());
  } catch (err) {
    console.error(err);
    return Response.json({ error: "The file could not be read. Save it as CSV (UTF-8) or Excel (.xlsx) and try again." }, { status: 400 });
  }
  if (mode === "import") {
    if (check.errors.length) return Response.json({ error: "Fix the errors before importing.", ...check }, { status: 400 });
    const n = await importRows(check.rows, staff.id, file.name, await clientIp());
    return Response.json({ imported: n });
  }
  return Response.json({
    ...check,
    rows: check.rows.map((r) => ({
      line: r.line,
      memberNumber: r.memberNumber,
      name: `${r.lastName}, ${r.firstNames}`,
      email: r.email,
      typeName: r.typeName,
      status: r.status,
      memberSince: r.memberSince,
      nextDueOn: r.nextDueOn,
    })),
  });
}
