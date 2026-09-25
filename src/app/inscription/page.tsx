import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PublicShell } from "@/components/PublicShell";
import { RegisterForm } from "@/components/AuthForms";
import { getCurrentAccount } from "@/lib/session";
import s from "@/components/ui.module.css";

export const metadata: Metadata = { title: "Créer un compte" };

export default async function RegisterPage() {
  if (await getCurrentAccount()) redirect("/espace");
  return (
    <PublicShell>
      <div className={s.card}>
        <h1 className={s.title}>Créer un compte</h1>
        <p className={s.lead}>
          Votre compte vous permet de déposer et de suivre votre candidature en ligne. Un lien de
          confirmation vous sera envoyé par courriel.
        </p>
        <RegisterForm />
        <div className={s.links}>
          <span>
            Déjà un compte ? <Link href="/connexion">Se connecter</Link>
          </span>
        </div>
      </div>
    </PublicShell>
  );
}
