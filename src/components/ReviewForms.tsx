"use client";

import { useActionState, useState } from "react";
import {
  addObservation,
  decideApplication,
  recordCompliance,
  reviewDocument,
} from "@/app/actions/review";
import { recordJoiningPayment } from "@/app/actions/payments";
import type { FormState } from "@/app/actions/auth";
import ui from "./ui.module.css";
import s from "./staff.module.css";

function Feedback({ state }: { state: FormState }) {
  if (state.error)
    return (
      <p role="alert" className={ui.alertError} style={{ margin: 0 }}>
        {state.error}
      </p>
    );
  if (state.message)
    return (
      <p role="status" className={ui.alertOk} style={{ margin: 0 }}>
        {state.message}
      </p>
    );
  return null;
}

/** Verify / reject buttons for one KYC document; reject asks for a comment. */
export function DocumentReview({
  documentId,
  status,
  canReview,
}: {
  documentId: string;
  status: "pending" | "verified" | "rejected";
  canReview: boolean;
}) {
  const [state, action, pending] = useActionState(reviewDocument.bind(null, documentId), {});
  const [rejecting, setRejecting] = useState(false);
  if (!canReview) return null;
  return (
    <form action={action} className={s.rowActions} style={{ width: "100%", justifyContent: "flex-end" }}>
      {rejecting ? (
        <>
          <label className="sr-only" htmlFor={`rej-${documentId}`}>
            Reason for rejecting this document
          </label>
          <input
            id={`rej-${documentId}`}
            name="comment"
            type="text"
            placeholder="Reason (shown to reviewers)"
            style={{ minHeight: 40, maxWidth: 320 }}
          />
          <button type="submit" name="decision" value="rejected" className={s.btnBad} disabled={pending}>
            Confirm reject
          </button>
          <button type="button" className={s.btn} onClick={() => setRejecting(false)}>
            Cancel
          </button>
        </>
      ) : (
        <>
          {status !== "verified" ? (
            <button type="submit" name="decision" value="verified" className={s.btnOk} disabled={pending}>
              Verify
            </button>
          ) : null}
          {status !== "rejected" ? (
            <button type="button" className={s.btnBad} onClick={() => setRejecting(true)} disabled={pending}>
              Reject
            </button>
          ) : null}
          {status !== "pending" ? (
            <button type="submit" name="decision" value="pending" className={s.btn} disabled={pending}>
              Undo
            </button>
          ) : null}
        </>
      )}
      {state.error ? (
        <span role="alert" className={ui.fieldError} style={{ width: "100%", textAlign: "right" }}>
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

export function ComplianceForm({ applicationId }: { applicationId: string }) {
  const [state, action, pending] = useActionState(recordCompliance.bind(null, applicationId), {});
  return (
    <form action={action} className={ui.form} style={{ gap: 12 }}>
      <Feedback state={state} />
      <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
        <legend className="sr-only">Compliance outcome</legend>
        <div className={s.choice} style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
          <label>
            <input type="radio" name="outcome" value="cleared" /> Cleared
          </label>
          <label>
            <input type="radio" name="outcome" value="not_cleared" /> Not cleared
          </label>
        </div>
      </fieldset>
      <div className={ui.field}>
        <label htmlFor="compliance-comment" className={ui.label}>
          Comment <span className={ui.hint}>(required if not cleared)</span>
        </label>
        <textarea id="compliance-comment" name="comment" rows={2} />
      </div>
      <button type="submit" className={s.btn} disabled={pending}>
        {pending ? "Saving…" : "Record Compliance Review"}
      </button>
    </form>
  );
}

export function DecisionForm({
  applicationId,
  canApprove,
  blockers,
}: {
  applicationId: string;
  canApprove: boolean;
  blockers: string[];
}) {
  const [state, action, pending] = useActionState(decideApplication.bind(null, applicationId), {});
  const [choice, setChoice] = useState("");
  if (state.message) return <Feedback state={state} />;
  return (
    <form action={action} className={ui.form} style={{ gap: 12 }}>
      <Feedback state={state} />
      <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
        <legend className="sr-only">Decision</legend>
        <div className={s.choice}>
          {[
            ["approve", "Approve"],
            ["defer", "Defer"],
            ["reject", "Reject"],
          ].map(([v, l]) => (
            <label key={v}>
              <input type="radio" name="decision" value={v} checked={choice === v} onChange={() => setChoice(v)} /> {l}
            </label>
          ))}
        </div>
      </fieldset>
      {choice === "approve" && !canApprove ? (
        <p className={s.hint} style={{ margin: 0 }}>
          Approval unlocks when: {blockers.join("; ")}.
        </p>
      ) : null}
      <div className={ui.field}>
        <label htmlFor="decision-comment" className={ui.label}>
          Comment to applicant{" "}
          <span className={ui.hint}>
            {choice === "defer" || choice === "reject" ? "(required, shown in the portal and the email)" : "(optional)"}
          </span>
        </label>
        <textarea id="decision-comment" name="comment" rows={3} defaultValue={state.values?.comment ?? ""} />
      </div>
      <button type="submit" className={s.btnPrimary} disabled={pending || !choice}>
        {pending ? "Saving…" : "Confirm decision"}
      </button>
    </form>
  );
}

export function ObservationForm({ applicationId }: { applicationId: string }) {
  const [state, action, pending] = useActionState(addObservation.bind(null, applicationId), {});
  return (
    <form action={action} className={ui.form} style={{ gap: 10, marginTop: 8 }}>
      <Feedback state={state} />
      <div className={ui.field}>
        <label htmlFor="obs-subject" className={ui.label}>
          Sujet
        </label>
        <input id="obs-subject" name="subject" type="text" defaultValue={state.error ? state.values?.subject : ""} />
      </div>
      <div className={ui.field}>
        <label htmlFor="obs-comment" className={ui.label}>
          Commentaires
        </label>
        <textarea id="obs-comment" name="comment" rows={2} defaultValue={state.error ? state.values?.comment : ""} />
      </div>
      <button type="submit" className={s.btn} disabled={pending} style={{ alignSelf: "flex-start" }}>
        Add observation
      </button>
    </form>
  );
}

export function PaymentForm({
  applicationId,
  suggestedAmount,
  today,
  reference,
}: {
  applicationId: string;
  suggestedAmount: string;
  today: string;
  reference: string;
}) {
  const [state, action, pending] = useActionState(recordJoiningPayment.bind(null, applicationId), {});
  if (state.message) return <Feedback state={state} />;
  const fe = state.fieldErrors ?? {};
  const v = state.values ?? {};
  const field = (name: string, label: string, input: React.ReactNode) => (
    <div className={ui.field}>
      <label htmlFor={`pay-${name}`} className={ui.label}>
        {label}
      </label>
      {input}
      {fe[name] ? <span className={ui.fieldError}>{fe[name]}</span> : null}
    </div>
  );
  return (
    <form action={action} className={ui.form} style={{ gap: 12 }}>
      <Feedback state={state} />
      {field(
        "amount",
        "Amount received (Rs)",
        <input id="pay-amount" name="amount" type="text" inputMode="decimal" defaultValue={v.amount ?? suggestedAmount} placeholder="e.g. 1500.00" />,
      )}
      {field("paidOn", "Date received", <input id="pay-paidOn" name="paidOn" type="date" defaultValue={v.paidOn ?? today} max={today} />)}
      {field(
        "method",
        "Paid by",
        <select id="pay-method" name="method" defaultValue={v.method ?? "bank_transfer"}>
          <option value="bank_transfer">Bank transfer</option>
          <option value="cash">Cash</option>
          <option value="cheque">Cheque</option>
        </select>,
      )}
      {field(
        "reference",
        "Bank or receipt reference",
        <input id="pay-reference" name="reference" type="text" defaultValue={v.reference ?? ""} placeholder={`Transfer should quote ${reference}`} />,
      )}
      <button type="submit" className={s.btnPrimary} disabled={pending}>
        {pending ? "Recording…" : "Record payment and admit member"}
      </button>
    </form>
  );
}
