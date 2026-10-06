import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PublicShell } from "@/components/PublicShell";
import { LoginForm } from "@/components/AuthForms";
import { getCurrentAccount } from "@/lib/session";
import s from "@/components/ui.module.css";

export const metadata: Metadata = { title: "Se connecter" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const suite = params.suite === "paiement" ? "paiement" : undefined;
  if (await getCurrentAccount()) redirect(suite ? "/candidature/paiement" : "/espace");
  return (
    <PublicShell>
      <div className={s.card}>
        <h1 className={s.title}>Se connecter</h1>
        <p className={s.lead}>Accédez à votre candidature ou à votre espace membre.</p>
        {params.reinitialise ? (
          <p role="status" className={s.alertOk}>
            Votre mot de passe a été modifié. Vous pouvez vous connecter.
          </p>
        ) : null}
        {params.deconnecte ? (
          <p role="status" className={s.alertInfo}>
            Vous êtes déconnecté(e).
          </p>
        ) : null}
        {suite ? (
          <p role="status" className={s.alertInfo}>
            Connectez-vous pour régler votre cotisation.
          </p>
        ) : null}
        <LoginForm suite={suite} />
      </div>
    </PublicShell>
  );
}
