"use client";

import { useActionState, useState } from "react";
import { changeMemberStatus, updateMemberDetails } from "@/app/actions/members";
import { decideUpgrade, requestUpgrade } from "@/app/actions/upgrades";
import type { FormState } from "@/app/actions/auth";
import { EDITABLE_FIELDS, type EditableField } from "@/lib/member-labels";
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

type Counted = FormState & { n?: number };

/** Server action wrapped with a submission counter, used as the form key so fields keep what was submitted. */
function useCountedAction(fn: (prev: FormState, fd: FormData) => Promise<FormState>) {
  return useActionState(
    async (prev: Counted, fd: FormData): Promise<Counted> => ({ ...(await fn(prev, fd)), n: (prev.n ?? 0) + 1 }),
    {} as Counted,
  );
}

function FieldError({ state, name }: { state: FormState; name: string }) {
  const e = state.fieldErrors?.[name];
  return e ? (
    <span className={ui.fieldError} id={`${name}-error`}>
      {e}
    </span>
  ) : null;
}

/** MEM-10: correct contact details (history kept). */
export function DetailsForm({ memberId, current }: { memberId: string; current: Record<EditableField, string> }) {
  const [state, action, pending] = useCountedAction(updateMemberDetails.bind(null, memberId));
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <div className={s.rowActions}>
        <button type="button" className={s.btn} onClick={() => setOpen(true)}>
          Edit contact details
        </button>
      </div>
    );
  const v = (k: EditableField) => state.values?.[k] ?? current[k] ?? "";
  return (
    <form key={state.n ?? 0} action={action} className={ui.form} style={{ gap: 12 }}>
      <Feedback state={state} />
      {(Object.keys(EDITABLE_FIELDS) as EditableField[]).map((k) => (
        <div key={k} className={ui.field}>
          <label htmlFor={`f-${k}`} className={ui.label}>
            {EDITABLE_FIELDS[k]}
          </label>
          {k === "residentialAddress" ? (
            <textarea id={`f-${k}`} name={k} rows={2} defaultValue={v(k)} />
          ) : (
            <input id={`f-${k}`} name={k} type={k === "email" ? "email" : "text"} defaultValue={v(k)} aria-invalid={Boolean(state.fieldErrors?.[k])} />
          )}
          <FieldError state={state} name={k} />
        </div>
      ))}
      <div className={s.rowActions}>
        <button type="submit" className={s.btnPrimary} disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </button>
        <button type="button" className={s.btn} onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
    </form>
  );
}

