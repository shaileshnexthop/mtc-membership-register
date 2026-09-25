import type { Metadata } from "next";
import { ApplicationShell, loadEditableApplication } from "@/components/ApplicationShell";
import { DocumentsPanel, type DocRow } from "@/components/ApplicationForms";
import { DOCUMENT_REQUIREMENTS, getCurrentDocuments, monthsSince } from "@/lib/applications";
import { formatDateFr, formatSize } from "@/lib/format";

export const metadata: Metadata = { title: "Candidature – Documents" };

export default async function DocumentsStep() {
  const { account, app, completeness } = await loadEditableApplication();
  const docs = await getCurrentDocuments(app.id);
  const rows: DocRow[] = DOCUMENT_REQUIREMENTS.map((r) => {
    const current = docs.filter((d) => d.kind === r.kind).at(-1);
    let warning: string | undefined;
    // APP-05: warn when a dated document is older than the form allows.
    if (current?.documentDate && r.maxAgeMonths && monthsSince(current.documentDate) >= r.maxAgeMonths) {
      warning = `Ce document date de plus de ${r.maxAgeMonths} mois. Veuillez déposer un document plus récent.`;
    }
    return {
      kind: r.kind,
      letter: r.letter,
      label: r.label,
      rule: r.rule,
      required: r.required,
      askDate: r.askDate,
      current: current
        ? {
            id: current.id,
            filename: current.originalFilename,
            sizeLabel: formatSize(current.sizeBytes),
            documentDate: current.documentDate ? formatDateFr(current.documentDate) : null,
          }
        : undefined,
      warning,
    };
  });
  return (
    <ApplicationShell
      active="documents"
      email={account.email}
      reference={app.reference}
      completeness={completeness}
      deferred={app.status === "deferred"}
    >
      <DocumentsPanel rows={rows} missing={completeness.documents} />
    </ApplicationShell>
  );
}
