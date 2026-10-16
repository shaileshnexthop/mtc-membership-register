import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PublicShell } from "@/components/PublicShell";
import Link from "next/link";
import { getCurrentAccount } from "@/lib/session";
import { getApplicationForAccount, STATUS_LABELS_FR } from "@/lib/applications";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { formatDateFr, formatMur } from "@/lib/format";
import { MEMBER_STATUS_FR, feeLabelFr, monthsBetween, todayMu } from "@/lib/members";
import a from "@/components/application.module.css";

function yearsFr(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  const parts = [y ? `${y} an${y > 1 ? "s" : ""}` : "", m ? `${m} mois` : ""].filter(Boolean);
  return parts.length ? parts.join(" et ") : "moins d’un mois";
}
import s from "@/components/ui.module.css";

export const metadata: Metadata = { title: "Mon espace" };

export default async function AccountHomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const account = await getCurrentAccount();
  if (!account) redirect("/connexion");
  const { bienvenue } = await searchParams;
  const app = await getApplicationForAccount(account.id);
  const db = getDb();
  const [member] = await db
    .select({
      id: schema.members.id,
      memberNumber: schema.members.memberNumber,
      status: schema.members.status,
      memberSince: schema.members.memberSince,
      continuousSince: schema.members.continuousSince,
      feeCents: schema.members.currentFeeCents,
      nextDueOn: schema.members.nextDueOn,
      typeName: schema.membershipTypes.name,
      feePeriod: schema.membershipTypes.feePeriod,
    })
    .from(schema.members)
    .innerJoin(schema.membershipTypes, eq(schema.membershipTypes.id, schema.members.membershipTypeId))
    .where(eq(schema.members.accountId, account.id))
    .limit(1);
  if (member) {
    const payments = await db
      .select()
      .from(schema.payments)
      .where(and(eq(schema.payments.memberId, member.id), eq(schema.payments.status, "paid")))
      .orderBy(desc(schema.payments.paidAt));
    const today = todayMu();
    return (
      <PublicShell wide signedInAs={account.email}>
        <div className={s.form}>
          <div className={s.card}>
            <span className={a.eyebrow}>Membre {member.memberNumber}</span>
            <h1 className={s.title}>Bonjour {account.fullName}</h1>
            <dl className={a.bankBox}>
              <dt>Catégorie</dt>
              <dd>{member.typeName}</dd>
              <dt>Statut</dt>
              <dd>{MEMBER_STATUS_FR[member.status]}</dd>
              <dt>Membre depuis</dt>
              <dd>{formatDateFr(member.memberSince)}</dd>
              <dt>Ancienneté</dt>
              <dd>
                {yearsFr(monthsBetween(member.memberSince, today))}
                {member.continuousSince !== member.memberSince
                  ? ` (${yearsFr(monthsBetween(member.continuousSince, today))} sans interruption)`
                  : ""}
              </dd>
              <dt>Cotisation</dt>
              <dd>{feeLabelFr(member.feeCents, member.feePeriod)}</dd>
              <dt>Prochaine échéance</dt>
              <dd>{member.nextDueOn ? formatDateFr(member.nextDueOn) : "—"}</dd>
            </dl>
          </div>
          <div className={s.card}>
            <h2 className={a.sectionTitle} style={{ margin: 0 }}>Mes paiements</h2>
            {payments.length === 0 ? (
              <p>Aucun paiement enregistré.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 13 }}>
                    <th style={{ padding: "8px 8px 8px 0" }}>Date</th>
                    <th style={{ padding: 8 }}>Montant</th>
                    <th style={{ padding: 8 }}>Reçu</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} style={{ borderTop: "1px solid var(--line)" }}>
                      <td style={{ padding: "10px 8px 10px 0" }}>{formatDateFr(p.paidAt)}</td>
                      <td style={{ padding: 8 }}>{formatMur(p.amountCents)}</td>
                      <td style={{ padding: 8 }}>
                        <a href={`/recu/${p.id}`} target="_blank" rel="noopener">
                          Télécharger
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </PublicShell>
    );
  }
  return (
    <PublicShell wide signedInAs={account.email}>
      <div className={s.card}>
        {bienvenue ? (
          <p role="status" className={s.alertOk}>
            Votre adresse courriel est confirmée et votre compte est actif.
          </p>
        ) : null}
        <h1 className={s.title}>Bonjour {account.fullName}</h1>
        {app ? (
          <>
            <p className={s.lead}>
              Candidature {app.reference} : <strong>{STATUS_LABELS_FR[app.status]}</strong>
            </p>
            <Link className={s.primary} href="/candidature">
              Voir ma candidature
            </Link>
          </>
        ) : (
          <>
            <p className={s.lead}>
              Vous pouvez maintenant déposer votre candidature pour devenir membre du Mauritius Turf
              Club. Votre brouillon est enregistré au fur et à mesure.
            </p>
            <Link className={s.primary} href="/candidature">
              Commencer ma candidature
            </Link>
          </>
        )}
      </div>
    </PublicShell>
  );
}
