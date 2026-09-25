import type { Metadata } from "next";
import { ApplicationShell, loadEditableApplication } from "@/components/ApplicationShell";
import { SponsorsForm } from "@/components/ApplicationForms";
import { getSponsors, MIN_SPONSORS } from "@/lib/applications";
import { formatDateFr } from "@/lib/format";

export const metadata: Metadata = { title: "Candidature – Parrainage" };

export default async function SponsorsStep() {
  const { account, app, completeness } = await loadEditableApplication();
  const sponsors = await getSponsors(app.id);
  const values: Record<string, string> = {};
  const statuses: Record<number, string | undefined> = {};
  for (const sp of sponsors) {
    values[`s${sp.position}_lastName`] = sp.lastName;
    values[`s${sp.position}_firstNames`] = sp.firstNames;
    values[`s${sp.position}_phone`] = sp.phone ?? "";
    values[`s${sp.position}_email`] = sp.email;
    statuses[sp.position] = sp.confirmedAt
      ? `Parrainage confirmé le ${formatDateFr(sp.confirmedAt)}`
      : sp.declinedAt
        ? `Parrainage décliné le ${formatDateFr(sp.declinedAt)} – indiquez un autre parrain`
        : sp.requestedAt
          ? `Demande envoyée le ${formatDateFr(sp.requestedAt)}, en attente de réponse`
          : undefined;
  }
  return (
    <ApplicationShell
      active="parrainage"
      email={account.email}
      reference={app.reference}
      completeness={completeness}
      deferred={app.status === "deferred"}
    >
      <SponsorsForm values={values} statuses={statuses} minSponsors={MIN_SPONSORS} />
    </ApplicationShell>
  );
}
