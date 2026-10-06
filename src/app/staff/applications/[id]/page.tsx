import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { StaffShell } from "@/components/StaffShell";
import { ComplianceForm, DecisionForm, DocumentReview, ObservationForm, PaymentForm, ReopenForm, SponsorActions } from "@/components/ReviewForms";
import { getBankDetails } from "@/lib/settings";
import { muDate } from "@/lib/business-days";
import { hasRole, requireStaffPage } from "@/lib/staff";
import { DOCUMENT_REQUIREMENTS, monthsSince } from "@/lib/applications";
import { formatDateEn, formatDateTimeEn, formatSizeEn } from "@/lib/format";
import { STATUS_EN } from "@/lib/staff-labels";
import s from "@/components/staff.module.css";
import ui from "@/components/ui.module.css";

export const metadata: Metadata = { title: "Application review" };

const DOC_EN: Record<string, string> = {
  id_document: "National Identity Card or passport",
  proof_of_address: "Proof of address (under 3 months)",
  certificate_of_character: "Certificate of Character (under 6 months)",
  photo: "Passport-format photograph",
  other: "Other document requested by the Club",
};

export default async function ApplicationReview({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaffPage();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = getDb();

  const [app] = await db.select().from(schema.applications).where(eq(schema.applications.id, id)).limit(1);
  if (!app) notFound();

  const [account, type, sponsors, docs, events, staffList] = await Promise.all([
    db.select().from(schema.accounts).where(eq(schema.accounts.id, app.accountId)).limit(1).then((r) => r[0]),
    app.membershipTypeId
      ? db.select().from(schema.membershipTypes).where(eq(schema.membershipTypes.id, app.membershipTypeId)).limit(1).then((r) => r[0])
      : Promise.resolve(undefined),
    db.select().from(schema.applicationSponsors).where(eq(schema.applicationSponsors.applicationId, id)).orderBy(asc(schema.applicationSponsors.position)),
    db
      .select()
      .from(schema.documents)
      .where(and(eq(schema.documents.applicationId, id), isNull(schema.documents.supersededAt)))
      .orderBy(asc(schema.documents.uploadedAt)),
    db.select().from(schema.applicationEvents).where(eq(schema.applicationEvents.applicationId, id)).orderBy(desc(schema.applicationEvents.at)),
    db.select({ id: schema.staffUsers.id, name: schema.staffUsers.displayName }).from(schema.staffUsers),
  ]);
  const bank = await getBankDetails();
  const [member] = await db
    .select({ id: schema.members.id, memberNumber: schema.members.memberNumber })
    .from(schema.members)
    .where(eq(schema.members.applicationId, id))
    .limit(1);
  const joiningPayments = await db
    .select()
    .from(schema.payments)
    .where(and(eq(schema.payments.applicationId, id), eq(schema.payments.purpose, "joining")))
    .orderBy(desc(schema.payments.createdAt));
  const joining = joiningPayments.find((p) => p.status === "paid");
  const cardAttempts = joiningPayments.filter((p) => p.method === "card");
  const staffName = (sid: string | null) => staffList.find((x) => x.id === sid)?.name ?? "";

  const inReview = app.status === "submitted";
  const required = DOCUMENT_REQUIREMENTS.filter((r) => r.required);
  const verifiedCount = required.filter((r) => docs.some((d) => d.kind === r.kind && d.reviewStatus === "verified")).length;
  const rejectedCount = docs.filter((d) => d.reviewStatus === "rejected").length;
  const kycDone = verifiedCount === required.length;
  const complianceDone = app.complianceStatus === "cleared";
  const blockers = [
    ...(kycDone ? [] : [`all 4 KYC documents verified (${verifiedCount} of 4 so far)`]),
    ...(complianceDone ? [] : ["the Compliance Review is cleared"]),
  ];
  const sponsorsConfirmed = sponsors.filter((sp) => sp.confirmedAt).length;

  const dot = (state: "ok" | "warn" | "bad" | "idle") =>
    `${s.dot} ${state === "ok" ? s.dotOk : state === "warn" ? s.dotWarn : state === "bad" ? s.dotBad : s.dotIdle}`;
  const decided = app.status === "approved" || app.status === "admitted" || app.status === "rejected" || app.status === "deferred";

  return (
    <StaffShell staff={staff} active="applications">
      <span className={s.crumb}>
        <Link href="/staff/applications">Applications</Link> / {app.reference}
      </span>
      <div className={s.titleRow}>
        <h1 className={s.title}>
          {app.firstNames} {app.lastName}
        </h1>
        <span className={`${s.pill} ${s[STATUS_EN[app.status][1]]}`}>{STATUS_EN[app.status][0]}</span>
      </div>
      <p className={s.note} style={{ margin: 0 }}>
        {app.reference} · {type?.name ?? "Type not chosen"} · Date de réception du dossier :{" "}
        {app.receivedAt ? formatDateEn(app.receivedAt) : "—"}
        {app.submissionCount > 1 ? ` · resubmitted (${app.submissionCount} submissions)` : " · first submission"}
      </p>

      <ol aria-label="Application progress" className={s.rail}>
        <li>
          <span className={dot(app.receivedAt ? "ok" : "idle")} />
          <span className={s.railText}>
            Submitted<span className={s.railSub}>{app.lastSubmittedAt ? formatDateEn(app.lastSubmittedAt) : "Not yet"}</span>
          </span>
        </li>
        <li>
          <span className={dot(kycDone ? "ok" : rejectedCount ? "bad" : "warn")} />
          <span className={s.railText}>
            KYC
            <span className={s.railSub}>
              {verifiedCount} of 4 verified{rejectedCount ? ` · ${rejectedCount} rejected` : ""}
            </span>
          </span>
        </li>
        <li>
          <span className={dot(complianceDone ? "ok" : app.complianceStatus === "not_cleared" ? "bad" : "warn")} />
          <span className={s.railText}>
            Compliance Review
            <span className={s.railSub}>
              {app.complianceStatus === "cleared" ? "Cleared" : app.complianceStatus === "not_cleared" ? "Not cleared" : "Pending"}
            </span>
          </span>
        </li>
        <li>
          <span className={dot(app.status === "approved" || app.status === "admitted" ? "ok" : app.status === "rejected" || app.status === "deferred" ? "bad" : "idle")} />
          <span className={s.railText}>
            Decision
            <span className={s.railSub}>{decided ? STATUS_EN[app.status][0].split(" ·")[0] : "Pending"}</span>
          </span>
        </li>
        <li>
          <span className={dot(app.status === "admitted" ? "ok" : app.status === "approved" ? "warn" : "idle")} />
          <span className={s.railText}>
            Payment
            <span className={s.railSub}>
              {app.status === "admitted"
                ? "Paid"
                : app.status === "approved" && app.paymentDueAt
                  ? `Due by ${formatDateEn(app.paymentDueAt)}`
                  : "Not started"}
            </span>
          </span>
        </li>
      </ol>

      <div className={s.columns}>
        <div className={s.stack}>
          <section className={s.card} aria-labelledby="h-details">
            <h2 id="h-details" className={s.cardTitle}>
              Applicant details <span className={s.note}>· Sections I and II</span>
            </h2>
            <dl className={s.dl}>
              <div><dt>Nom</dt><dd>{app.lastName}</dd></div>
              <div><dt>Prénoms</dt><dd>{app.firstNames}</dd></div>
              <div><dt>Date de naissance</dt><dd>{app.dateOfBirth ? formatDateEn(app.dateOfBirth) : "—"}</dd></div>
              <div><dt>Nationalité</dt><dd>{app.nationality}</dd></div>
              <div><dt>CNI / Passeport No</dt><dd>{app.idNumber}</dd></div>
              <div><dt>Adresse courriel</dt><dd>{account?.email}</dd></div>
              <div className={s.span2}><dt>Adresse résidentielle</dt><dd>{app.residentialAddress}</dd></div>
              <div><dt>Téléphone</dt><dd>{app.mobilePhone}{app.homePhone ? ` · ${app.homePhone}` : ""}</dd></div>
              <div><dt>Profession / Occupation</dt><dd>{app.profession}</dd></div>
              <div><dt>Employeur / société</dt><dd>{app.employerName || "—"}</dd></div>
              <div><dt>Adresse professionnelle</dt><dd>{app.workAddress || "—"}</dd></div>
              <div className={s.span2}>
                <dt>Déclaration et signature</dt>
                <dd>
                  {app.signedAt
                    ? `Signed electronically by ${app.signatureName}, fait à ${app.signaturePlace}, ${formatDateTimeEn(app.signedAt)} (IP ${app.signatureIp ?? "n/a"})`
                    : "Not signed"}
                </dd>
              </div>
            </dl>
          </section>

          <section className={s.card} aria-labelledby="h-kyc">
            <div className={s.cardHead}>
              <h2 id="h-kyc" className={s.cardTitle}>
                KYC documents
              </h2>
              <span className={s.note}>{verifiedCount} of 4 verified</span>
            </div>
            {DOCUMENT_REQUIREMENTS.map((req) => {
              const doc = docs.filter((d) => d.kind === req.kind).at(-1);
              if (!doc && !req.required) return null;
              const tooOld =
                doc?.documentDate && req.maxAgeMonths && monthsSince(doc.documentDate) >= req.maxAgeMonths;
              const pill = !doc
                ? [s.pillBad, "Missing"]
                : doc.reviewStatus === "verified"
                  ? [s.pillOk, "Verified"]
                  : doc.reviewStatus === "rejected"
                    ? [s.pillBad, "Rejected"]
                    : [s.pillIdle, "Pending"];
              return (
                <div key={req.kind} className={s.row} data-kind={req.kind}>
                  <div className={s.rowMain}>
                    <span className={s.rowTitle}>
                      ({req.letter}) {DOC_EN[req.kind]}
                    </span>
                    {doc ? (
                      <span className={s.rowMeta}>
                        <a href={`/api/documents/${doc.id}`} target="_blank" rel="noopener noreferrer">
                          {doc.originalFilename}
                        </a>{" "}
                        · {formatSizeEn(doc.sizeBytes)} · uploaded {formatDateEn(doc.uploadedAt)}
                        {doc.documentDate ? ` · dated ${formatDateEn(doc.documentDate)}` : ""}
                        {tooOld ? <strong style={{ color: "var(--warn)" }}> · older than {req.maxAgeMonths} months</strong> : null}
                      </span>
                    ) : null}
                    {doc?.reviewedAt ? (
                      <span className={s.note}>
                        {doc.reviewStatus === "verified" ? "Verified" : "Rejected"} by {staffName(doc.reviewedById)},{" "}
                        {formatDateTimeEn(doc.reviewedAt)}
                        {doc.reviewComment ? ` — ${doc.reviewComment}` : ""}
                      </span>
                    ) : null}
                  </div>
                  <span className={`${s.pill} ${pill[0]}`}>{pill[1]}</span>
                  {doc ? (
                    <DocumentReview
                      key={`${doc.id}-${doc.reviewStatus}`}
                      documentId={doc.id}
                      status={doc.reviewStatus}
                      canReview={inReview && hasRole(staff, "reviewer", "compliance_officer")}
                    />
                  ) : null}
                </div>
              );
            })}
          </section>

          <section className={s.card} aria-labelledby="h-sponsors">
            <div className={s.cardHead}>
              <h2 id="h-sponsors" className={s.cardTitle}>
                Sponsors <span className={s.note}>· Parrainage</span>
              </h2>
              <span className={s.note}>
                {sponsorsConfirmed} of {sponsors.length} confirmed
              </span>
            </div>
            {sponsors.map((sp) => {
              const how =
                sp.confirmationMethod && sp.confirmationMethod !== "email"
                  ? ` · ${{ phone: "by phone", in_person: "in person", paper: "on paper" }[sp.confirmationMethod] ?? sp.confirmationMethod}, recorded by ${staffName(sp.confirmedByStaffId)}${sp.confirmationNote ? ` — ${sp.confirmationNote}` : ""}`
                  : sp.confirmationMethod === "email"
                    ? " · by email link"
                    : "";
              return (
                <div key={sp.id} className={s.row} data-sponsor={sp.position}>
                  <div className={s.rowMain}>
                    <span className={s.rowTitle}>
                      {sp.firstNames} {sp.lastName}
                    </span>
                    <span className={s.rowMeta}>
                      {sp.email}
                      {sp.phone ? ` · ${sp.phone}` : ""}
                    </span>
                    <span className={s.note}>
                      {sp.confirmedAt
                        ? `Confirmed ${formatDateTimeEn(sp.confirmedAt)}${how}`
                        : sp.declinedAt
                          ? `Declined ${formatDateTimeEn(sp.declinedAt)}${how}`
                          : sp.requestedAt
                            ? `Request emailed ${formatDateEn(sp.requestedAt)}${sp.lastReminderAt ? `, resent ${formatDateEn(sp.lastReminderAt)}` : ""}`
                            : "Not yet requested"}
                    </span>
                  </div>
                  <span className={`${s.pill} ${sp.confirmedAt ? s.pillOk : sp.declinedAt ? s.pillBad : s.pillWarn}`}>
                    {sp.confirmedAt ? "Confirmed" : sp.declinedAt ? "Declined" : "Awaiting"}
                  </span>
                  {!sp.confirmedAt &&
                  (app.status === "submitted" || app.status === "deferred") &&
                  hasRole(staff, "reviewer", "compliance_officer", "administrator") ? (
                    <SponsorActions sponsorId={sp.id} email={sp.email} />
                  ) : null}
                </div>
              );
            })}
          </section>
        </div>

        <div className={s.stack}>
          <section className={s.card} aria-labelledby="h-compliance">
            <div className={s.cardHead}>
              <h2 id="h-compliance" className={s.cardTitle}>
                Compliance Review
              </h2>
              <span
                className={`${s.pill} ${complianceDone ? s.pillOk : app.complianceStatus === "not_cleared" ? s.pillBad : s.pillIdle}`}
              >
                {complianceDone ? "Cleared" : app.complianceStatus === "not_cleared" ? "Not cleared" : "Pending"}
              </span>
            </div>
            <p className={s.note} style={{ margin: 0 }}>
              Identity, integrity and reputation checks under MTC’s AML-CFT policy.
              {app.complianceReviewedAt
                ? ` Last recorded by ${staffName(app.complianceOfficerId)}, ${formatDateTimeEn(app.complianceReviewedAt)}${app.complianceComment ? ` — ${app.complianceComment}` : ""}.`
                : ""}
            </p>
            {inReview && hasRole(staff, "compliance_officer") ? <ComplianceForm applicationId={app.id} /> : null}
          </section>

          <section className={`${s.card} ${s.cardStrong}`} aria-labelledby="h-decision">
            <h2 id="h-decision" className={s.cardTitle}>
              Decision
            </h2>
            {inReview ? (
              hasRole(staff, "reviewer") ? (
                <DecisionForm
                  key={`${verifiedCount}-${app.complianceStatus}`}
                  applicationId={app.id} canApprove={blockers.length === 0} blockers={blockers} />
              ) : (
                <p className={s.note}>A Reviewer records the decision.</p>
              )
            ) : (
              <>
              <p
                className={app.status === "approved" || app.status === "admitted" ? ui.alertOk : app.status === "draft" ? s.note : ui.alertInfo}
                style={{ margin: 0 }}
              >
                {app.status === "draft"
                  ? "The applicant has not submitted this application yet."
                  : `${STATUS_EN[app.status][0]}${app.decidedAt ? ` by ${staffName(app.decidedById)}, ${formatDateTimeEn(app.decidedAt)}` : ""}${app.decisionComment ? ` — “${app.decisionComment}”` : ""}${app.status === "approved" && app.paymentDueAt ? `. Payment due by ${formatDateEn(app.paymentDueAt)}.` : ""}`}
              </p>
              {app.status === "rejected" && hasRole(staff, "administrator") ? <ReopenForm applicationId={app.id} /> : null}
              </>
            )}
          </section>

          {app.status === "approved" || app.status === "admitted" ? (
            <section className={s.card} aria-labelledby="h-payment">
              <div className={s.cardHead}>
                <h2 id="h-payment" className={s.cardTitle}>
                  Joining payment
                </h2>
                <span className={`${s.pill} ${app.status === "admitted" ? s.pillOk : s.pillWarn}`}>
                  {app.status === "admitted" ? "Paid" : "Awaiting payment"}
                </span>
              </div>
              {app.status === "admitted" && joining ? (
                <p className={s.note} style={{ margin: 0 }}>
                  Rs {(joining.amountCents / 100).toFixed(2)} received {formatDateEn(joining.paidAt)} by{" "}
                  {joining.method.replace("_", " ")}
                  {joining.reference ? `, ref. ${joining.reference}` : ""}
                  {joining.method === "card" ? ", confirmed with Peach Payments" : `, recorded by ${staffName(joining.recordedById)}`}.
                  {member ? ` Member no. ${member.memberNumber}.` : ""}
                </p>
              ) : (
                <>
                  <p className={s.note} style={{ margin: 0 }}>
                    Due by {formatDateEn(app.paymentDueAt)}. The applicant can pay by card online (confirmed
                    automatically) or transfer to {bank.bankName}, account {bank.accountNumber}, quoting{" "}
                    <strong>{app.reference}</strong>. Record a transfer, cash or cheque here.
                  </p>
                  {hasRole(staff, "finance") ? (
                    <PaymentForm
                      applicationId={app.id}
                      suggestedAmount={type && type.feeCents > 0 ? (type.feeCents / 100).toFixed(2) : ""}
                      today={muDate(new Date())}
                      reference={app.reference}
                    />
                  ) : (
                    <p className={s.note}>Finance records the payment when it is received.</p>
                  )}
                </>
              )}
            </section>
          ) : null}

          {cardAttempts.length ? (
            <section className={s.card} aria-labelledby="h-card">
              <h2 id="h-card" className={s.cardTitle}>
                Online card payments <span className={s.note}>· Peach Payments</span>
              </h2>
              <ul className={s.log}>
                {cardAttempts.map((p) => (
                  <li key={p.id}>
                    <span className={s.logHead}>
                      {formatDateTimeEn(p.createdAt)} · Rs {(p.amountCents / 100).toFixed(2)} ·{" "}
                      <span className={`${s.pill} ${p.status === "paid" ? s.pillOk : p.status === "pending" ? s.pillInfo : s.pillBad}`}>
                        {p.status === "pending" ? "Started, not completed" : p.status === "paid" ? "Paid" : "Failed"}
                      </span>
                    </span>
                    <span className={s.note}>
                      Ref. {p.reference}
                      {p.gatewayTransactionId ? ` · Peach transaction ${p.gatewayTransactionId}` : ""}
                      {p.failureReason ? ` · ${p.failureReason}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className={s.card} aria-labelledby="h-log">
            <h2 id="h-log" className={s.cardTitle}>
              Observations <span className={s.note}>· Date / Sujet / Commentaires</span>
            </h2>
            <ul className={s.log}>
              {events.map((e) => (
                <li key={e.id}>
                  <span className={s.logHead}>
                    {formatDateTimeEn(e.at)} · {e.subject ?? e.eventType}
                  </span>
                  {e.comment ? <span>{e.comment}</span> : null}
                  {e.staffUserId && !e.comment?.includes(staffName(e.staffUserId)) ? (
                    <span className={s.note}>{staffName(e.staffUserId)}</span>
                  ) : null}
                  {e.internal ? <span className={s.internal}>Internal</span> : null}
                </li>
              ))}
            </ul>
            {hasRole(staff, "reviewer", "compliance_officer", "administrator") ? (
              <ObservationForm applicationId={app.id} />
            ) : null}
          </section>
        </div>
      </div>
    </StaffShell>
  );
}
