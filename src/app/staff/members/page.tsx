import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { StaffShell } from "@/components/StaffShell";
import { requireStaffPage } from "@/lib/staff";
import { formatDateEn } from "@/lib/format";
import { tenureLabel } from "@/lib/reports";
import { MEMBER_STATUS_EN, activeMembershipTypes, applyDueUpgrades, feeLabelEn, monthsBetween, todayMu } from "@/lib/members";
import s from "@/components/staff.module.css";
import r from "@/components/reports.module.css";

export const metadata: Metadata = { title: "Members" };

const TABS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "renewal_due", label: "Renewal due" },
  { key: "lapsed", label: "Lapsed" },
  { key: "resigned", label: "Resigned" },
] as const;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** MEM-01/02: the register of members, searchable and filterable. */
export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaffPage();
  await applyDueUpgrades();
  const params = await searchParams;
  const status = (TABS.find((t) => t.key === one(params.status))?.key ?? "active") as (typeof TABS)[number]["key"];
  const q = one(params.q).trim().slice(0, 100);
  const typeId = /^[0-9a-f-]{36}$/i.test(one(params.type)) ? one(params.type) : "";
  const db = getDb();
  const m = schema.members;

  const counts = await db.select({ status: m.status, n: sql<number>`count(*)::int` }).from(m).groupBy(m.status);
  const countOf = (k: string) =>
    k === "all" ? counts.reduce((t, c) => t + c.n, 0) : (counts.find((c) => c.status === k)?.n ?? 0);

  const where: SQL[] = [];
  if (status !== "all") where.push(eq(m.status, status));
  if (typeId) where.push(eq(m.membershipTypeId, typeId));
  if (q) {
    const like = `%${q}%`;
    where.push(or(ilike(m.memberNumber, like), ilike(m.lastName, like), ilike(m.firstNames, like), ilike(m.email, like), ilike(m.mobilePhone, like))!);
  }
  const [rows, types, pending] = await Promise.all([
    db
      .select({
        id: m.id,
        memberNumber: m.memberNumber,
        lastName: m.lastName,
        firstNames: m.firstNames,
        email: m.email,
        mobile: m.mobilePhone,
        status: m.status,
        memberSince: m.memberSince,
        continuousSince: m.continuousSince,
        feeCents: m.currentFeeCents,
        nextDueOn: m.nextDueOn,
        typeName: schema.membershipTypes.name,
        feePeriod: schema.membershipTypes.feePeriod,
      })
      .from(m)
      .innerJoin(schema.membershipTypes, eq(schema.membershipTypes.id, m.membershipTypeId))
      .where(where.length ? and(...where) : undefined)
      .orderBy(asc(m.lastName), asc(m.firstNames))
      .limit(500),
    activeMembershipTypes(),
    db
      .select({ memberId: schema.upgradeRequests.memberId })
      .from(schema.upgradeRequests)
      .where(eq(schema.upgradeRequests.status, "pending")),
  ]);
  const pendingSet = new Set(pending.map((p) => p.memberId));
  const today = todayMu();
  const qs = (k: string) => {
    const u = new URLSearchParams({ status: k });
    if (q) u.set("q", q);
    if (typeId) u.set("type", typeId);
    return `/staff/members?${u}`;
  };

  return (
    <StaffShell staff={staff} active="members">
      <div className={s.titleRow}>
        <h1 className={s.title}>Members</h1>
      </div>
      <nav aria-label="Filter by status" className={s.tabs}>
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={qs(t.key)}
            className={`${s.tab} ${t.key === status ? s.tabActive : ""}`}
            aria-current={t.key === status ? "page" : undefined}
          >
            {t.label} <strong>{countOf(t.key)}</strong>
          </Link>
        ))}
      </nav>
      <form method="get" action="/staff/members" className={`${s.card}`} style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", gap: 12 }}>
        <input type="hidden" name="status" value={status} />
        <div className={r.field} style={{ flex: "2 1 260px" }}>
          <label htmlFor="q">Search</label>
          <input id="q" type="search" name="q" defaultValue={q} placeholder="Name, member number, email or phone" />
        </div>
        <div className={r.field} style={{ flex: "1 1 200px" }}>
          <label htmlFor="type">Membership type</label>
          <select id="type" name="type" defaultValue={typeId}>
            <option value="">All types</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={s.btnPrimary} style={{ minHeight: 40 }}>
          Search
        </button>
        {q || typeId ? (
          <Link href={`/staff/members?status=${status}`} className={s.btn}>
            Clear
          </Link>
        ) : null}
      </form>

      <div className={s.card}>
        {rows.length === 0 ? (
          <p className={s.empty}>No members match.</p>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Member no.</th>
                  <th>Member</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Member since</th>
                  <th className={r.num}>Continuous</th>
                  <th className={r.num}>Fee</th>
                  <th>Next due</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className={s.nowrap}>
                      <Link href={`/staff/members/${row.id}`}>{row.memberNumber}</Link>
                    </td>
                    <td>
                      <Link href={`/staff/members/${row.id}`} style={{ color: "inherit", textDecoration: "none" }}>
                        <strong>
                          {row.lastName}, {row.firstNames}
                        </strong>
                      </Link>
                      <span className={r.sub}>{row.email}</span>
                    </td>
                    <td>
                      {row.typeName}
                      {pendingSet.has(row.id) ? <span className={r.sub}>change pending approval</span> : null}
                    </td>
                    <td>
                      <span className={`${s.pill} ${s[MEMBER_STATUS_EN[row.status][1]]}`}>{MEMBER_STATUS_EN[row.status][0]}</span>
                    </td>
                    <td className={s.nowrap}>{formatDateEn(row.memberSince)}</td>
                    <td className={r.num}>{tenureLabel(monthsBetween(row.continuousSince, today))}</td>
                    <td className={r.num}>{row.feeCents > 0 ? feeLabelEn(row.feeCents, row.feePeriod) : "—"}</td>
                    <td className={s.nowrap}>
                      {row.nextDueOn ? formatDateEn(row.nextDueOn) : "—"}
                      {row.nextDueOn && row.nextDueOn < today && (row.status === "active" || row.status === "renewal_due") ? (
                        <span className={r.sub} style={{ color: "var(--bad)" }}>
                          overdue
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows.length >= 500 ? <p className={s.note}>Showing the first 500. Narrow the search, or use Reports for full exports.</p> : null}
      </div>
    </StaffShell>
  );
}
