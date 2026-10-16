import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getCurrentAccount, getCurrentStaff } from "@/lib/session";
import { formatDateFr, formatMur } from "@/lib/format";
import { PrintButton } from "@/components/PrintButton";
import r from "@/components/reports.module.css";
import ui from "@/components/ui.module.css";

export const metadata: Metadata = { title: "Reçu de paiement" };

const PURPOSE_FR: Record<string, string> = {
  joining: "Cotisation d’adhésion",
  dues: "Cotisation",
  renewal: "Renouvellement",
  upgrade_adjustment: "Ajustement de catégorie",
};
const METHOD_FR: Record<string, string> = {
  card: "Carte bancaire (Peach Payments)",
  mips: "MIPS",
  bank_transfer: "Virement bancaire",
  cash: "Espèces",
  cheque: "Chèque",
};

/** MEM-06 / REN-05: printable receipt, for staff or the member who paid. */
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = getDb();
  const [p] = await db.select().from(schema.payments).where(eq(schema.payments.id, id)).limit(1);
  if (!p || p.status !== "paid" || !p.memberId) notFound();
  const [m] = await db.select().from(schema.members).where(eq(schema.members.id, p.memberId)).limit(1);
  const staff = await getCurrentStaff();
  const account = staff ? null : await getCurrentAccount();
  if (!m || (!staff && (!account || account.id !== m.accountId))) notFound();
  const [type] = await db.select().from(schema.membershipTypes).where(eq(schema.membershipTypes.id, m.membershipTypeId)).limit(1);

  const row = (k: string, v: string) => (
    <tr>
      <th style={{ textAlign: "left", fontWeight: 400, color: "#5b606b", padding: "8px 24px 8px 0", verticalAlign: "top" }}>{k}</th>
      <td style={{ padding: "8px 0", fontWeight: 700 }}>{v}</td>
    </tr>
  );

  return (
    <main data-report-page style={{ maxWidth: 720, margin: "32px auto", padding: "0 16px" }}>
      <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 8, padding: "28px 32px" }} className={r.printCard}>
        <div className={r.printHeader} style={{ display: "flex" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mtcjc-logo.png" alt="MTC Jockey Club" />
          <div>
            <strong>The Mauritius Turf Club</strong>
            <span>Champ de Mars, Port Louis</span>
          </div>
        </div>
        <h1 style={{ margin: "20px 0 4px", fontSize: 26 }}>Reçu de paiement</h1>
        <p style={{ margin: "0 0 16px", color: "#5b606b" }}>N° {p.id.slice(0, 8).toUpperCase()}</p>
        <table style={{ borderCollapse: "collapse", fontSize: 15 }}>
          <tbody>
            {row("Membre", `${m.firstNames} ${m.lastName}`)}
            {row("Numéro de membre", m.memberNumber)}
            {row("Catégorie", type?.name ?? "")}
            {row("Objet", PURPOSE_FR[p.purpose] ?? p.purpose)}
            {p.periodStart && p.periodEnd ? row("Période", `du ${formatDateFr(p.periodStart)} au ${formatDateFr(p.periodEnd)}`) : null}
            {row("Montant reçu", formatMur(p.amountCents))}
            {row("Date du paiement", formatDateFr(p.paidAt))}
            {row("Mode de paiement", METHOD_FR[p.method] ?? p.method)}
            {p.reference ? row("Référence", p.reference) : null}
          </tbody>
        </table>
        <p style={{ marginTop: 24, fontSize: 13, color: "#5b606b" }}>
          Reçu établi électroniquement par le portail des membres du Mauritius Turf Club.
        </p>
      </div>
      <p className={r.noPrint} style={{ marginTop: 16 }}>
        <PrintButton className={ui.secondary} label="Imprimer / enregistrer en PDF" />
      </p>
    </main>
  );
}
