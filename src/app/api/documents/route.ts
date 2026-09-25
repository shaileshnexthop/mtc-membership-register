import { randomUUID, createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getCurrentAccount } from "@/lib/session";
import {
  DOCUMENT_REQUIREMENTS,
  getApplicationForAccount,
  isEditable,
  MAX_UPLOAD_BYTES,
  type DocumentKind,
} from "@/lib/applications";
import { putObject } from "@/lib/storage";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/request";

/** Detects the real file type from its first bytes; the browser's claim is not trusted. */
function sniff(buf: Buffer): { type: string; ext: string } | null {
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return { type: "application/pdf", ext: "pdf" };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { type: "image/jpeg", ext: "jpg" };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return { type: "image/png", ext: "png" };
  return null;
}

const fail = (error: string, status = 400) => Response.json({ error }, { status });

/** APP-04 / APP-05: upload one document for the applicant's editable application. */
export async function POST(request: Request) {
  const account = await getCurrentAccount();
  if (!account) return fail("Session expirée. Veuillez vous reconnecter.", 401);
  const app = await getApplicationForAccount(account.id);
  if (!app || !isEditable(app.status)) return fail("Cette candidature ne peut plus être modifiée.", 403);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("Envoi invalide.");
  }
  const kind = String(form.get("kind") ?? "") as DocumentKind;
  const req = DOCUMENT_REQUIREMENTS.find((r) => r.kind === kind);
  if (!req) return fail("Type de document inconnu.");

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Choisissez un fichier.");
  if (file.size > MAX_UPLOAD_BYTES) return fail("Le fichier dépasse 10 Mo.");

  const documentDate = String(form.get("documentDate") ?? "").trim();
  if (req.askDate && !/^\d{4}-\d{2}-\d{2}$/.test(documentDate)) {
    return fail("Indiquez la date figurant sur le document.");
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const detected = sniff(buf);
  if (!detected) return fail("Format non accepté. Utilisez un fichier PDF, JPG ou PNG.");

  const id = randomUUID();
  const key = `applications/${app.id}/${kind}/${id}.${detected.ext}`;
  await putObject(key, buf, detected.type);

  const db = getDb();
  await db.transaction(async (tx) => {
    // A new upload replaces the previous one of the same kind; (e) documents accumulate.
    if (kind !== "other") {
      await tx
        .update(schema.documents)
        .set({ supersededAt: new Date() })
        .where(
          and(
            eq(schema.documents.applicationId, app.id),
            eq(schema.documents.kind, kind),
            isNull(schema.documents.supersededAt),
          ),
        );
    }
    await tx.insert(schema.documents).values({
      id,
      applicationId: app.id,
      kind,
      storageKey: key,
      originalFilename: file.name.slice(0, 200) || `${kind}.${detected.ext}`,
      contentType: detected.type,
      sizeBytes: buf.length,
      sha256: createHash("sha256").update(buf).digest("hex"),
      documentDate: req.askDate ? documentDate : null,
      uploadedByAccountId: account.id,
    });
    await tx.update(schema.applications).set({ updatedAt: new Date() }).where(eq(schema.applications.id, app.id));
  });
  await audit({
    actorType: "applicant",
    action: "document.uploaded",
    entityType: "document",
    entityId: id,
    accountId: account.id,
    ip: await clientIp(),
    details: { applicationId: app.id, kind, sizeBytes: buf.length },
  });
  return Response.json({ ok: true, id });
}
