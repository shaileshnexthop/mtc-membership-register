import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getCurrentAccount, getCurrentStaff } from "@/lib/session";
import { getObject } from "@/lib/storage";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/request";

/**
 * Streams a private document to its owner, or to staff with a review role.
 * KYC documents are never served from a public URL (KYC-08).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });

  const db = getDb();
  const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, id)).limit(1);
  if (!doc) return new Response("Not found", { status: 404 });

  let allowed = false;
  const staff = await getCurrentStaff();
  const staffRoles = new Set(staff?.roles ?? []);
  if (staff && (staffRoles.has("reviewer") || staffRoles.has("compliance_officer") || staffRoles.has("administrator"))) {
    allowed = true;
    await audit({
      actorType: "staff",
      action: "document.viewed",
      entityType: "document",
      entityId: doc.id,
      staffUserId: staff.id,
      ip: await clientIp(),
    });
  } else {
    const account = await getCurrentAccount();
    if (account && doc.uploadedByAccountId === account.id) allowed = true;
  }
  if (!allowed) return new Response("Not found", { status: 404 });

  const body = await getObject(doc.storageKey);
  const filename = doc.originalFilename.replace(/[^\w.\- ]+/g, "_");
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": doc.contentType,
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
