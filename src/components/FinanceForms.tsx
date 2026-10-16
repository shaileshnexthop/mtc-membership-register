"use client";

import { useActionState, useState } from "react";
import { recordDuesPayment, refundPayment } from "@/app/actions/finance";
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

/** Finance: record a dues payment for one or more periods. */
export function DuesPaymentForm({
  memberId,
  feeCents,
  periodLabel,
  today,
  startLabel,
}: {
  memberId: string;
  feeCents: number;
  periodLabel: string; // "month" | "year"
  today: string;
  startLabel: string;
}) {
  const [state, action, pending] = useCountedAction(recordDuesPayment.bind(null, memberId));
  // The form closes after a successful entry, so a second click is needed for another one.
  const [openN, setOpenN] = useState<number | null>(null);
  const n = state.n ?? 0;
  const showForm = openN !== null && (n === openN || !state.message);
  if (!showForm)
    return (
      <div className={s.rowActions} style={{ flexDirection: "column", alignItems: "flex-start" }}>
        {state.message ? <Feedback state={state} /> : null}
        <button type="button" className={s.btn} onClick={() => setOpenN(n)}>
          Record a dues payment
        </button>
      </div>
    );
  return (
    <DuesFields
      key={n}
      state={n === openN ? {} : state}
      action={action}
      pending={pending}
      feeCents={feeCents}
      periodLabel={periodLabel}
      today={today}
      startLabel={startLabel}
      onClose={() => setOpenN(null)}
    />
  );
}

function DuesFields({
  state,
  action,
  pending,
  feeCents,
  periodLabel,
  today,
  startLabel,
  onClose,
}: {
  state: FormState;
  action: (fd: FormData) => void;
  pending: boolean;
  feeCents: number;
  periodLabel: string;
  today: string;
  startLabel: string;
  onClose: () => void;
}) {
  const v = state.values ?? {};
  const [periods, setPeriods] = useState(Number(v.periods ?? 1));
  const [amount, setAmount] = useState(v.amount ?? (feeCents > 0 ? (feeCents / 100).toFixed(2) : ""));
  return (
    <form action={action} className={ui.form} style={{ gap: 12 }}>
      <Feedback state={state} />
      <div className={ui.field}>
        <label htmlFor="dues-periods" className={ui.label}>
          Pays for
        </label>
        <select
          id="dues-periods"
          name="periods"
          value={periods}
          onChange={(e) => {
            const n = Number(e.target.value);
            setPeriods(n);
            if (feeCents > 0) setAmount(((feeCents * n) / 100).toFixed(2));
          }}
        >
          {[1, 2, 3, 4, 5, 6, 12].map((n) => (
            <option key={n} value={n}>
              {n} {periodLabel}
              {n > 1 ? "s" : ""}
            </option>
          ))}
        </select>
        <span className={ui.hint}>Starting {startLabel}</span>
        {err(state, "periods")}
      </div>
      <div className={ui.field}>
        <label htmlFor="dues-amount" className={ui.label}>
          Amount received (Rs)
        </label>
        <input id="dues-amount" name="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        {err(state, "amount")}
      </div>
      <div className={ui.field}>
        <label htmlFor="dues-paidOn" className={ui.label}>
          Date received
        </label>
        <input id="dues-paidOn" name="paidOn" type="date" defaultValue={v.paidOn ?? today} max={today} />
        {err(state, "paidOn")}
      </div>
      <div className={ui.field}>
        <label htmlFor="dues-method" className={ui.label}>
          Method
        </label>
        <select id="dues-method" name="method" defaultValue={v.method ?? "bank_transfer"}>
          <option value="bank_transfer">Bank transfer</option>
          <option value="cash">Cash</option>
          <option value="cheque">Cheque</option>
        </select>
        {err(state, "method")}
      </div>
      <div className={ui.field}>
        <label htmlFor="dues-reference" className={ui.label}>
          Reference <span className={ui.hint}>(bank or receipt reference)</span>
        </label>
        <input id="dues-reference" name="reference" defaultValue={v.reference ?? ""} />
        {err(state, "reference")}
      </div>
      <div className={s.rowActions}>
        <button type="submit" className={s.btnPrimary} disabled={pending}>
          {pending ? "Recording…" : "Record payment"}
        </button>
        <button type="button" className={s.btn} onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Finance: mark a payment as refunded, with a reason. */
export function RefundForm({ paymentId }: { paymentId: string }) {
  const [state, action, pending] = useActionState(refundPayment.bind(null, paymentId), {});
  const [open, setOpen] = useState(false);
  if (state.message) return <span className={s.note}>Refunded</span>;
  if (!open)
    return (
      <button type="button" className={s.btn} style={{ minHeight: 32, fontSize: 12 }} onClick={() => setOpen(true)}>
        Refund…
      </button>
    );
  return (
    <form action={action} className={s.rowActions} style={{ flexWrap: "nowrap" }}>
      <label className="sr-only" htmlFor={`refund-${paymentId}`}>
        Reason for the refund
      </label>
      <input id={`refund-${paymentId}`} name="reason" placeholder="Reason" style={{ minHeight: 32, maxWidth: 180 }} />
      <button type="submit" className={s.btnBad} style={{ minHeight: 32, fontSize: 12 }} disabled={pending}>
        Confirm
      </button>
      {state.error ? (
        <span role="alert" className={ui.fieldError}>
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
