import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PublicShell } from "@/components/PublicShell";
import { getCurrentAccount } from "@/lib/session";
import { formatDateFr, formatMur } from "@/lib/format";
import { getBankDetails } from "@/lib/settings";
import { peachEnabled } from "@/lib/peach";
import { addPeriods } from "@/lib/dues";
import { feeLabelFr, todayMu } from "@/lib/members";
import { payDuesByCard } from "@/app/actions/online-payment";
import ui from "@/components/ui.module.css";
import s from "@/components/application.module.css";

export const metadata: Metadata = { title: "Ma cotisation" };

const ERRORS: Record<string, string> = {
  indisponible: "Le paiement en ligne n’est pas disponible pour le moment. Vous pouvez régler par virement bancaire.",
  statut: "Votre adhésion n’est pas active. Veuillez contacter le secrétariat du Club.",
  montant: "Le montant de la cotisation n’est pas encore confirmé par le Club.",
  periodes: "Choisissez la période à régler.",
  technique: "Le paiement n’a pas pu être lancé. Veuillez réessayer dans quelques instants, ou régler par virement bancaire.",
};

/** REN-03: the member renews / pays dues by card, or sees the bank transfer details. */
export default async function DuesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const account = await getCurrentAccount();
  if (!account) redirect("/connexion?suite=cotisation");
  const { resultat, erreur } = await searchParams;
  const [row] = await getDb()
    .select({ m: schema.members, t: schema.membershipTypes })
    .from(schema.members)
    .innerJoin(schema.membershipTypes, eq(schema.membershipTypes.id, schema.members.membershipTypeId))
    .where(eq(schema.members.accountId, account.id))
    .limit(1);
  if (!row) redirect("/espace");
  const { m, t } = row;
  const active = m.status === "active" || m.status === "renewal_due";
  const fee = t.feeCents;
  const online = peachEnabled() && fee > 0 && active;
  const bank = await getBankDetails();
  const start = m.nextDueOn ?? todayMu();
  const options = t.feePeriod === "annual" ? [1] : [1, 3, 6, 12];
  const overdue = m.nextDueOn ? m.nextDueOn < todayMu() : false;
  const errorKey = typeof erreur === "string" ? erreur : "";

  return (
    <PublicShell wide signedInAs={account.email}>
      <div className={ui.form}>
        {resultat === "ok" ? (
          <p role="status" className={ui.alertOk} style={{ margin: 0 }}>
            Merci ! Votre paiement a été confirmé. Votre prochaine échéance est le{" "}
            <strong>{m.nextDueOn ? formatDateFr(m.nextDueOn) : "—"}</strong>. Un reçu vous a été envoyé par courriel.
          </p>
        ) : null}
        {resultat === "echec" ? (
          <p role="alert" className={ui.alertError} style={{ margin: 0 }}>
            Le paiement n’a pas abouti. Aucun montant n’a été débité. Vous pouvez réessayer ou régler par virement bancaire.
          </p>
        ) : null}
        {resultat === "attente" ? (
          <p role="status" className={ui.alertInfo} style={{ margin: 0 }}>
            Votre paiement est en cours de confirmation. Vous recevrez un courriel dès qu’il sera confirmé ; inutile de payer
            une seconde fois.
          </p>
        ) : null}
        {ERRORS[errorKey] ? (
          <p role="alert" className={ui.alertError} style={{ margin: 0 }}>
            {ERRORS[errorKey]}
          </p>
        ) : null}

        <div className={ui.card}>
          <span className={s.eyebrow}>Membre {m.memberNumber}</span>
          <h1 className={s.pageTitle}>Ma cotisation</h1>
          <dl className={s.bankBox}>
            <dt>Catégorie</dt>
            <dd>{t.name}</dd>
            <dt>Cotisation</dt>
            <dd>{feeLabelFr(fee, t.feePeriod)}</dd>
            <dt>Prochaine échéance</dt>
            <dd>
              {m.nextDueOn ? formatDateFr(m.nextDueOn) : "—"}
              {overdue ? " (en retard)" : ""}
            </dd>
          </dl>
          {!active ? (
            <p style={{ margin: 0 }}>Votre adhésion n’est pas active. Veuillez contacter le secrétariat du Club pour la rétablir.</p>
          ) : null}
        </div>

        {active ? (
          <div className={ui.card} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <h2 className={s.sectionTitle} style={{ margin: 0 }}>
              Payer par carte bancaire
            </h2>
            {online ? (
              <form action={payDuesByCard} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <fieldset style={{ border: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                  <legend className={ui.label} style={{ marginBottom: 6 }}>
                    Période à régler
                  </legend>
                  {options.map((n, i) => (
                    <label key={n} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 16 }}>
                      <input type="radio" name="periods" value={n} defaultChecked={i === 0} style={{ width: 20, height: 20 }} />
                      {t.feePeriod === "annual" ? "1 an" : `${n} mois`} — {formatMur(fee * n)}{" "}
                      <span className={s.small}>
                        (du {formatDateFr(start)} au {formatDateFr(addPeriods(start, n, t.feePeriod))})
                      </span>
                    </label>
                  ))}
                </fieldset>
                <p className={s.small} style={{ margin: 0 }}>
                  Vous serez redirigé(e) vers la page sécurisée de Peach Payments. Vos données de carte ne sont jamais
                  transmises au Club.
                </p>
                <div>
                  <button type="submit" className={ui.primary}>
                    Payer par carte
                  </button>
                </div>
              </form>
            ) : (
              <p className={s.small} style={{ margin: 0 }}>
                Le paiement par carte n’est pas encore disponible. Veuillez régler par virement bancaire.
              </p>
            )}
          </div>
        ) : null}

        {active ? (
          <div className={ui.card}>
            <h2 className={s.sectionTitle} style={{ margin: 0 }}>
              Ou par virement bancaire
            </h2>
            <dl className={s.bankBox}>
              <dt>Institution bancaire</dt>
              <dd>{bank.bankName}</dd>
              <dt>Titulaire du compte</dt>
              <dd>{bank.accountHolder}</dd>
              <dt>Numéro de compte</dt>
              <dd>{bank.accountNumber}</dd>
              <dt>Référence à indiquer</dt>
              <dd>{m.memberNumber}</dd>
            </dl>
            <p className={s.small} style={{ margin: 0 }}>
              Indiquez votre numéro de membre {m.memberNumber} sur le virement. Votre échéance sera mise à jour et un reçu
              vous sera envoyé dès que le Club aura enregistré votre paiement.
            </p>
          </div>
        ) : null}

        <p>
          <Link href="/espace">← Retour à mon espace</Link>
        </p>
      </div>
    </PublicShell>
  );
}
