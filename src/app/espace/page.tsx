import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PublicShell } from "@/components/PublicShell";
import { getCurrentAccount } from "@/lib/session";
import s from "@/components/ui.module.css";

export const metadata: Metadata = { title: "Mon espace" };

export default async function AccountHomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const account = await getCurrentAccount();
  if (!account) redirect("/connexion");
  const { bienvenue } = await searchParams;
  return (
    <PublicShell wide signedInAs={account.email}>
      <div className={s.card}>
        {bienvenue ? (
          <p role="status" className={s.alertOk}>
            Votre adresse courriel est confirmée et votre compte est actif.
          </p>
        ) : null}
        <h1 className={s.title}>Bonjour {account.fullName}</h1>
        <p className={s.lead}>
          Vous pouvez maintenant déposer votre candidature pour devenir membre du Mauritius Turf
          Club. Votre brouillon est enregistré au fur et à mesure.
        </p>
        <a className={s.primary} href="/candidature">
          Commencer ma candidature
        </a>
      </div>
    </PublicShell>
  );
}
