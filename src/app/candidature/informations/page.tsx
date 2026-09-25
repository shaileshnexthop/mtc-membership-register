import type { Metadata } from "next";
import { ApplicationShell, loadEditableApplication } from "@/components/ApplicationShell";
import { PersonalForm } from "@/components/ApplicationForms";
import { getActiveMembershipTypes, splitFullName } from "@/lib/applications";
import { formatMur } from "@/lib/format";

export const metadata: Metadata = { title: "Candidature – Informations personnelles" };

export default async function PersonalStep() {
  const { account, app, completeness } = await loadEditableApplication();
  const types = await getActiveMembershipTypes();
  // Prefill from the signed-in account when the draft has no name yet.
  const fromAccount = {
    lastName: account.lastName ?? splitFullName(account.fullName).lastName ?? "",
    firstNames: account.firstNames ?? splitFullName(account.fullName).firstNames ?? "",
  };
  const values: Record<string, string> = {
    membershipTypeId: app.membershipTypeId ?? "",
    lastName: app.lastName ?? fromAccount.lastName,
    firstNames: app.firstNames ?? fromAccount.firstNames,
    dateOfBirth: app.dateOfBirth ?? "",
    nationality: app.nationality ?? "",
    idNumber: app.idNumber ?? "",
    residentialAddress: app.residentialAddress ?? "",
    mobilePhone: app.mobilePhone ?? "",
    homePhone: app.homePhone ?? "",
    profession: app.profession ?? "",
    employerName: app.employerName ?? "",
    workAddress: app.workAddress ?? "",
  };
  return (
    <ApplicationShell
      active="informations"
      email={account.email}
      reference={app.reference}
      completeness={completeness}
      deferred={app.status === "deferred"}
    >
      <PersonalForm
        values={values}
        email={account.email}
        types={types.map((t) => ({
          id: t.id,
          name: t.name,
          fee: t.feeCents > 0 ? `${formatMur(t.feeCents)} ${t.feePeriod === "monthly" ? "par mois" : "par an"}` : "[montant à confirmer]",
        }))}
      />
    </ApplicationShell>
  );
}
