import type { Metadata } from "next";
import { PublicShell } from "@/components/PublicShell";
import { ResendVerificationForm } from "@/components/AuthForms";
import s from "@/components/ui.module.css";

export const metadata: Metadata = { title: "Vérifiez votre boîte de réception" };

export default async function SentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { email } = await searchParams;
  const address = typeof email === "string" ? email : "";
  return (
    <PublicShell>
      <div className={s.card}>
        <h1 className={s.title}>Vérifiez votre boîte de réception</h1>
        <p className={s.lead}>
          Nous avons envoyé un lien de confirmation{address ? <> à <strong>{address}</strong></> : null}.
          Ouvrez-le pour activer votre compte. Le lien est valable 24 heures.
        </p>
        <div className={s.alertInfo}>
          Pas de message après quelques minutes ? Vérifiez vos courriers indésirables, ou demandez un
          nouveau lien ci-dessous.
        </div>
        <hr className={s.divider} />
        <ResendVerificationForm email={address} />
      </div>
    </PublicShell>
  );
}
