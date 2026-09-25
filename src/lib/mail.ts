import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { mailConfig } from "./config";

export type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  templateKey: string;
  applicationId?: string | null;
  memberId?: string | null;
  staffUserId?: string | null;
};

/**
 * Sends an email through the SMTP2GO HTTPS API (NOT-01) and records it in
 * email_log (NOT-04). Without an API key (local development) the email is
 * written to the server log instead. Never throws; returns whether it was sent.
 */
export async function sendEmail(email: OutgoingEmail): Promise<boolean> {
  const db = getDb();
  const [logRow] = await db
    .insert(schema.emailLog)
    .values({
      toEmail: email.to,
      templateKey: email.templateKey,
      subject: email.subject,
      applicationId: email.applicationId ?? null,
      memberId: email.memberId ?? null,
      staffUserId: email.staffUserId ?? null,
      status: "queued",
    })
    .returning({ id: schema.emailLog.id });

  const cfg = mailConfig();
  if (!cfg.apiKey || !cfg.fromAddress) {
    console.log(
      `[email not sent: SMTP2GO not configured] to=${email.to} subject="${email.subject}"\n${email.text}`,
    );
    await db
      .update(schema.emailLog)
      .set({ status: "failed", error: "SMTP2GO not configured" })
      .where(eq(schema.emailLog.id, logRow.id));
    return false;
  }

  try {
    const res = await fetch("https://api.smtp2go.com/v3/email/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Smtp2go-Api-Key": cfg.apiKey,
      },
      body: JSON.stringify({
        sender: `${cfg.fromName} <${cfg.fromAddress}>`,
        to: [email.to],
        subject: email.subject,
        html_body: email.html,
        text_body: email.text,
      }),
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => ({}))) as {
      data?: { succeeded?: number; email_id?: string; error?: string };
    };
    const ok = res.ok && (body.data?.succeeded ?? 0) > 0;
    await db
      .update(schema.emailLog)
      .set({
        status: ok ? "sent" : "failed",
        providerMessageId: body.data?.email_id ?? null,
        error: ok ? null : (body.data?.error ?? `HTTP ${res.status}`),
        sentAt: ok ? new Date() : null,
      })
      .where(eq(schema.emailLog.id, logRow.id));
    if (!ok) console.error("SMTP2GO send failed", res.status, body);
    return ok;
  } catch (err) {
    console.error("SMTP2GO send error", err);
    await db
      .update(schema.emailLog)
      .set({ status: "failed", error: String(err).slice(0, 500) })
      .where(eq(schema.emailLog.id, logRow.id));
    return false;
  }
}
