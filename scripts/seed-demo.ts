/**
 * Demonstration data for the reports: fictional members (some imported from the
 * existing register, with past admission dates) and applications in every outcome.
 *
 * Every demo record uses an @demo.invalid email address so it can be removed in one go:
 *   node seed-demo.cjs           # (re)create the demo data
 *   node seed-demo.cjs --remove  # remove it
 *
 * Never run against production once MTC's real register has been loaded.
 */
import { Pool, type PoolClient } from "pg";

const DOMAIN = "demo.invalid";

const SURNAMES = [
  "Ramdenee", "Lagesse", "Jugnauth", "Desvaux", "Appadoo", "Li Kwong Ken", "Rivalland", "Seegoolam",
  "Ah-Chuen", "Koenig", "Bhugeloo", "Maurel", "Ramsamy", "Hardy", "Toolsee", "Leclézio",
  "Dookhun", "Espitalier", "Moonien", "Chan Low", "Gujadhur", "de Chazal", "Boodhoo", "Pitot",
  "Ramgoolam", "Noël", "Soobratty", "Lim Fat", "Rey", "Bundhoo", "Gopee", "Marie",
];
const FIRST = [
  "Anil", "Christine", "Pravind", "Jean-Marc", "Sandhya", "Kevin", "Nathalie", "Vikash",
  "Michel", "Isabelle", "Rajesh", "Patrick", "Sharmila", "Olivier", "Deepak", "Sophie",
  "Ashok", "Thierry", "Kamini", "David", "Navin", "Valérie", "Rishi", "Laurent",
  "Priya", "Gilles", "Yogesh", "Marie-Claire", "Stéphane", "Anjali", "Sunil", "Josée",
];

/** Months ago each demo member was admitted / continuously a member, and their status. */
const MEMBERS: { since: number; continuous?: number; status: "active" | "renewal_due" | "lapsed" | "resigned"; imported: boolean }[] = [
  { since: 2, status: "active", imported: true },
  { since: 4, status: "active", imported: true },
  { since: 7, status: "active", imported: true },
  { since: 9, status: "active", imported: true },
  { since: 11, status: "active", imported: true },
  { since: 13, status: "active", imported: true },
  { since: 15, status: "active", imported: true },
  { since: 18, status: "renewal_due", imported: true },
  { since: 20, status: "active", imported: true },
  { since: 23, status: "active", imported: true },
  { since: 25, status: "active", imported: true },
  { since: 28, status: "active", imported: true },
  { since: 31, status: "lapsed", imported: true },
  { since: 34, status: "active", imported: true },
  { since: 37, status: "active", imported: true },
  { since: 41, status: "active", imported: true },
  { since: 48, continuous: 14, status: "active", imported: true }, // re-admitted 14 months ago
  { since: 55, status: "active", imported: true },
  { since: 62, status: "renewal_due", imported: true },
  { since: 75, status: "active", imported: true },
  { since: 90, continuous: 30, status: "active", imported: true }, // re-admitted 30 months ago
  { since: 110, status: "active", imported: true },
  { since: 132, status: "resigned", imported: true },
  { since: 150, status: "active", imported: true },
];

type AppSpec = {
  status: "submitted" | "deferred" | "rejected" | "approved" | "admitted";
  receivedDaysAgo: number;
  decidedDaysAgo?: number;
  comment?: string;
  compliance: "pending" | "cleared" | "not_cleared";
  submissions?: number;
};

const APPLICATIONS: AppSpec[] = [
  { status: "submitted", receivedDaysAgo: 1, compliance: "pending" },
  { status: "submitted", receivedDaysAgo: 3, compliance: "cleared" },
  { status: "submitted", receivedDaysAgo: 6, compliance: "pending", submissions: 2 },
  { status: "deferred", receivedDaysAgo: 12, decidedDaysAgo: 8, compliance: "pending",
    comment: "Proof of address is older than three months. Please upload a utility bill dated within the last three months." },
  { status: "deferred", receivedDaysAgo: 20, decidedDaysAgo: 15, compliance: "cleared",
    comment: "Payment not processed within 5 business days" },
  { status: "deferred", receivedDaysAgo: 34, decidedDaysAgo: 27, compliance: "pending",
    comment: "Second sponsor has not confirmed. Please ask Mr Koenig to reply to the sponsorship email or contact the Club." },
  { status: "rejected", receivedDaysAgo: 40, decidedDaysAgo: 31, compliance: "not_cleared",
    comment: "Compliance screening not cleared. The Committee is unable to accept the application." },
  { status: "rejected", receivedDaysAgo: 65, decidedDaysAgo: 52, compliance: "cleared",
    comment: "Sponsors are not members in good standing as required by the Club's rules." },
  { status: "rejected", receivedDaysAgo: 95, decidedDaysAgo: 80, compliance: "cleared",
    comment: "Application did not meet the Committee's admission criteria for this intake." },
  { status: "approved", receivedDaysAgo: 9, decidedDaysAgo: 2, compliance: "cleared" },
  { status: "approved", receivedDaysAgo: 14, decidedDaysAgo: 4, compliance: "cleared" },
  { status: "admitted", receivedDaysAgo: 75, decidedDaysAgo: 68, compliance: "cleared" },
  { status: "admitted", receivedDaysAgo: 130, decidedDaysAgo: 121, compliance: "cleared" },
  { status: "admitted", receivedDaysAgo: 220, decidedDaysAgo: 210, compliance: "cleared" },
  { status: "admitted", receivedDaysAgo: 300, decidedDaysAgo: 290, compliance: "cleared" },
];

