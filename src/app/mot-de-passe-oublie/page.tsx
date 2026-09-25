import type { Metadata } from "next";
import { PublicShell } from "@/components/PublicShell";
import { ForgotPasswordForm } from "@/components/AuthForms";
import s from "@/components/ui.module.css";

export const metadata: Metadata = { title: "Mot de passe oublié" };

export default function ForgotPasswordPage() {
  return (
    <PublicShell>
      <div className={s.card}>
        <h1 className={s.title}>Mot de passe oublié</h1>
        <p className={s.lead}>
          Indiquez l’adresse courriel de votre compte. Nous vous enverrons un lien pour choisir un
          nouveau mot de passe.
        </p>
        <ForgotPasswordForm />
      </div>
    </PublicShell>
  );
}
