"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import {
  answerSponsorship,
  savePersonal,
  saveSponsors,
  submitApplication,
} from "@/app/actions/application";
import type { FormState } from "@/app/actions/auth";
import ui from "./ui.module.css";
import s from "./application.module.css";

type Values = Record<string, string>;

function Alerts({ state }: { state: FormState }) {
  return (
    <>
      {state.error ? (
        <div role="alert" className={ui.alertError}>
          {state.error}
        </div>
      ) : null}
      {state.message ? (
        <div role="status" className={ui.alertOk}>
          {state.message}
        </div>
      ) : null}
    </>
  );
}

function Input({
  name,
  label,
  values,
  state,
  type = "text",
  required = false,
  hint,
  className,
  autoComplete,
  list,
  multiline = false,
}: {
  name: string;
  label: string;
  values: Values;
  state: FormState;
  type?: string;
  required?: boolean;
  hint?: string;
  className?: string;
  autoComplete?: string;
  list?: string;
  multiline?: boolean;
}) {
  const error = state.fieldErrors?.[name];
  const value = state.values?.[name] ?? values[name] ?? "";
  const describedBy = [hint ? `${name}-hint` : "", error ? `${name}-error` : ""].join(" ").trim() || undefined;
  return (
    <div className={`${ui.field} ${className ?? ""}`}>
      <label htmlFor={name} className={ui.label}>
        {label} {required ? <span className={ui.req}>*</span> : null}
      </label>
      {hint ? (
        <span id={`${name}-hint`} className={ui.hint}>
          {hint}
        </span>
      ) : null}
      {multiline ? (
        <textarea
          id={name}
          name={name}
          rows={2}
          defaultValue={value}
          autoComplete={autoComplete}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={error ? ui.inputError : undefined}
        />
      ) : (
        <input
          id={name}
          name={name}
          type={type}
          defaultValue={value}
          autoComplete={autoComplete}
          list={list}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={error ? ui.inputError : undefined}
        />
      )}
      {error ? (
        <span id={`${name}-error`} className={ui.fieldError}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

function StepActions({
  back,
  pending,
  nextLabel = "Enregistrer et continuer",
}: {
  back?: string;
  pending: boolean;
  nextLabel?: string;
}) {
  return (
    <div className={s.actions}>
      <div>
        {back ? (
          <Link href={back} className={ui.secondary}>
            Précédent
          </Link>
        ) : null}
      </div>
      <div className={s.actionsRight}>
        <button type="submit" name="intent" value="draft" className={ui.secondary} disabled={pending}>
          Enregistrer le brouillon
        </button>
        <button type="submit" name="intent" value="continue" className={ui.primary} disabled={pending}>
          {pending ? "Enregistrement…" : nextLabel}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step 1                                                               */
/* ------------------------------------------------------------------ */

export function PersonalForm({
  values,
  types,
  email,
}: {
  values: Values;
  types: { id: string; name: string; fee: string }[];
  email: string;
}) {
  const [state, action, pending] = useActionState(savePersonal, {});
  const typeValue = state.values?.membershipTypeId ?? values.membershipTypeId ?? "";
  const typeError = state.fieldErrors?.membershipTypeId;
  const selected = types.find((t) => t.id === typeValue);
  return (
    <form action={action} className={ui.form} noValidate>
      <Alerts state={state} />

      <div className={s.section}>
        <h2 className={s.sectionTitle}>Type d’adhésion</h2>
        <div className={s.grid2}>
          <div className={ui.field}>
            <label htmlFor="membershipTypeId" className={ui.label}>
              Type d’adhésion demandé <span className={ui.req}>*</span>
            </label>
            <select
              id="membershipTypeId"
              name="membershipTypeId"
              defaultValue={typeValue}
              aria-invalid={typeError ? true : undefined}
            >
              <option value="">Choisir…</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {typeError ? <span className={ui.fieldError}>{typeError}</span> : null}
          </div>
          <div className={ui.alertInfo}>
            <strong>Cotisation : {selected?.fee ?? "selon le type choisi"}</strong>
            <br />
            Les conditions d’adhésion et le lien de paiement vous seront envoyés par courriel après
            approbation.
          </div>
        </div>
      </div>

      <div className={s.section}>
        <h2 className={s.sectionTitle}>I. Informations personnelles</h2>
        <div className={s.grid2}>
          <Input name="lastName" label="Nom" required values={values} state={state} autoComplete="family-name" />
          <Input name="firstNames" label="Prénoms" required values={values} state={state} autoComplete="given-name" />
          <Input name="dateOfBirth" label="Date de naissance" type="date" required values={values} state={state} autoComplete="bday" />
          <Input name="nationality" label="Nationalité" required values={values} state={state} list="nationalities" />
          <datalist id="nationalities">
            <option value="Mauricienne" />
            <option value="Française" />
            <option value="Sud-africaine" />
            <option value="Britannique" />
            <option value="Indienne" />
          </datalist>
          <Input
            name="idNumber"
            label="Carte d’Identité Nationale / Passeport No"
            required
            values={values}
            state={state}
          />
          <div className={ui.field}>
            <span className={ui.label}>Adresse courriel</span>
            <span className={s.readonly}>{email}</span>
          </div>
          <Input
            name="residentialAddress"
            label="Adresse résidentielle"
            required
            multiline
            className={s.span2}
            values={values}
            state={state}
            autoComplete="street-address"
          />
          <Input name="mobilePhone" label="Téléphone portable" type="tel" required values={values} state={state} autoComplete="tel" />
          <Input name="homePhone" label="Téléphone domicile (facultatif)" type="tel" values={values} state={state} />
        </div>
      </div>

      <div className={s.section}>
        <h2 className={s.sectionTitle}>II. Emploi / Activité professionnelle</h2>
        <div className={s.grid2}>
          <Input name="profession" label="Profession / Occupation" required values={values} state={state} autoComplete="organization-title" />
          <Input name="employerName" label="Nom de l’employeur / société" values={values} state={state} autoComplete="organization" />
          <Input name="workAddress" label="Adresse professionnelle" className={s.span2} values={values} state={state} />
        </div>
      </div>

      <StepActions pending={pending} />
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Step 2                                                               */
/* ------------------------------------------------------------------ */

export function SponsorsForm({
  values,
  statuses,
  minSponsors,
}: {
  values: Values;
  statuses: Record<number, string | undefined>;
  minSponsors: number;
}) {
  const [state, action, pending] = useActionState(saveSponsors, {});
  return (
    <form action={action} className={ui.form} noValidate>
      <Alerts state={state} />
      <div className={s.section}>
        <h2 className={s.sectionTitle}>III. Parrainage</h2>
        <p style={{ margin: 0 }}>Aspirant Membre parrainé par :</p>
        <p className={ui.alertInfo} style={{ margin: 0 }}>
          Chaque parrain recevra un courriel l’invitant à confirmer son parrainage en ligne, après
          la soumission de votre candidature. Cette confirmation électronique remplace la signature
          manuscrite. Au moins {minSponsors} parrain{minSponsors > 1 ? "s" : ""} requis.
        </p>
        {[1, 2, 3].map((n) => (
          <fieldset key={n} className={s.box} style={{ margin: 0 }}>
            <legend className={`${s.badge}`} style={{ float: "left" }}>
              <span className="sr-only">Parrain </span>
              {n}
            </legend>
            <div className={s.grow}>
              {statuses[n] ? <span className={ui.hint}>{statuses[n]}</span> : null}
              <div className={s.grid4}>
                <Input name={`s${n}_lastName`} label="Nom" values={values} state={state} />
                <Input name={`s${n}_firstNames`} label="Prénom(s)" values={values} state={state} />
                <Input name={`s${n}_phone`} label="Téléphone" type="tel" values={values} state={state} />
                <Input name={`s${n}_email`} label="Adresse courriel" type="email" values={values} state={state} />
              </div>
            </div>
          </fieldset>
        ))}
      </div>
      <StepActions back="/candidature/informations" pending={pending} />
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Step 3                                                               */
/* ------------------------------------------------------------------ */

export type DocRow = {
  kind: string;
  letter: string;
  label: string;
  rule: string;
  required: boolean;
  askDate: boolean;
  current?: { id: string; filename: string; sizeLabel: string; documentDate: string | null };
  warning?: string;
};

function DocumentUpload({ row }: { row: DocRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOk(false);
    const form = e.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError("Choisissez un fichier.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Le fichier dépasse 10 Mo.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/documents", { method: "POST", body: data });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "L’envoi a échoué. Veuillez réessayer.");
      } else {
        form.reset();
        setOk(true);
        router.refresh();
      }
    } catch {
      setError("L’envoi a échoué. Vérifiez votre connexion et réessayez.");
    } finally {
      setBusy(false);
    }
  }

  const has = !!row.current;
  const pill = has
    ? row.warning
      ? [s.pillWarn, "À remplacer"]
      : [s.pillOk, "Déposé"]
    : row.required
      ? [s.pillBad, "Requis"]
      : [s.pillMuted, "Sur demande"];

  return (
    <div className={s.box}>
      <span className={`${s.badge} ${s.badgeMuted}`} aria-hidden="true">
        {row.letter}
      </span>
      <div className={s.grow}>
        <div className={s.docTitle}>
          <span>
            ({row.letter}) {row.label}
          </span>
          <span className={`${s.pill} ${pill[0]}`}>{pill[1]}</span>
        </div>
        <span className={s.small}>{row.rule} PDF, JPG ou PNG, 10 Mo maximum.</span>
        {row.current ? (
          <span style={{ fontSize: 14 }}>
            <a href={`/api/documents/${row.current.id}`} target="_blank" rel="noopener noreferrer">
              {row.current.filename}
            </a>{" "}
            · {row.current.sizeLabel}
            {row.current.documentDate ? ` · date du document : ${row.current.documentDate}` : ""}
          </span>
        ) : null}
        {row.warning ? <span className={s.warnText}>{row.warning}</span> : null}
        <form onSubmit={onSubmit} className={s.uploadRow}>
          <input type="hidden" name="kind" value={row.kind} />
          <div className={ui.field}>
            <label htmlFor={`file-${row.kind}`} className={ui.label}>
              {has ? "Remplacer le fichier" : "Choisir un fichier"}
            </label>
            <input id={`file-${row.kind}`} name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" />
          </div>
          {row.askDate ? (
            <div className={ui.field}>
              <label htmlFor={`date-${row.kind}`} className={ui.label}>
                Date du document
              </label>
              <input id={`date-${row.kind}`} name="documentDate" type="date" style={{ width: 180 }} />
            </div>
          ) : null}
          <button type="submit" className={ui.secondary} disabled={busy}>
            {busy ? "Envoi…" : "Envoyer"}
          </button>
        </form>
        {error ? (
          <span role="alert" className={ui.fieldError}>
            {error}
          </span>
        ) : null}
        {ok ? (
          <span role="status" className={s.small} style={{ color: "var(--ok)", fontWeight: 600 }}>
            Document enregistré.
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function DocumentsPanel({ rows, missing }: { rows: DocRow[]; missing: string[] }) {
  return (
    <div className={ui.form}>
      <div className={s.section}>
        <h2 className={s.sectionTitle}>Documents à soumettre</h2>
        <p className={s.small} style={{ margin: 0 }}>
          Le candidat devra soumettre les documents suivants. Ils sont conservés de façon chiffrée et
          consultés uniquement par l’équipe de conformité du Club.
        </p>
        {rows.map((row) => (
          <DocumentUpload key={row.kind} row={row} />
        ))}
      </div>
      <div className={s.actions}>
        <Link href="/candidature/parrainage" className={ui.secondary}>
          Précédent
        </Link>
        <div className={s.actionsRight}>
          {missing.length ? <span className={s.small}>À déposer : {missing.join(", ")}</span> : null}
          <Link href="/candidature/declarations" className={ui.primary}>
            Continuer
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step 4                                                               */
/* ------------------------------------------------------------------ */

export function DeclarationsForm({
  missing,
  today,
  defaultName,
}: {
  missing: string[];
  today: string;
  defaultName: string;
}) {
  const [state, action, pending] = useActionState(submitApplication, {});
  const [signer, setSigner] = useState(state.values?.signatureName ?? "");
  const [place, setPlace] = useState("");
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const fe = state.fieldErrors ?? {};
  const check = (name: string, children: React.ReactNode) => (
    <div className={ui.field}>
      <label className={s.check}>
        <input
          type="checkbox"
          name={name}
          checked={!!checks[name]}
          onChange={(e) => setChecks((c) => ({ ...c, [name]: e.target.checked }))}
          aria-invalid={fe[name] ? true : undefined}
        />
        <span>{children}</span>
      </label>
      {fe[name] ? <span className={ui.fieldError}>{fe[name]}</span> : null}
    </div>
  );
  return (
    <form action={action} className={ui.form} noValidate>
      <Alerts state={state} />
      {missing.length ? (
        <div className={ui.alertError}>
          Avant de soumettre, complétez : {missing.join(", ")}.
        </div>
      ) : null}

      <div className={s.section}>
        <h2 className={s.sectionTitle}>IV. Déclaration du candidat</h2>
        <div className={ui.field}>
          <label htmlFor="signatureName" className={ui.label}>
            Je soussigné(e) <span className={ui.req}>*</span>
          </label>
          <input
            id="signatureName"
            name="signatureName"
            type="text"
            placeholder={defaultName || "Nom et prénoms complets"}
            value={signer}
            onChange={(e) => setSigner(e.target.value)}
            aria-invalid={fe.signatureName ? true : undefined}
            style={{ maxWidth: 480 }}
          />
          {fe.signatureName ? <span className={ui.fieldError}>{fe.signatureName}</span> : null}
        </div>
        {check("declAccurate", <>certifie que les informations et documents fournis dans le cadre de la présente candidature sont exacts et complets.</>)}
        {check("declNoRight", <>Je reconnais que le dépôt du présent formulaire ne constitue ni une admission, ni un droit à devenir membre du Mauritius Turf Club.</>)}
        {check("declDiscretion", <>Je reconnais également que toute candidature demeure soumise à l’approbation discrétionnaire des Administrateurs conformément aux Statuts du Club.</>)}
      </div>

      <div className={s.section}>
        <h2 className={s.sectionTitle}>V. Protection des données personnelles</h2>
        <div className={s.textBox} tabIndex={0} aria-label="Notice de protection des données personnelles">
          <p style={{ marginTop: 0 }}>
            Les informations et documents fournis dans le cadre de la présente candidature sont
            collectés et traités par le Mauritius Turf Club (le « Club »), agissant en qualité de Data
            Controller, aux fins de traitement de la candidature, de vérifications administratives, de
            conformité, de sécurité et de gouvernance interne.
          </p>
          <p>
            Le Club pourra être amené à traiter et vérifier les informations transmises, ainsi qu’à
            solliciter tout document complémentaire jugé nécessaire.
          </p>
          <p>Les données personnelles seront traitées conformément à la Data Protection Act 2017.</p>
          <p style={{ marginBottom: 0 }}>
            Pour toute question relative au traitement des données personnelles, le candidat peut
            contacter : compliance@mtcjockeyclub.com.
          </p>
        </div>
        {check("dataProtection", <>J’ai lu et compris la notice de protection des données personnelles.</>)}
      </div>

      <div className={s.section}>
        <h2 className={s.sectionTitle}>VI. Conformité / AML-CFT</h2>
        <div className={s.textBox} tabIndex={0} aria-label="Conformité AML-CFT">
          <p style={{ marginTop: 0 }}>
            Le candidat reconnaît que le Club peut procéder à toute vérification jugée nécessaire dans
            le cadre de l’examen de sa candidature, incluant notamment des vérifications d’identité, de
            conformité, d’intégrité et de réputation.
          </p>
          <p style={{ marginBottom: 0 }}>
            Le Club se réserve le droit de demander tout document ou information complémentaire et de
            ne pas donner suite à une candidature conformément à ses Statuts et politiques internes.
          </p>
        </div>
        {check("aml", <>Je reconnais et j’accepte ces vérifications de conformité.</>)}
      </div>

      <div className={s.section}>
        <h2 className={s.sectionTitle}>VII. Déclaration et signature</h2>
        <div className={s.grid2}>
          <div className={ui.field}>
            <label htmlFor="signaturePlace" className={ui.label}>
              Fait à <span className={ui.req}>*</span>
            </label>
            <input
              id="signaturePlace"
              name="signaturePlace"
              type="text"
              placeholder="ex. Port Louis"
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              aria-invalid={fe.signaturePlace ? true : undefined}
            />
            {fe.signaturePlace ? <span className={ui.fieldError}>{fe.signaturePlace}</span> : null}
          </div>
          <div className={ui.field}>
            <span className={ui.label}>Le</span>
            <span className={s.readonly}>{today}</span>
          </div>
          <div className={`${ui.field} ${s.span2}`}>
            <span className={ui.label}>Signature électronique</span>
            <div className={s.signature} aria-live="polite">
              {signer || <span className={s.small}>Votre nom apparaîtra ici</span>}
            </div>
            <span className={ui.hint}>
              En soumettant, votre nom saisi vaut signature électronique. La date, l’heure et
              l’adresse IP de la soumission sont enregistrées.
            </span>
          </div>
        </div>
      </div>

      <div className={s.actions}>
        <Link href="/candidature/documents" className={ui.secondary}>
          Précédent
        </Link>
        <button type="submit" className={ui.primary} disabled={pending || missing.length > 0}>
          {pending ? "Soumission…" : "Soumettre la candidature"}
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Sponsor answer page                                                   */
/* ------------------------------------------------------------------ */

export function SponsorAnswerForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(answerSponsorship, {});
  if (state.message) {
    return (
      <div role="status" className={ui.alertOk}>
        {state.message}
      </div>
    );
  }
  return (
    <form action={action} className={ui.form}>
      <Alerts state={state} />
      <input type="hidden" name="token" value={token} />
      <div className={s.actionsRight}>
        <button type="submit" name="answer" value="confirm" className={ui.primary} disabled={pending}>
          Je confirme mon parrainage
        </button>
        <button type="submit" name="answer" value="decline" className={ui.secondary} disabled={pending}>
          Je décline
        </button>
      </div>
    </form>
  );
}
