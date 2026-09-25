import type { Metadata } from "next";
import { ApplicationShell, loadEditableApplication } from "@/components/ApplicationShell";
import { DeclarationsForm } from "@/components/ApplicationForms";
import { formatDateFr } from "@/lib/format";

export const metadata: Metadata = { title: "Candidature – Déclarations et signature" };

export default async function DeclarationsStep() {
  const { account, app, completeness } = await loadEditableApplication();
  const missing = [...completeness.personal, ...completeness.sponsors, ...completeness.documents];
  return (
    <ApplicationShell
      active="declarations"
      email={account.email}
      reference={app.reference}
      completeness={completeness}
      deferred={app.status === "deferred"}
    >
      <DeclarationsForm
        missing={missing}
        today={formatDateFr(new Date())}
        defaultName={`${app.firstNames ?? ""} ${app.lastName ?? ""}`.trim()}
      />
    </ApplicationShell>
  );
}
