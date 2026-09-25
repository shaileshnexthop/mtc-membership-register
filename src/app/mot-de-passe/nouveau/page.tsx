import type { Metadata } from "next";
import Link from "next/link";
import { PublicShell } from "@/components/PublicShell";
import { ResetPasswordForm } from "@/components/AuthForms";
import s from "@/components/ui.module.css";

export const metadata: Metadata = { title: "Nouveau mot de passe" };

export default async function NewPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await searchParams;
  const value = typeof token === "string" ? token : "";
  return (
    <PublicShell>
      <div className={s.card}>
        <h1 className={s.title}>Choisir un nouveau mot de passe</h1>
        {value ? (
          <ResetPasswordForm token={value} />
        ) : (
          <p className={s.lead}>
            Ce lien est incomplet. <Link href="/mot-de-passe-oublie">Demandez un nouveau lien</Link>.
          </p>
        )}
      </div>
    </PublicShell>
  );
}
