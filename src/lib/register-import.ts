import "server-only";
import ExcelJS from "exceljs";
import { inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { audit } from "./audit";

/**
 * Importing the Club's existing member register (paper / spreadsheet) into the portal.
 * The file is checked in full first; nothing is written unless every row is valid.
 */

export const IMPORT_COLUMNS: { key: string; header: string; required: boolean; help: string; aliases: string[] }[] = [
  { key: "memberNumber", header: "member_number", required: true, help: "The member's existing number, e.g. MTC-001234", aliases: ["numero", "numero_membre", "member_no", "no"] },
  { key: "lastName", header: "last_name", required: true, help: "Nom", aliases: ["nom", "surname"] },
  { key: "firstNames", header: "first_names", required: true, help: "Prénoms", aliases: ["prenoms", "prenom", "first_name"] },
  { key: "email", header: "email", required: false, help: "Needed for reminders and receipts; can be added later", aliases: ["courriel", "e-mail", "adresse_courriel"] },
  { key: "mobilePhone", header: "mobile", required: false, help: "Mobile phone", aliases: ["telephone", "portable", "mobile_phone", "phone"] },
  { key: "membershipType", header: "membership_type", required: true, help: "Type code or name as in Settings, e.g. ASSOCIE", aliases: ["type", "categorie", "category"] },
  { key: "status", header: "status", required: false, help: "active, renewal_due, lapsed or resigned (default active)", aliases: ["statut"] },
  { key: "memberSince", header: "member_since", required: true, help: "Date first admitted (YYYY-MM-DD or DD/MM/YYYY)", aliases: ["membre_depuis", "admission", "date_admission", "since"] },
  { key: "continuousSince", header: "continuous_since", required: false, help: "Date of last re-admission, if any (default: member_since)", aliases: ["depuis_sans_interruption"] },
  { key: "nextDueOn", header: "next_due_on", required: false, help: "Next dues date (default: the 1st of next month for active members)", aliases: ["prochaine_echeance", "due_date", "echeance"] },
  { key: "dateOfBirth", header: "date_of_birth", required: false, help: "Date of birth", aliases: ["date_naissance", "dob"] },
  { key: "nationality", header: "nationality", required: false, help: "Nationalité", aliases: ["nationalite"] },
  { key: "idNumber", header: "id_number", required: false, help: "National ID or passport number", aliases: ["cni", "passeport", "nic"] },
  { key: "residentialAddress", header: "address", required: false, help: "Residential address", aliases: ["adresse", "residential_address"] },
  { key: "profession", header: "profession", required: false, help: "Profession", aliases: [] },
  { key: "employerName", header: "employer", required: false, help: "Employer", aliases: ["employeur", "employer_name"] },
];

export type ImportRow = {
  line: number;
  memberNumber: string;
  lastName: string;
  firstNames: string;
  email: string;
  mobilePhone: string | null;
  membershipTypeId: string;
  typeName: string;
  feeCents: number;
  status: "active" | "renewal_due" | "lapsed" | "resigned";
  memberSince: string;
  continuousSince: string;
  nextDueOn: string | null;
  dateOfBirth: string | null;
  nationality: string | null;
  idNumber: string | null;
  residentialAddress: string | null;
  profession: string | null;
  employerName: string | null;
};

export type ImportCheck = {
  rows: ImportRow[];
  errors: { line: number; message: string }[];
  warnings: { line: number; message: string }[];
  totalLines: number;
};

const norm = (h: string) =>
  h
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s.-]+/g, "_");

/** Minimal CSV reader: quoted fields, "" escapes, comma or semicolon separators. */
function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, "");
  const firstLine = t.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (quoted) {
      if (c === '"' && t[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      row.push(cell);
      out.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    out.push(row);
  }
  return out.filter((r) => r.some((c) => c.trim() !== ""));
}

async function parseXlsx(buf: Buffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const out: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    for (let c = 1; c <= ws.columnCount; c++) {
      const v = row.getCell(c).value as unknown;
      if (v instanceof Date) cells.push(v.toISOString().slice(0, 10));
      else if (v && typeof v === "object" && "text" in (v as Record<string, unknown>)) cells.push(String((v as { text: unknown }).text));
      else if (v && typeof v === "object" && "result" in (v as Record<string, unknown>)) cells.push(String((v as { result: unknown }).result ?? ""));
      else cells.push(v === null || v === undefined ? "" : String(v));
    }
    out.push(cells);
  });
  return out.filter((r) => r.some((c) => c.trim() !== ""));
}

