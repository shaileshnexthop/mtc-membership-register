"use client";

import { useActionState, useState } from "react";
import { addHoliday, deleteHoliday, saveMembershipType, savePaymentSettings, saveRetentionSettings } from "@/app/actions/settings";
import type { FormState } from "@/app/actions/auth";
import ui from "./ui.module.css";
import s from "./staff.module.css";

type Counted = FormState & { n?: number };
function useCountedAction(fn: (prev: FormState, fd: FormData) => Promise<FormState>) {
  return useActionState(
    async (prev: Counted, fd: FormData): Promise<Counted> => ({ ...(await fn(prev, fd)), n: (prev.n ?? 0) + 1 }),
    {} as Counted,
  );
}

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

const err = (state: FormState, k: string) =>
  state.fieldErrors?.[k] ? <span className={ui.fieldError}>{state.fieldErrors[k]}</span> : null;

export type TypeValues = {
  id: string | null;
  code: string;
  name: string;
  description: string;
  fee: string;
  feePeriod: string;
  conditionsText: string;
  sortOrder: string;
  active: boolean;
};

/** ADM-01: one membership type, edited in place (or a new one). */
export function MembershipTypeForm({ initial, canEdit }: { initial: TypeValues; canEdit: boolean }) {
  const [state, action, pending] = useCountedAction(saveMembershipType.bind(null, initial.id));
  const [open, setOpen] = useState(false);
  if (!canEdit) return null;
  if (!open)
    return (
      <div className={s.rowActions} style={{ flexDirection: "column", alignItems: "flex-start" }}>
        {state.message ? <Feedback state={state} /> : null}
        <button type="button" className={initial.id ? s.btn : s.btnPrimary} onClick={() => setOpen(true)}>
          {initial.id ? "Edit" : "Add a membership type"}
        </button>
      </div>
    );
  const v = (k: keyof TypeValues) => String(state.values?.[k] ?? initial[k] ?? "");
  const p = initial.id ?? "new";
  return (
    <form key={state.n ?? 0} action={action} className={ui.form} style={{ gap: 12 }}>
      <Feedback state={state} />
      {!initial.id ? (
        <div className={ui.field}>
          <label htmlFor={`code-${p}`} className={ui.label}>
            Code <span className={ui.hint}>(internal, cannot be changed later)</span>
          </label>
          <input id={`code-${p}`} name="code" defaultValue={v("code")} placeholder="TITULAIRE" />
          {err(state, "code")}
        </div>
      ) : null}
      <div className={ui.field}>
        <label htmlFor={`name-${p}`} className={ui.label}>
          Name <span className={ui.hint}>(shown to applicants and members, in French)</span>
        </label>
        <input id={`name-${p}`} name="name" defaultValue={v("name")} />
        {err(state, "name")}
      </div>
      <div className={ui.field}>
        <label htmlFor={`desc-${p}`} className={ui.label}>
          Description <span className={ui.hint}>(staff only)</span>
        </label>
        <input id={`desc-${p}`} name="description" defaultValue={v("description")} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <div className={ui.field}>
          <label htmlFor={`fee-${p}`} className={ui.label}>
            Fee (Rs)
          </label>
          <input id={`fee-${p}`} name="fee" inputMode="decimal" defaultValue={v("fee")} />
          {err(state, "fee")}
        </div>
        <div className={ui.field}>
          <label htmlFor={`period-${p}`} className={ui.label}>
            Charged
          </label>
          <select id={`period-${p}`} name="feePeriod" defaultValue={v("feePeriod") || "monthly"}>
            <option value="monthly">Monthly</option>
            <option value="annual">Annually</option>
          </select>
          {err(state, "feePeriod")}
        </div>
        <div className={ui.field}>
          <label htmlFor={`order-${p}`} className={ui.label}>
            Display order
          </label>
          <input id={`order-${p}`} name="sortOrder" inputMode="numeric" defaultValue={v("sortOrder")} />
          {err(state, "sortOrder")}
        </div>
      </div>
      <div className={ui.field}>
        <label htmlFor={`cond-${p}`} className={ui.label}>
          Conditions of membership <span className={ui.hint}>(in French; included in the approval email)</span>
        </label>
        <textarea id={`cond-${p}`} name="conditionsText" rows={3} defaultValue={v("conditionsText")} />
      </div>
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="checkbox"
          name="active"
          defaultChecked={state.values ? state.values.active === "on" : initial.active}
          style={{ width: 18, height: 18 }}
        />
        Available for new applications and changes of type
      </label>
      <div className={s.rowActions}>
        <button type="submit" className={s.btnPrimary} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" className={s.btn} onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
    </form>
  );
}

