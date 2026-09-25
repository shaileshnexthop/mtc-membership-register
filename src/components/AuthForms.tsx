"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  login,
  register,
  requestPasswordReset,
  resendVerification,
  resetPassword,
  verifyEmail,
  type FormState,
} from "@/app/actions/auth";
import s from "./ui.module.css";

const initial: FormState = {};

function Field({
  id,
  label,
  type = "text",
  autoComplete,
  required = true,
  hint,
  state,
}: {
  id: string;
  label: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  hint?: string;
  state: FormState;
}) {
  const error = state.fieldErrors?.[id];
  return (
    <div className={s.field}>
      <label htmlFor={id} className={s.label}>
        {label} {required ? <span className={s.req}>*</span> : null}
      </label>
      {hint ? (
        <span id={`${id}-hint`} className={s.hint}>
          {hint}
        </span>
      ) : null}
      <input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        required={required}
        defaultValue={type === "password" ? undefined : state.values?.[id]}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hint ? `${id}-hint` : "", error ? `${id}-error` : ""].join(" ").trim() || undefined}
        className={error ? s.inputError : undefined}
      />
      {error ? (
        <span id={`${id}-error`} className={s.fieldError}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

function Alerts({ state }: { state: FormState }) {
  return (
    <>
      {state.error ? (
        <div role="alert" className={s.alertError}>
          {state.error}
        </div>
      ) : null}
      {state.message ? (
        <div role="status" className={s.alertOk}>
          {state.message}
        </div>
      ) : null}
    </>
  );
}

export function RegisterForm() {
  const [state, action, pending] = useActionState(register, initial);
  return (
    <form action={action} className={s.form} noValidate>
      <Alerts state={state} />
      <Field id="lastName" label="Nom" autoComplete="family-name" state={state} />
      <Field id="firstNames" label="Prénoms" autoComplete="given-name" state={state} />
      <Field id="email" label="Adresse courriel" type="email" autoComplete="email" state={state} />
      <Field
        id="mobilePhone"
        label="Téléphone portable"
        type="tel"
        autoComplete="tel"
        hint="ex. +230 5XXX XXXX"
        state={state}
      />
      <Field
        id="password"
        label="Mot de passe"
        type="password"
        autoComplete="new-password"
        hint="Au moins 12 caractères. Une phrase de passe est idéale."
        state={state}
      />
      <Field
        id="passwordConfirm"
        label="Confirmer le mot de passe"
        type="password"
        autoComplete="new-password"
        state={state}
      />
      <button type="submit" className={s.primary} disabled={pending}>
        {pending ? "Création en cours…" : "Créer mon compte"}
      </button>
    </form>
  );
}

export function ResendVerificationForm({ email }: { email?: string }) {
  const [state, action, pending] = useActionState(resendVerification, {
    values: { email: email ?? "" },
  });
  return (
    <form action={action} className={s.form}>
      <Alerts state={state} />
      <Field id="email" label="Adresse courriel" type="email" autoComplete="email" state={state} />
      <button type="submit" className={s.secondary} disabled={pending}>
        {pending ? "Envoi…" : "Renvoyer le lien de confirmation"}
      </button>
    </form>
  );
}

export function VerifyEmailForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(verifyEmail, initial);
  return (
    <>
      <form action={action} className={s.form}>
        <Alerts state={state} />
        <input type="hidden" name="token" value={token} />
        <button type="submit" className={s.primary} disabled={pending || !!state.error}>
          {pending ? "Activation…" : "Activer mon compte"}
        </button>
      </form>
      {state.error ? (
        <>
          <hr className={s.divider} />
          <ResendVerificationForm />
        </>
      ) : null}
    </>
  );
}

export function LoginForm() {
  const [state, action, pending] = useActionState(login, initial);
  return (
    <form action={action} className={s.form} noValidate>
      <Alerts state={state} />
      <Field id="email" label="Adresse courriel" type="email" autoComplete="email" state={state} />
      <Field id="password" label="Mot de passe" type="password" autoComplete="current-password" state={state} />
      <button type="submit" className={s.primary} disabled={pending}>
        {pending ? "Connexion…" : "Se connecter"}
      </button>
      <div className={s.links}>
        <Link href="/mot-de-passe-oublie">Mot de passe oublié ?</Link>
        <Link href="/inscription">Créer un compte</Link>
      </div>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, initial);
  return (
    <form action={action} className={s.form} noValidate>
      <Alerts state={state} />
      <Field id="email" label="Adresse courriel" type="email" autoComplete="email" state={state} />
      <button type="submit" className={s.primary} disabled={pending}>
        {pending ? "Envoi…" : "Recevoir un lien"}
      </button>
      <div className={s.links}>
        <Link href="/connexion">Retour à la connexion</Link>
      </div>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPassword, initial);
  return (
    <form action={action} className={s.form} noValidate>
      <Alerts state={state} />
      <input type="hidden" name="token" value={token} />
      <Field
        id="password"
        label="Nouveau mot de passe"
        type="password"
        autoComplete="new-password"
        hint="Au moins 12 caractères."
        state={state}
      />
      <Field
        id="passwordConfirm"
        label="Confirmer le mot de passe"
        type="password"
        autoComplete="new-password"
        state={state}
      />
      <button type="submit" className={s.primary} disabled={pending}>
        {pending ? "Enregistrement…" : "Enregistrer le mot de passe"}
      </button>
      {state.error ? (
        <div className={s.links}>
          <Link href="/mot-de-passe-oublie">Demander un nouveau lien</Link>
        </div>
      ) : null}
    </form>
  );
}
