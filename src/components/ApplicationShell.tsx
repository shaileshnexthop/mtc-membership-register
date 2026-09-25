import Link from "next/link";
import { redirect } from "next/navigation";
import { PublicShell } from "./PublicShell";
import { getCurrentAccount } from "@/lib/session";
import {
  checkCompleteness,
  getApplicationForAccount,
  isEditable,
  type Completeness,
} from "@/lib/applications";
import ui from "./ui.module.css";
import s from "./application.module.css";

export type StepKey = "informations" | "parrainage" | "documents" | "declarations";

const STEPS: { key: StepKey; title: string; sub: string; check: keyof Completeness }[] = [
  { key: "informations", title: "Informations personnelles", sub: "Sections I et II", check: "personal" },
  { key: "parrainage", title: "Parrainage", sub: "Section III", check: "sponsors" },
  { key: "documents", title: "Documents", sub: "Pièces (a) à (e)", check: "documents" },
  { key: "declarations", title: "Déclarations et signature", sub: "Sections IV à VII", check: "declarations" },
];

/** Loads the signed-in applicant's editable application, or redirects. */
export async function loadEditableApplication() {
  const account = await getCurrentAccount();
  if (!account) redirect("/connexion");
  const app = await getApplicationForAccount(account.id);
  if (!app) redirect("/candidature");
  if (!isEditable(app.status)) redirect("/candidature");
  const completeness = await checkCompleteness(app.id);
  return { account, app, completeness };
}

export function ApplicationShell({
  active,
  email,
  reference,
  completeness,
  deferred,
  children,
}: {
  active: StepKey;
  email: string;
  reference: string;
  completeness: Completeness;
  deferred: boolean;
  children: React.ReactNode;
}) {
  const index = STEPS.findIndex((st) => st.key === active);
  return (
    <PublicShell wide signedInAs={email}>
      <div className={s.layout}>
        <nav aria-label="Étapes de la candidature">
          <ol className={s.steps}>
            {STEPS.map((st, i) => {
              const isActive = st.key === active;
              const done = completeness[st.check].length === 0 && st.key !== "declarations";
              return (
                <li key={st.key}>
                  <Link
                    href={`/candidature/${st.key}`}
                    className={`${s.step} ${isActive ? s.stepActive : ""}`}
                    aria-current={isActive ? "step" : undefined}
                  >
                    <span
                      className={`${s.stepNum} ${isActive ? s.stepNumActive : done ? s.stepNumDone : ""}`}
                      aria-hidden="true"
                    >
                      {done && !isActive ? "✓" : i + 1}
                    </span>
                    <span className={s.stepText}>
                      {st.title}
                      <span className={s.stepSub}>{st.sub}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </nav>
        <div>
          <span className={s.eyebrow}>Étape {index + 1} sur 4</span>
          <h1 className={s.pageTitle}>Formulaire de candidature – Aspirant Membre Associé</h1>
          <p className={s.meta}>
            Référence {reference} · <Link href="/candidature">Vue d’ensemble</Link>
          </p>
          {deferred ? (
            <p className={ui.alertInfo} style={{ marginBottom: 20 }}>
              Votre candidature a été différée par le Club. Apportez les modifications demandées,
              puis soumettez-la à nouveau à l’étape 4.
            </p>
          ) : null}
          <div className={ui.card}>{children}</div>
        </div>
      </div>
    </PublicShell>
  );
}