/** YYYY-MM-DD, DD/MM/YYYY or DD-MM-YYYY → YYYY-MM-DD; null if not a real date. */
function toIsoDate(raw: string): string | null {
  const v = raw.trim();
  let y: number, m: number, d: number;
  let mt = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (mt) [y, m, d] = [Number(mt[1]), Number(mt[2]), Number(mt[3])];
  else if ((mt = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) [d, m, y] = [Number(mt[1]), Number(mt[2]), Number(mt[3])];
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

function firstOfNextMonth(today: string): string {
  const d = new Date(`${today}T12:00:00Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
}

export async function checkImportFile(buf: Buffer, filename: string, today: string): Promise<ImportCheck> {
  const isXlsx = /\.xlsx$/i.test(filename) || buf.subarray(0, 2).toString("latin1") === "PK";
  const table = isXlsx ? await parseXlsx(buf) : parseCsv(buf.toString("utf8"));
  const errors: ImportCheck["errors"] = [];
  const warnings: ImportCheck["warnings"] = [];
  if (table.length < 2) return { rows: [], errors: [{ line: 1, message: "The file has no member rows under the header row." }], warnings, totalLines: 0 };

  const header = table[0].map(norm);
  const colIndex: Record<string, number> = {};
  for (const col of IMPORT_COLUMNS) {
    const names = [col.header, ...col.aliases].map(norm);
    const i = header.findIndex((h) => names.includes(h));
    if (i >= 0) colIndex[col.key] = i;
    else if (col.required) errors.push({ line: 1, message: `Missing column "${col.header}".` });
  }
  if (errors.length) return { rows: [], errors, warnings, totalLines: table.length - 1 };

  const db = getDb();
  const types = await db.select().from(schema.membershipTypes);
  const typeBy = new Map<string, (typeof types)[number]>();
  for (const t of types) {
    typeBy.set(norm(t.code), t);
    typeBy.set(norm(t.name), t);
  }
  const numbers = table.slice(1).map((r) => (r[colIndex.memberNumber] ?? "").trim()).filter(Boolean);
  const existing = numbers.length
    ? await db.select({ n: schema.members.memberNumber }).from(schema.members).where(inArray(schema.members.memberNumber, numbers))
    : [];
  const taken = new Set(existing.map((e) => e.n));
  const seen = new Set<string>();

  const rows: ImportRow[] = [];
  table.slice(1).forEach((r, idx) => {
    const line = idx + 2;
    const get = (k: string) => (colIndex[k] === undefined ? "" : String(r[colIndex[k]] ?? "").trim());
    const problems: string[] = [];
    const memberNumber = get("memberNumber");
    if (!memberNumber) problems.push("member_number is empty");
    else if (taken.has(memberNumber)) problems.push(`${memberNumber} is already in the portal`);
    else if (seen.has(memberNumber)) problems.push(`${memberNumber} appears twice in the file`);
    seen.add(memberNumber);
    const lastName = get("lastName");
    const firstNames = get("firstNames");
    if (!lastName) problems.push("last_name is empty");
    if (!firstNames) problems.push("first_names is empty");
    const email = get("email").toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.push(`email "${email}" is not valid`);
    if (!email) warnings.push({ line, message: `${memberNumber || "row"}: no email, so no reminders or receipts until one is added` });
    const type = typeBy.get(norm(get("membershipType")));
    if (!type) problems.push(`membership_type "${get("membershipType")}" is not a type in Settings`);
    const rawStatus = norm(get("status") || "active");
    const statusMap: Record<string, ImportRow["status"]> = {
      active: "active", actif: "active", renewal_due: "renewal_due", due: "renewal_due",
      lapsed: "lapsed", expire: "lapsed", resigned: "resigned", demissionnaire: "resigned",
    };
    const status = statusMap[rawStatus];
    if (!status) problems.push(`status "${get("status")}" should be active, renewal_due, lapsed or resigned`);
    const memberSince = toIsoDate(get("memberSince"));
    if (!memberSince) problems.push(`member_since "${get("memberSince")}" is not a date`);
    else if (memberSince > today) problems.push("member_since is in the future");
    const contRaw = get("continuousSince");
    const continuousSince = contRaw ? toIsoDate(contRaw) : memberSince;
    if (contRaw && !continuousSince) problems.push(`continuous_since "${contRaw}" is not a date`);
    if (continuousSince && memberSince && continuousSince < memberSince) problems.push("continuous_since is before member_since");
    const dueRaw = get("nextDueOn");
    let nextDueOn = dueRaw ? toIsoDate(dueRaw) : null;
    if (dueRaw && !nextDueOn) problems.push(`next_due_on "${dueRaw}" is not a date`);
    if (!dueRaw && (status === "active" || status === "renewal_due")) nextDueOn = firstOfNextMonth(today);
    const dobRaw = get("dateOfBirth");
    const dateOfBirth = dobRaw ? toIsoDate(dobRaw) : null;
    if (dobRaw && !dateOfBirth) problems.push(`date_of_birth "${dobRaw}" is not a date`);

    if (problems.length) {
      errors.push({ line, message: problems.join("; ") });
      return;
    }
    rows.push({
      line,
      memberNumber,
      lastName: lastName.toUpperCase(),
      firstNames,
      email,
      mobilePhone: get("mobilePhone") || null,
      membershipTypeId: type!.id,
      typeName: type!.name,
      feeCents: type!.feeCents,
      status: status!,
      memberSince: memberSince!,
      continuousSince: continuousSince!,
      nextDueOn,
      dateOfBirth,
      nationality: get("nationality") || null,
      idNumber: get("idNumber") || null,
      residentialAddress: get("residentialAddress") || null,
      profession: get("profession") || null,
      employerName: get("employerName") || null,
    });
  });
  return { rows, errors, warnings, totalLines: table.length - 1 };
}

/** Writes checked rows as members, each with a type period and an "imported" journey entry. */
export async function importRows(rows: ImportRow[], staffId: string, filename: string, ip: string | null): Promise<number> {
  const db = getDb();
  await db.transaction(async (tx) => {
    for (const r of rows) {
      const [m] = await tx
        .insert(schema.members)
        .values({
          memberNumber: r.memberNumber,
          membershipTypeId: r.membershipTypeId,
          status: r.status,
          lastName: r.lastName,
          firstNames: r.firstNames,
          email: r.email,
          mobilePhone: r.mobilePhone,
          residentialAddress: r.residentialAddress,
          dateOfBirth: r.dateOfBirth,
          nationality: r.nationality,
          idNumber: r.idNumber,
          profession: r.profession,
          employerName: r.employerName,
          memberSince: r.memberSince,
          continuousSince: r.continuousSince,
          currentFeeCents: r.feeCents,
          nextDueOn: r.nextDueOn,
          expiresOn: r.nextDueOn,
          importedFromRegister: true,
        })
        .returning({ id: schema.members.id });
      await tx.insert(schema.memberTypePeriods).values({
        memberId: m.id,
        membershipTypeId: r.membershipTypeId,
        startDate: r.continuousSince,
        feeCents: r.feeCents,
      });
      await tx.insert(schema.memberEvents).values({
        memberId: m.id,
        at: new Date(`${r.memberSince}T10:00:00+04:00`),
        eventType: "admitted",
        title: "Admitted as member",
        detail: `Imported from the existing membership register (${filename})`,
        actorType: "staff",
        staffUserId: staffId,
      });
    }
  });
  await audit({
    actorType: "staff",
    action: "import.members",
    entityType: "member",
    staffUserId: staffId,
    ip,
    details: { file: filename, count: rows.length },
  });
  return rows.length;
}
