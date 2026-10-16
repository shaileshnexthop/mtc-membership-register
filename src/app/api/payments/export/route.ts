import { getCurrentStaff } from "@/lib/session";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/request";
import { exportResponse, muDay, type Cell, type Column } from "@/lib/export";
import { MEMBER_STATUS_EN } from "@/lib/members";
import { APP_STATUS_LABEL } from "@/lib/reports";
import {
  METHOD_EN,
  PAYMENT_VIEWS,
  PURPOSE_EN,
  awaitingJoining,
  describePaymentFilters,
  duesMembers,
  incompleteCardPayments,
  lapsedMembers,
  parsePaymentFilters,
  receivedPayments,
} from "@/lib/payments-data";

/** REN-06 / RPT-03: the Payments views as Excel or CSV; exports are audited (RPT-08). */
export async function GET(request: Request) {
  const staff = await getCurrentStaff();
  if (!staff) return new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams);
  const format = url.searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const f = parsePaymentFilters(params);
  const title = PAYMENT_VIEWS.find((v) => v.key === f.view)!.label;
  const money = (c: number | null | undefined) => (c ? c / 100 : 0);

  let columns: Column[] = [];
  let rows: Cell[][] = [];
  if (f.view === "received") {
    columns = [
      { header: "Paid on", width: 13, kind: "date" },
      { header: "Member no. / application", width: 18 },
      { header: "Name", width: 26 },
      { header: "For", width: 18 },
      { header: "Period from", width: 13, kind: "date" },
      { header: "Period to", width: 13, kind: "date" },
      { header: "Amount (Rs)", width: 13, kind: "money" },
      { header: "Status", width: 11 },
      { header: "Method", width: 20 },
      { header: "Reference", width: 20 },
      { header: "Recorded by", width: 20 },
      { header: "Note", width: 40 },
    ];
    rows = (await receivedPayments(f)).map((p) => [
      muDay(p.paidAt),
      p.memberNumber ?? p.appReference,
      p.memberName ?? p.appName,
      PURPOSE_EN[p.purpose],
      muDay(p.periodStart),
      muDay(p.periodEnd),
      money(p.amountCents),
      p.status === "paid" ? "Paid" : "Refunded",
      METHOD_EN[p.method],
      p.reference,
      p.recordedBy ?? (p.method === "card" ? "Online" : null),
      p.failureReason,
    ]);
  } else if (f.view === "awaiting") {
    columns = [
      { header: "Reference", width: 15 },
      { header: "Surname", width: 18 },
      { header: "First names", width: 20 },
      { header: "Email", width: 30 },
      { header: "Mobile", width: 16 },
      { header: "Type", width: 18 },
      { header: "Amount (Rs)", width: 13, kind: "money" },
      { header: "Approved", width: 13, kind: "date" },
      { header: "Due by", width: 13, kind: "date" },
      { header: "Reminders sent", width: 10, kind: "int" },
      { header: "Card attempts", width: 10, kind: "int" },
    ];
    rows = (await awaitingJoining(f)).map((a) => [
      a.reference, a.lastName, a.firstNames, a.email, a.mobile, a.typeName, money(a.feeCents),
      muDay(a.decidedAt), muDay(a.paymentDueAt), a.remindersSent, a.cardAttempts,
    ]);
  } else if (f.view === "dues") {
    columns = [
      { header: "Member no.", width: 13 },
      { header: "Surname", width: 18 },
      { header: "First names", width: 20 },
      { header: "Email", width: 30 },
      { header: "Mobile", width: 16 },
      { header: "Type", width: 18 },
      { header: "Status", width: 13 },
      { header: "Fee (Rs)", width: 12, kind: "money" },
      { header: "Next due", width: 13, kind: "date" },
      { header: "Overdue", width: 9 },
      { header: "Periods overdue", width: 10, kind: "int" },
      { header: "Est. arrears (Rs)", width: 14, kind: "money" },
      { header: "Last paid", width: 13, kind: "date" },
    ];
    rows = (await duesMembers(f)).map((d) => [
      d.memberNumber, d.lastName, d.firstNames, d.email, d.mobile, d.typeName, MEMBER_STATUS_EN[d.status][0],
      money(d.feeCents), muDay(d.nextDueOn), d.overdue ? "Yes" : "No", d.periods, money(d.arrearsCents), muDay(d.lastPaidAt),
    ]);
  } else if (f.view === "lapsed") {
    columns = [
      { header: "Member no.", width: 13 },
      { header: "Surname", width: 18 },
      { header: "First names", width: 20 },
      { header: "Email", width: 30 },
      { header: "Mobile", width: 16 },
      { header: "Type", width: 18 },
      { header: "Member since", width: 13, kind: "date" },
      { header: "Was due", width: 13, kind: "date" },
      { header: "Lapsed", width: 13, kind: "date" },
      { header: "Last paid", width: 13, kind: "date" },
    ];
    rows = (await lapsedMembers(f)).map((l) => [
      l.memberNumber, l.lastName, l.firstNames, l.email, l.mobile, l.typeName,
      muDay(l.memberSince), muDay(l.nextDueOn), muDay(l.lapsedAt), muDay(l.lastPaidAt),
    ]);
  } else {
    columns = [
      { header: "Started", width: 13, kind: "date" },
      { header: "Application", width: 15 },
      { header: "Name", width: 26 },
      { header: "Amount (Rs)", width: 13, kind: "money" },
      { header: "Outcome", width: 14 },
      { header: "Detail", width: 40 },
      { header: "Payment reference", width: 18 },
      { header: "Application now", width: 24 },
    ];
    rows = (await incompleteCardPayments(f)).map((c) => [
      muDay(c.createdAt), c.appReference, `${c.lastName ?? ""}, ${c.firstNames ?? ""}`, money(c.amountCents),
      c.status === "pending" ? "Not completed" : c.status, c.failureReason, c.reference,
      c.appStatus ? APP_STATUS_LABEL[c.appStatus] : null,
    ]);
  }

  const description = describePaymentFilters(f);
  await audit({
    actorType: "staff",
    action: "report.exported",
    entityType: "report",
    staffUserId: staff.id,
    ip: await clientIp(),
    details: { format, title, filters: description, rows: rows.length },
  });
  return exportResponse({ title, description, sheetName: "Payments", columns, rows, format, staffName: staff.displayName });
}
