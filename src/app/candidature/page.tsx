import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PublicShell } from "@/components/PublicShell";
import { startApplication } from "@/app/actions/application";
import { getCurrentAccount } from "@/lib/session";
import {
  checkCompleteness,
  getApplicationForAccount,
  getCurrentDocuments,
  getSponsors,
  isEditable,
  STATUS_LABELS_FR,
} from "@/lib/applications";
import { formatDateFr, formatDateTimeFr } from "@/lib/format";
import ui from "@/components/ui.module.css";
import s from "@/components/application.module.css";

export const metadata: Metadata = { title: "Ma candidature" };

const STATUS_PILL: Record<string, string> = {
  draft: s.pillMuted,
  submitted: s.pillWarn,
  deferred: s.pillWarn,
  rejected: s.pillBad,
  approved: s.pillOk,
  admitted: s.pillOk,
};

/** APP-09: the applicant follows the status of the application here. */
export default async function ApplicationOverview({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const account = await getCurrentAccount();
  if (!account) redirect("/connexion");
  const { soumise } = await searchParams;
  const app = await getApplicationForAccount(account.id);

  if (!app) {
    return (
      <PublicShell wide signedInAs={account.email}>
        <div className={ui.card}>
          <h1 className={ui.title}>Formulaire de candidature – Aspirant Membre Associé</h1>
          <p className={ui.lead}>
            La candidature se remplit en quatre étapes : informations personnelles, parrainage,
            documents, puis déclarations et signature. Votre brouillon est enregistré à chaque étape.
          </p>
          <form action={startApplication}>
            <button type="submit" className={ui.primary}>
              Commencer ma candidature
            </button>
          </form>
        </div>
      </PublicShell>
    );
  }

  const [completeness, sponsors, docs, events] = await Promise.all([
    checkCompleteness(app.id),
    getSponsors(app.id),
    getCurrentDocuments(app.id),
    getDb()
      .select()
      .from(schema.applicationEvents)
      .where(and(eq(schema.applicationEvents.applicationId, app.id), eq(schema.applicationEvents.internal, false)))
      .orderBy(desc(schema.applicationEvents.at)),
  ]);
  const editable = isEditable(app.status);
  const steps = [
    { href: "/candidature/informations", label: "1. Informations personnelles", missing: completeness.personal },
    { href: "/candidature/parrainage", label: "2. Parrainage", missing: completeness.sponsors },
    { href: "/candidature/documents", label: "3. Documents", missing: completeness.documents },
  ];

  return (
    <PublicShell wide signedInAs={account.email}>
      <div className={ui.form}>
        {soumise ? (
          <p role="status" className={ui.alertOk} style={{ margin: 0 }}>
            Votre candidature a été soumise. Un accusé de réception vous a été envoyé par courriel.
          </p>
        ) : null}

        <div className={ui.card}>
          <span className={s.eyebrow}>Référence {app.reference}</span>
          <h1 className={s.pageTitle}>Ma candidature</h1>
          <p style={{ margin: "8px 0 0" }}>
            <span className={`${s.pill} ${STATUS_PILL[app.status]}`}>{STATUS_LABELS_FR[app.status]}</span>
          </p>
          {app.receivedAt ? (
            <p className={s.meta} style={{ marginTop: 12 }}>
              Date de réception du dossier : {formatDateFr(app.receivedAt)}
            </p>
          ) : null}

          {(app.status === "deferred" || app.status === "rejected") && app.decisionComment ? (
            <div className={app.status === "rejected" ? ui.alertError : ui.alertInfo} style={{ marginTop: 16 }}>
              <strong>Commentaire du Club :</strong> {app.decisionComment}
            </div>
          ) : null}

          {editable ? (
            <>
              <h2 className={s.sectionTitle} style={{ marginTop: 24, marginBottom: 12 }}>
                {app.status === "deferred" ? "Modifier et soumettre à nouveau" : "Compléter la candidature"}
              </h2>
              <ul className={s.checklist}>
                {steps.map((st) => (
                  <li key={st.href}>
                    <Link href={st.href}>{st.label}</Link>
                    {st.missing.length ? (
                      <span className={`${s.pill} ${s.pillMuted}`}>À compléter</span>
                    ) : (
                      <span className={`${s.pill} ${s.pillOk}`}>Complet</span>
                    )}
                  </li>
                ))}
                <li>
                  <Link href="/candidature/declarations">4. Déclarations et signature</Link>
                  <span className={`${s.pill} ${s.pillMuted}`}>À signer</span>
                </li>
              </ul>
              <p style={{ marginTop: 20 }}>
                <Link href="/candidature/informations" className={ui.primary}>
                  Continuer ma candidature
                </Link>
              </p>
            </>
          ) : null}
        </div>

        {sponsors.length && app.status !== "draft" ? (
          <div className={ui.card}>
            <h2 className={s.sectionTitle} style={{ marginTop: 0 }}>Parrainage</h2>
            <ul className={s.timeline}>
              {sponsors.map((sp) => (
                <li key={sp.id}>
                  <strong>
                    {sp.firstNames} {sp.lastName}
                  </strong>
                  <span className={s.small}>
                    {sp.confirmedAt
                      ? `Confirmé le ${formatDateFr(sp.confirmedAt)}`
                      : sp.declinedAt
                        ? `Décliné le ${formatDateFr(sp.declinedAt)}`
                        : "En attente de confirmation"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {docs.length && app.status !== "draft" ? (
          <div className={ui.card}>
            <h2 className={s.sectionTitle} style={{ marginTop: 0 }}>Documents déposés</h2>
            <ul className={s.timeline}>
              {docs.map((d) => (
                <li key={d.id}>
                  <a href={`/api/documents/${d.id}`} target="_blank" rel="noopener noreferrer">
                    {d.originalFilename}
                  </a>
                  <span className={s.small}>
                    Déposé le {formatDateFr(d.uploadedAt)}
                    {d.reviewStatus === "verified" ? " · vérifié" : d.reviewStatus === "rejected" ? " · à remplacer" : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className={ui.card}>
          <h2 className={s.sectionTitle} style={{ marginTop: 0 }}>Historique</h2>
          <ul className={s.timeline}>
            {events.map((e) => (
              <li key={e.id}>
                <strong>
                  {formatDateTimeFr(e.at)} · {e.subject ?? e.eventType}
                </strong>
                {e.comment ? <span className={s.small}>{e.comment}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </PublicShell>
  );
}
