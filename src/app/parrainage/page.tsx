import type { Metadata } from "next";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PublicShell } from "@/components/PublicShell";
import { SponsorAnswerForm } from "@/components/ApplicationForms";
import { sha256 } from "@/lib/crypto";
import ui from "@/components/ui.module.css";

export const metadata: Metadata = { title: "Demande de parrainage" };

/** APP-07: a sponsor confirms or declines from the emailed link. No account is needed. */
export default async function SponsorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await searchParams;
  const value = typeof token === "string" ? token : "";
  const db = getDb();
  const [row] = value
    ? await db
        .select({
          sponsorFirst: schema.applicationSponsors.firstNames,
          sponsorLast: schema.applicationSponsors.lastName,
          confirmedAt: schema.applicationSponsors.confirmedAt,
          declinedAt: schema.applicationSponsors.declinedAt,
          reference: schema.applications.reference,
          firstNames: schema.applications.firstNames,
          lastName: schema.applications.lastName,
        })
        .from(schema.applicationSponsors)
        .innerJoin(schema.applications, eq(schema.applications.id, schema.applicationSponsors.applicationId))
        .where(and(eq(schema.applicationSponsors.confirmTokenHash, sha256(value)), isNull(schema.applications.admittedAt)))
        .limit(1)
    : [];

  return (
    <PublicShell>
      <div className={ui.card}>
        <h1 className={ui.title}>Demande de parrainage</h1>
        {!row ? (
          <p className={ui.lead}>Ce lien n’est pas valable ou n’est plus actif.</p>
        ) : row.confirmedAt || row.declinedAt ? (
          <p className={ui.lead}>Votre réponse a déjà été enregistrée. Merci.</p>
        ) : (
          <>
            <p className={ui.lead}>
              Bonjour {row.sponsorFirst} {row.sponsorLast}, <strong>{row.firstNames} {row.lastName}</strong>{" "}
              vous a indiqué(e) comme parrain pour sa candidature ({row.reference}) en tant qu’Aspirant
              Membre Associé du Mauritius Turf Club.
            </p>
            <p className={ui.lead}>
              En confirmant, vous parrainez cette candidature. Votre confirmation électronique, avec sa
              date et son heure, remplace la signature sur le formulaire papier.
            </p>
            <SponsorAnswerForm token={value} />
          </>
        )}
      </div>
    </PublicShell>
  );
}