const PAYMENT_FIELDS: { key: string; label: string; hint: string }[] = [
  { key: "payment_deadline_business_days", label: "Joining fee deadline", hint: "business days after approval" },
  { key: "payment_reminder_business_days", label: "Joining fee reminders", hint: "business days after approval, e.g. 2, 3" },
  { key: "upgrade_reminder_business_days", label: "Remind Approvers after", hint: "business days without a decision" },
  { key: "renewal_reminder_days_before", label: "Renewal reminders", hint: "days before the due date, e.g. 14, 7, 0" },
  { key: "renewal_grace_days", label: "Grace period before lapsing", hint: "days after an unpaid due date" },
  { key: "payment_bank_name", label: "Bank (Institution bancaire)", hint: "" },
  { key: "payment_bank_holder", label: "Account holder (Titulaire du compte)", hint: "" },
  { key: "payment_bank_account", label: "Account number (Numéro de compte)", hint: "" },
];

const RETENTION_FIELDS: { key: string; label: string; hint: string }[] = [
  { key: "application_close_after_days", label: "Close deferred and rejected applications after", hint: "days after the decision" },
  { key: "application_close_warning_days", label: "Warn the applicant", hint: "days before closing a deferred one; 0 = no warning" },
  { key: "application_delete_after_days", label: "Delete closed applications after", hint: "days after closing, with the KYC documents" },
  { key: "application_record_retention_months", label: "Keep name, outcome and reason in Reports for", hint: "months after deletion; at least 18" },
];

type Fields = { key: string; label: string; hint: string }[];

/** ADM-03: deadlines, reminder intervals and bank details. */
export function PaymentSettingsForm({ initial, canEdit }: { initial: Record<string, string>; canEdit: boolean }) {
  return <KeyedSettingsForm fields={PAYMENT_FIELDS} fn={savePaymentSettings} initial={initial} canEdit={canEdit} />;
}

/** ADM-06: closing and deleting applications that go nowhere. */
export function RetentionSettingsForm({ initial, canEdit }: { initial: Record<string, string>; canEdit: boolean }) {
  return <KeyedSettingsForm fields={RETENTION_FIELDS} fn={saveRetentionSettings} initial={initial} canEdit={canEdit} />;
}

function KeyedSettingsForm({
  fields,
  fn,
  initial,
  canEdit,
}: {
  fields: Fields;
  fn: (prev: FormState, fd: FormData) => Promise<FormState>;
  initial: Record<string, string>;
  canEdit: boolean;
}) {
  const [state, action, pending] = useCountedAction(fn);
  return (
    <form key={state.n ?? 0} action={action} className={ui.form} style={{ gap: 14 }}>
      <Feedback state={state} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
        {fields.map((f) => (
          <div key={f.key} className={ui.field}>
            <label htmlFor={f.key} className={ui.label}>
              {f.label} {f.hint ? <span className={ui.hint}>({f.hint})</span> : null}
            </label>
            <input
              id={f.key}
              name={f.key}
              defaultValue={state.values?.[f.key] ?? initial[f.key] ?? ""}
              readOnly={!canEdit}
              aria-invalid={Boolean(state.fieldErrors?.[f.key])}
            />
            {err(state, f.key)}
          </div>
        ))}
      </div>
      {canEdit ? (
        <div className={s.rowActions}>
          <button type="submit" className={s.btnPrimary} disabled={pending}>
            {pending ? "Saving…" : "Save settings"}
          </button>
        </div>
      ) : (
        <p className={s.note} style={{ margin: 0 }}>
          Only the Administrator can change these settings.
        </p>
      )}
    </form>
  );
}

/** ADM-02: add a public holiday. */
export function HolidayForm() {
  const [state, action, pending] = useCountedAction(addHoliday);
  return (
    <form key={state.n ?? 0} action={action} className={ui.form} style={{ gap: 12 }}>
      <Feedback state={state} />
      <div style={{ display: "grid", gridTemplateColumns: "minmax(160px, 200px) minmax(200px, 1fr) auto", gap: 12, alignItems: "end" }}>
        <div className={ui.field}>
          <label htmlFor="hol-day" className={ui.label}>
            Date
          </label>
          <input id="hol-day" name="day" type="date" defaultValue={state.values?.day ?? ""} />
          {err(state, "day")}
        </div>
        <div className={ui.field}>
          <label htmlFor="hol-name" className={ui.label}>
            Holiday
          </label>
          <input id="hol-name" name="name" defaultValue={state.values?.name ?? ""} placeholder="e.g. Divali" />
          {err(state, "name")}
        </div>
        <button type="submit" className={s.btnPrimary} disabled={pending} style={{ minHeight: 44 }}>
          Add holiday
        </button>
      </div>
    </form>
  );
}

export function HolidayDeleteButton({ day }: { day: string }) {
  const [state, action, pending] = useActionState(deleteHoliday.bind(null, day), {});
  if (state.message) return <span className={s.note}>Removed</span>;
  return (
    <form action={action}>
      <button type="submit" className={s.btn} style={{ minHeight: 32, fontSize: 12 }} disabled={pending} aria-label={`Remove holiday ${day}`}>
        Remove
      </button>
    </form>
  );
}