const DAY = 86400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
function monthsAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - n);
  d.setUTCDate(5 + (n % 20));
  return isoDay(d);
}
function nextMonthFirst(): string {
  const d = new Date();
  return isoDay(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)));
}
const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "");

async function remove(c: PoolClient) {
  const like = `%@${DOMAIN}`;
  const m = await c.query(`delete from members where email like $1`, [like]);
  const a = await c.query(
    `delete from applications where account_id in (select id from accounts where email like $1)`,
    [like],
  );
  const acc = await c.query(`delete from accounts where email like $1`, [like]);
  console.log(`Removed ${m.rowCount} demo members, ${a.rowCount} demo applications, ${acc.rowCount} demo accounts`);
}

async function seed(c: PoolClient) {
  const types = await c.query<{ id: string; fee_cents: number }>(
    `select id, fee_cents from membership_types order by sort_order limit 1`,
  );
  if (!types.rowCount) throw new Error("No membership types: run the migrations first");
  const type = types.rows[0];
  const staff = await c.query<{ id: string }>(`select id from staff_users order by created_at limit 1`);
  const staffId = staff.rows[0]?.id ?? null;

  let n = 0;
  const person = () => {
    const i = n++;
    const last = SURNAMES[i % SURNAMES.length];
    const first = FIRST[(i * 7 + Math.floor(i / SURNAMES.length)) % FIRST.length];
    return { last, first, email: `${slug(first)}.${slug(last)}.${i}@${DOMAIN}`, mobile: `5${String(7000000 + i * 13579).slice(0, 7)}` };
  };

  // Members imported from the existing register (no online account yet).
  let regNo = 1200;
  for (const spec of MEMBERS) {
    const p = person();
    const since = monthsAgo(spec.since);
    const cont = monthsAgo(spec.continuous ?? spec.since);
    // Register numbers sit below the online sequence (which starts at MTC-010000), so they never collide.
    const memberNumber = `MTC-${String(spec.imported ? regNo++ : 9000 + n).padStart(6, "0")}`;
    const r = await c.query<{ id: string }>(
      `insert into members (member_number, membership_type_id, status, last_name, first_names, email, mobile_phone,
         nationality, member_since, continuous_since, current_fee_cents, next_due_on, imported_from_register)
       values ($1,$2,$3,$4,$5,$6,$7,'Mauricienne',$8,$9,$10,$11,$12) returning id`,
      [memberNumber, type.id, spec.status, p.last.toUpperCase(), p.first, p.email, p.mobile, since, cont, type.fee_cents,
        spec.status === "active" || spec.status === "renewal_due" ? nextMonthFirst() : null, spec.imported],
    );
    await c.query(
      `insert into member_type_periods (member_id, membership_type_id, start_date, fee_cents) values ($1,$2,$3,$4)`,
      [r.rows[0].id, type.id, cont, type.fee_cents],
    );
    await c.query(
      `insert into member_events (member_id, at, event_type, title, detail, actor_type)
       values ($1,$2,'admitted','Admitted as member',$3,'system')`,
      [r.rows[0].id, `${since}T10:00:00+04:00`, spec.imported ? "Imported from the existing membership register" : null],
    );
  }

  // Applications in every outcome, each with its own applicant account.
  let ref = 9001;
  const year = new Date().getUTCFullYear();
  for (const spec of APPLICATIONS) {
    const p = person();
    const acc = await c.query<{ id: string }>(
      `insert into accounts (email, password_hash, full_name, last_name, first_names, mobile_phone, email_verified_at)
       values ($1,'!demo-no-login',$2,$3,$4,$5,$6) returning id`,
      [p.email, `${p.first} ${p.last.toUpperCase()}`, p.last.toUpperCase(), p.first, p.mobile, daysAgo(spec.receivedDaysAgo + 2)],
    );
    const accountId = acc.rows[0].id;
    const received = daysAgo(spec.receivedDaysAgo);
    const decided = spec.decidedDaysAgo !== undefined ? daysAgo(spec.decidedDaysAgo) : null;
    const paymentDue = spec.status === "approved" && decided ? new Date(decided.getTime() + 7 * DAY) : null;
    const admitted = spec.status === "admitted" && decided ? new Date(decided.getTime() + 3 * DAY) : null;
    const reference = `APP-${year}-${ref++}`;
    const app = await c.query<{ id: string }>(
      `insert into applications (reference, account_id, membership_type_id, status, last_name, first_names, nationality,
         mobile_phone, profession, received_at, last_submitted_at, submission_count, compliance_status,
         compliance_reviewed_at, decided_by_id, decided_at, decision_comment, payment_due_at, admitted_at,
         declaration_accepted_at, signature_name, signed_at, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,'Mauricienne',$7,'Cadre',$8,$8,$9,$10,$11,$12,$13,$14,$15,$16,$8,$17,$8,$8,now())
       returning id`,
      [reference, accountId, type.id, spec.status, p.last.toUpperCase(), p.first, p.mobile, received, spec.submissions ?? 1,
        spec.compliance, spec.compliance === "pending" ? null : received, decided ? staffId : null, decided,
        spec.comment ?? null, paymentDue, admitted, `${p.first} ${p.last.toUpperCase()}`],
    );
    const appId = app.rows[0].id;
    for (const pos of [1, 2]) {
      const sLast = SURNAMES[(n * 3 + pos * 5) % SURNAMES.length];
      const sFirst = FIRST[(n * 5 + pos * 3) % FIRST.length];
      const s = { last: sLast, first: sFirst, email: `${slug(sFirst)}.${slug(sLast)}.s${n}${pos}@${DOMAIN}` };
      await c.query(
        `insert into application_sponsors (application_id, position, last_name, first_names, email, confirmed_at)
         values ($1,$2,$3,$4,$5,$6)`,
        [appId, pos, s.last.toUpperCase(), s.first, s.email,
          spec.status === "submitted" && pos === 2 ? null : spec.comment?.includes("sponsor has not") && pos === 2 ? null : received],
      );
    }
    await c.query(
      `insert into application_events (application_id, at, actor_type, account_id, event_type, subject, to_status)
       values ($1,$2,'applicant',$3,'submitted','Application submitted','submitted')`,
      [appId, received, accountId],
    );
    if (decided && spec.status !== "submitted") {
      await c.query(
        `insert into application_events (application_id, at, actor_type, staff_user_id, event_type, subject, comment, from_status, to_status)
         values ($1,$2,$3,$4,$5,$6,$7,'submitted',$8)`,
        [appId, decided, staffId ? "staff" : "system", staffId, spec.status === "admitted" ? "approved" : spec.status,
          `Application ${spec.status === "admitted" ? "approved" : spec.status}`, spec.comment ?? null,
          spec.status === "admitted" ? "approved" : spec.status],
      );
    }
    if (admitted) {
      const memberNumber = `MTC-${String(9500 + ref - 9000).padStart(6, "0")}`;
      const since = isoDay(admitted);
      const m = await c.query<{ id: string }>(
        `insert into members (member_number, account_id, application_id, membership_type_id, status, last_name, first_names,
           email, mobile_phone, nationality, member_since, continuous_since, current_fee_cents, next_due_on)
         values ($1,$2,$3,$4,'active',$5,$6,$7,$8,'Mauricienne',$9,$9,$10,$11) returning id`,
        [memberNumber, accountId, appId, type.id, p.last.toUpperCase(), p.first, p.email, p.mobile, since, type.fee_cents, nextMonthFirst()],
      );
      await c.query(
        `insert into member_type_periods (member_id, membership_type_id, start_date, fee_cents) values ($1,$2,$3,$4)`,
        [m.rows[0].id, type.id, since, type.fee_cents],
      );
      await c.query(
        `insert into member_events (member_id, at, event_type, title, detail, actor_type)
         values ($1,$2,'admitted','Admitted as member',$3,'system')`,
        [m.rows[0].id, admitted, `Application ${reference}`],
      );
    }
  }
  console.log(`Created ${MEMBERS.length + APPLICATIONS.filter((a) => a.status === "admitted").length} demo members and ${APPLICATIONS.length} demo applications`);
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString, max: 1 });
  const c = await pool.connect();
  try {
    await c.query("begin");
    await remove(c);
    if (!process.argv.includes("--remove")) await seed(c);
    await c.query("commit");
  } catch (err) {
    await c.query("rollback");
    throw err;
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