/** Administrator: lapse, resign or reinstate, with a reason. */
export function StatusForm({ memberId, status }: { memberId: string; status: string }) {
  const [state, action, pending] = useCountedAction(changeMemberStatus.bind(null, memberId));
  const options =
    status === "lapsed"
      ? [
          ["reinstate", "Reinstate"],
          ["resign", "Mark as resigned"],
        ]
      : status === "resigned"
        ? [["reinstate", "Reinstate"]]
        : [
            ["lapse", "Mark as lapsed"],
            ["resign", "Mark as resigned"],
          ];
  if (state.message) return <Feedback state={state} />;
  return (
    <form key={state.n ?? 0} action={action} className={ui.form} style={{ gap: 12 }}>
      <Feedback state={state} />
      <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
        <legend className="sr-only">Status change</legend>
        <div className={s.choice} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
          {options.map(([value, label]) => (
            <label key={value}>
              <input type="radio" name="action" value={value} defaultChecked={state.values?.action === value} /> {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className={ui.field}>
        <label htmlFor="status-reason" className={ui.label}>
          Reason <span className={ui.hint}>(kept in the member&apos;s history)</span>
        </label>
        <textarea id="status-reason" name="reason" rows={2} defaultValue={state.values?.reason ?? ""} />
      </div>
      <button type="submit" className={s.btn} disabled={pending}>
        {pending ? "Saving…" : "Change status"}
      </button>
    </form>
  );
}

export type TypeOption = { id: string; name: string; feeLabel: string };

/** UPG-01/02: raise a change of membership type, showing current and new fee. */
export function UpgradeRequestForm(props: {
  memberId: string;
  currentTypeId: string;
  currentFeeLabel: string;
  types: TypeOption[];
  today: string;
}) {
  // Each submission remounts the fields (key), so they show what was submitted after a
  // validation error instead of being reset by the browser.
  const [state, action, pending] = useCountedAction(requestUpgrade.bind(null, props.memberId));
  const [open, setOpen] = useState(false);
  const choices = props.types.filter((t) => t.id !== props.currentTypeId);
  if (state.message) return <Feedback state={state} />;
  if (!open)
    return (
      <div className={s.rowActions}>
        <button type="button" className={s.btn} onClick={() => setOpen(true)} disabled={!choices.length}>
          Change membership type
        </button>
        {!choices.length ? <span className={s.note}>No other membership type is available.</span> : null}
      </div>
    );
  return (
    <form key={state.n ?? 0} action={action} className={ui.form} style={{ gap: 12 }}>
      <Feedback state={state} />
      <UpgradeFields {...props} choices={choices} state={state} />
      <p className={s.note} style={{ margin: 0 }}>
        The request goes to the Approvers by email. Someone other than you must approve it.
      </p>
      <div className={s.rowActions}>
        <button type="submit" className={s.btnPrimary} disabled={pending}>
          {pending ? "Sending…" : "Send for approval"}
        </button>
        <button type="button" className={s.btn} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function UpgradeFields({
  types,
  choices,
  currentFeeLabel,
  today,
  state,
}: {
  types: TypeOption[];
  choices: TypeOption[];
  currentFeeLabel: string;
  today: string;
  state: FormState;
}) {
  const [toTypeId, setToTypeId] = useState(state.values?.toTypeId ?? "");
  const target = types.find((t) => t.id === toTypeId);
  return (
    <>
      <div className={ui.field}>
        <label htmlFor="toTypeId" className={ui.label}>
          New membership type
        </label>
        <select id="toTypeId" name="toTypeId" defaultValue={toTypeId} onChange={(e) => setToTypeId(e.target.value)}>
          <option value="">Choose…</option>
          {choices.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <FieldError state={state} name="toTypeId" />
      </div>
      <dl className={s.dl} style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        <div>
          <dt>Current fee</dt>
          <dd>{currentFeeLabel}</dd>
        </div>
        <div>
          <dt>New fee</dt>
          <dd>
            <strong>{target ? target.feeLabel : "—"}</strong>
          </dd>
        </div>
      </dl>
      <div className={ui.field}>
        <label htmlFor="effectiveDate" className={ui.label}>
          Effective from
        </label>
        <input id="effectiveDate" name="effectiveDate" type="date" defaultValue={state.values?.effectiveDate ?? today} />
        <FieldError state={state} name="effectiveDate" />
      </div>
      <div className={ui.field}>
        <label htmlFor="upgrade-reason" className={ui.label}>
          Reason
        </label>
        <textarea id="upgrade-reason" name="reason" rows={2} defaultValue={state.values?.reason ?? ""} />
        <FieldError state={state} name="reason" />
      </div>
    </>
  );
}

/** UPG-04/05: approve or reject; comment required to reject. */
export function UpgradeDecisionForm({ requestId }: { requestId: string }) {
  const [state, action, pending] = useCountedAction(decideUpgrade.bind(null, requestId));
  if (state.message) return <Feedback state={state} />;
  return (
    <form key={state.n ?? 0} action={action} className={ui.form} style={{ gap: 12 }}>
      <Feedback state={state} />
      <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
        <legend className="sr-only">Decision</legend>
        <div className={s.choice} style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
          <label>
            <input type="radio" name="decision" value="approve" defaultChecked={state.values?.decision === "approve"} /> Approve
          </label>
          <label>
            <input type="radio" name="decision" value="reject" defaultChecked={state.values?.decision === "reject"} /> Reject
          </label>
        </div>
      </fieldset>
      <div className={ui.field}>
        <label htmlFor="upgrade-comment" className={ui.label}>
          Comment <span className={ui.hint}>(required to reject; sent to the requester)</span>
        </label>
        <textarea id="upgrade-comment" name="comment" rows={2} defaultValue={state.values?.comment ?? ""} />
      </div>
      <button type="submit" className={s.btnPrimary} disabled={pending}>
        {pending ? "Saving…" : "Confirm decision"}
      </button>
    </form>
  );
}
