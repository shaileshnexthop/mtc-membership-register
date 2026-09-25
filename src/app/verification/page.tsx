import type { Metadata } from "next";
import { PublicShell } from "@/components/PublicShell";
import { ResendVerificationForm, VerifyEmailForm } from "@/components/AuthForms";
import s from "@/components/ui.module.css";

export const metadata: Metadata = { title: "Activer votre compte" };

/**
 * The emailed link opens this page; activation happens on the button press,
 * so link scanners in mail systems cannot use up the one-time token.
 */
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await searchParams;
  const value = typeof token === "string" ? token : "";
  return (
    <PublicShell>
      <div className={s.card}>
        <h1 className={s.title}>Activer votre compte</h1>
        {value ? (
          <>
            <p className={s.lead}>Confirmez votre adresse courriel pour activer votre compte.</p>
            <VerifyEmailForm token={value} />
          </>
        ) : (
          <>
            <p className={s.lead}>Ce lien est incomplet. Demandez un nouveau lien de confirmation.</p>
            <ResendVerificationForm />
          </>
        )}
      </div>
    </PublicShell>
  );
}
