import "server-only";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";

export type ApplicationStatus = (typeof schema.applicationStatus.enumValues)[number];
export type DocumentKind = (typeof schema.documentKind.enumValues)[number];

/** APP-04: the documents listed on MTC's form, in the form's order and wording. */
export const DOCUMENT_REQUIREMENTS: {
  kind: DocumentKind;
  letter: string;
  label: string;
  rule: string;
  required: boolean;
  askDate: boolean;
  maxAgeMonths?: number;
}[] = [
  {
    kind: "id_document",
    letter: "a",
    label: "Copie de la Carte Nationale d’Identité ou du passeport",
    rule: "Recto et verso pour la Carte Nationale d’Identité.",
    required: true,
    askDate: false,
  },
  {
    kind: "proof_of_address",
    letter: "b",
    label: "Preuve d’adresse datant de moins de trois (3) mois",
    rule: "Facture d’électricité, d’eau, de téléphone ou relevé bancaire.",
    required: true,
    askDate: true,
    maxAgeMonths: 3,
  },
  {
    kind: "certificate_of_character",
    letter: "c",
    label: "Certificat de moralité (« Certificate of Character ») datant de moins de six (6) mois",
    rule: "Délivré par les autorités compétentes.",
    required: true,
    askDate: true,
    maxAgeMonths: 6,
  },
  {
    kind: "photo",
    letter: "d",
    label: "Photographie récente format passeport",
    rule: "JPG ou PNG de préférence, fond clair.",
    required: true,
    askDate: false,
  },
  {
    kind: "other",
    letter: "e",
    label: "Tout autre document ou information complémentaire requis par le Club",
    rule: "Uniquement si le Club vous le demande.",
    required: false,
    askDate: false,
  },
];

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MIN_SPONSORS = 1; // open item for MTC: minimum number of sponsors
export const MAX_SPONSORS = 3;

/** An applicant may change the application only while it is a draft or deferred. */
export function isEditable(status: ApplicationStatus): boolean {
  return status === "draft" || status === "deferred";
}

export const STATUS_LABELS_FR: Record<ApplicationStatus, string> = {
  draft: "Brouillon",
  submitted: "Soumise – en cours d’examen",
  deferred: "Différée – modifications possibles",
  rejected: "Refusée",
  approved: "Approuvée – en attente de paiement",
  admitted: "Admis(e) comme membre",
};

/** The account's current application: the open one, else the most recent. */
export async function getApplicationForAccount(accountId: string) {
  const [app] = await getDb()
    .select()
    .from(schema.applications)
    .where(eq(schema.applications.accountId, accountId))
    .orderBy(
      sql`case when ${schema.applications.status} in ('draft','submitted','deferred','approved') then 0 else 1 end`,
      desc(schema.applications.createdAt),
    )
    .limit(1);
  return app ?? null;
}

export async function createDraft(accountId: string) {
  const db = getDb();
  const [{ n }] = await db.execute<{ n: string }>(sql`select nextval('application_ref_seq') as n`).then((r) => r.rows);
  const reference = `APP-${new Date().getFullYear()}-${String(n).padStart(4, "0")}`;
  const [defaultType] = await db
    .select({ id: schema.membershipTypes.id })
    .from(schema.membershipTypes)
    .where(eq(schema.membershipTypes.active, true))
    .orderBy(asc(schema.membershipTypes.sortOrder))
    .limit(1);
  const [account] = await db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.id, accountId))
    .limit(1);
  const [app] = await db
    .insert(schema.applications)
    .values({
      reference,
      accountId,
      membershipTypeId: defaultType?.id ?? null,
      // Nom and Prénoms come from the signed-in account; the applicant can still correct them.
      lastName: account?.lastName ?? splitFullName(account?.fullName).lastName,
      firstNames: account?.firstNames ?? splitFullName(account?.fullName).firstNames,
      mobilePhone: account?.mobilePhone ?? null,
    })
    .returning();
  await db.insert(schema.applicationEvents).values({
    applicationId: app.id,
    actorType: "applicant",
    accountId,
    eventType: "created",
    subject: "Brouillon créé",
    toStatus: "draft",
  });
  return app;
}

/**
 * Fallback for accounts created before Nom and Prénoms were asked separately:
 * the last word is taken as the Nom.
 */
export function splitFullName(fullName: string | null | undefined): {
  lastName: string | null;
  firstNames: string | null;
} {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { lastName: null, firstNames: null };
  if (parts.length === 1) return { lastName: parts[0], firstNames: null };
  return { lastName: parts.at(-1)!, firstNames: parts.slice(0, -1).join(" ") };
}

export async function getSponsors(applicationId: string) {
  return getDb()
    .select()
    .from(schema.applicationSponsors)
    .where(eq(schema.applicationSponsors.applicationId, applicationId))
    .orderBy(asc(schema.applicationSponsors.position));
}

/** Current (not superseded) documents of an application. */
export async function getCurrentDocuments(applicationId: string) {
  return getDb()
    .select()
    .from(schema.documents)
    .where(
      and(eq(schema.documents.applicationId, applicationId), isNull(schema.documents.supersededAt)),
    )
    .orderBy(asc(schema.documents.uploadedAt));
}

export async function getActiveMembershipTypes() {
  return getDb()
    .select()
    .from(schema.membershipTypes)
    .where(eq(schema.membershipTypes.active, true))
    .orderBy(asc(schema.membershipTypes.sortOrder));
}

/** Whole months between a document date (YYYY-MM-DD) and today. */
export function monthsSince(isoDate: string, today = new Date()): number {
  const d = new Date(`${isoDate}T00:00:00Z`);
  let months = (today.getUTCFullYear() - d.getUTCFullYear()) * 12 + (today.getUTCMonth() - d.getUTCMonth());
  if (today.getUTCDate() < d.getUTCDate()) months -= 1;
  return months;
}

export type Completeness = {
  personal: string[];
  sponsors: string[];
  documents: string[];
  declarations: string[];
};

/** What is still missing before submission, per step, in French. */
export async function checkCompleteness(applicationId: string): Promise<Completeness> {
  const db = getDb();
  const [app] = await db
    .select()
    .from(schema.applications)
    .where(eq(schema.applications.id, applicationId))
    .limit(1);
  const personal: string[] = [];
  const req: [keyof typeof app, string][] = [
    ["membershipTypeId", "Type d’adhésion"],
    ["lastName", "Nom"],
    ["firstNames", "Prénoms"],
    ["dateOfBirth", "Date de naissance"],
    ["nationality", "Nationalité"],
    ["idNumber", "Carte d’Identité Nationale / Passeport No"],
    ["residentialAddress", "Adresse résidentielle"],
    ["mobilePhone", "Téléphone portable"],
    ["profession", "Profession / Occupation"],
  ];
  for (const [key, label] of req) if (!app[key]) personal.push(label);

  const sponsorsCount = (await getSponsors(applicationId)).length;
  const sponsors =
    sponsorsCount < MIN_SPONSORS
      ? [`Au moins ${MIN_SPONSORS} parrain${MIN_SPONSORS > 1 ? "s" : ""}`]
      : [];

  const docs = await getCurrentDocuments(applicationId);
  const documents: string[] = [];
  for (const r of DOCUMENT_REQUIREMENTS.filter((x) => x.required)) {
    if (!docs.some((d) => d.kind === r.kind)) documents.push(`Pièce (${r.letter})`);
  }

  const declarations: string[] = [];
  return { personal, sponsors, documents, declarations };
}
