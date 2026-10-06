import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PublicShell } from "@/components/PublicShell";
import { getCurrentAccount } from "@/lib/session";
import { getApplicationForAccount } from "@/lib/applications";
import { formatDateFr, formatMur } from "@/lib/format";
import { isPast } from "@/lib/business-days";
import { getBankDetails } from "@/lib/settings";
import { peachEnabled } from "@/lib/peach";
import { payByCard } from "@/app/actions/online-payment";
import ui from "@/components/ui.module.css";
import s from "@/components/application.module.css";

export const metadata: Metadata = { title: "Régler ma cotisation" };

const ERRORS: Record<string, string> = {
  indisponible: "Le paiement en ligne n’est pas disponible pour le moment. Vous pouvez régler par virement bancaire.",
  statut: "Aucune candidature approuvée n’attend de paiement sur votre compte.",
  delai: "Le délai de paiement est dépassé. Veuillez contacter le Club.",
  montant: "Le montant de la cotisation n’est pas encore confirmé par le Club. Veuillez réessayer plus tard.",
  technique: "Le paiement n’a pas pu être lancé. Veuillez réessayer dans quelques instants, ou régler par virement bancaire.",
};

/** PAY-01/02: approved applicant pays the joining fee by card (Peach Payments) or bank transfer. */
export default async function PaymentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const account = await getCurrentAccount();
  if (!account) redirect("/connexion?suite=paiement");
  const { resultat, erreur } = await searchParams;
  const app = await getApplicationForAccount(account.id);

  if (app?.status === "admitted" || resultat === "ok") {
    const [member] = app
      ? await getDb()
          .select({ memberNumber: schema.members.memberNumber })
          .from(schema.members)
          .where(eq(schema.members.applicationId, app.id))
          .limit(1)
      : [];
    if (member) {
      return (
        <PublicShell wide signedInAs={account.email}>
          <div className={ui.card}>
            <span className={s.eyebrow}>Référence {app!.reference}</span>
            <h1 className={s.pageTitle}>Paiement reçu</h1>
            <p role="status" className={ui.alertOk}>
              Merci ! Votre paiement a été confirmé. Vous êtes désormais membre du Mauritius Turf Club
              sous le numéro <strong>{member.memberNumber}</strong>. Un reçu vous a été envoyé par courriel.
            </p>
            <p>
              <Link href="/espace" className={ui.primary}>
                Accéder à mon espace
              </Link>
            </p>
          </div>
        </PublicShell>
      );
    }
  }

  if (!app || app.status !== "approved") redirect("/candidature");

  const [type] = app.membershipTypeId
    ? await getDb().select().from(schema.membershipTypes).where(eq(schema.membershipTypes.id, app.membershipTypeId)).limit(1)
    : [];
  const amount = type?.feeCents ?? 0;
  const bank = await getBankDetails();
  const online = peachEnabled() && amount > 0;
  const overdue = isPast(app.paymentDueAt);
  const errorKey = typeof erreur === "string" ? erreur : "";

  return (
    <PublicShell wide signedInAs={account.email}>
      <div className={ui.form}>
        {resultat === "echec" ? (
          <p role="alert" className={ui.alertError} style={{ margin: 0 }}>
            Le paiement n’a pas abouti. Aucun montant n’a été débité. Vous pouvez
            réessayer ou régler par virement bancaire.
          </p>
        ) : null}
        {resultat === "attente" ? (
          <p role="status" className={ui.alertInfo} style={{ margin: 0 }}>
            Votre paiement est en cours de confirmation. Vous recevrez un courriel dès qu’il sera confirmé ;
            inutile de payer une seconde fois.
          </p>
        ) : null}
        {ERRORS[errorKey] ? (
          <p role="alert" className={ui.alertError} style={{ margin: 0 }}>
            {ERRORS[errorKey]}
          </p>
        ) : null}

        <div className={ui.card}>
          <span className={s.eyebrow}>Référence {app.reference}</span>
          <h1 className={s.pageTitle}>Régler ma cotisation</h1>
          <p>
            Votre candidature en qualité de <strong>{type?.name ?? "membre"}</strong> a été approuvée. Votre adhésion
            prendra effet dès réception de votre paiement, au plus tard le{" "}
            <strong>{formatDateFr(app.paymentDueAt)}</strong>.
          </p>
          <dl className={s.bankBox}>
            <dt>Montant</dt>
            <dd>
              {amount > 0
                ? `${formatMur(amount)} ${type?.feePeriod === "annual" ? "par an" : "par mois"}`
                : "[montant à confirmer]"}
            </dd>
            <dt>Date limite</dt>
            <dd>{formatDateFr(app.paymentDueAt)}</dd>
          </dl>
        </div>

        <div className={ui.card} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h2 className={s.sectionTitle} style={{ margin: 0 }}>
            Payer par carte bancaire
          </h2>
          {online && !overdue ? (
            <>
              <p style={{ margin: 0 }}>
                Vous serez redirigé(e) vers la page sécurisée de Peach Payments. Vos données de carte ne sont jamais
                transmises au Club.
              </p>
              <form action={payByCard}>
                <button type="submit" className={ui.primary}>
                  Payer {formatMur(amount)} par carte
                </button>
              </form>
            </>
          ) : (
            <p className={s.small} style={{ margin: 0 }}>
              {overdue
                ? "Le délai de paiement est dépassé. Veuillez contacter le Club."
                : "Le paiement par carte n’est pas encore disponible. Veuillez régler par virement bancaire."}
            </p>
          )}
        </div>

        <div className={ui.card} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h2 className={s.sectionTitle} style={{ margin: 0 }}>
            Ou par virement bancaire
          </h2>
          <dl className={s.bankBox}>
            <dt>Institution bancaire</dt>
            <dd>{bank.bankName}</dd>
            <dt>Numéro de compte</dt>
            <dd>{bank.accountNumber}</dd>
            <dt>Référence à indiquer</dt>
            <dd>{app.reference}</dd>
          </dl>
          <p className={s.small} style={{ margin: 0 }}>
            Indiquez la référence {app.reference} sur votre virement. Vous recevrez un reçu par courriel dès que le
            Club aura enregistré votre paiement.
          </p>
        </div>

        <p>
          <Link href="/candidature">← Retour à ma candidature</Link>
        </p>
      </div>
    </PublicShell>
  );
}
