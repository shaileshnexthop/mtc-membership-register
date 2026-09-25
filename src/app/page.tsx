import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <SiteHeader />
      <main className={styles.main}>
        <h1>Devenir membre du Mauritius Turf Club</h1>
        <p>
          Créez votre compte, vérifiez votre adresse courriel, puis déposez votre
          candidature en ligne avec les documents requis.
        </p>
        <div className={styles.actions}>
          <Link className={styles.primary} href="/inscription">
            Créer un compte
          </Link>
          <Link className={styles.secondary} href="/connexion">
            Se connecter
          </Link>
        </div>
        <p className={styles.staff}>
          Personnel du Club : <a href="/staff">connexion Microsoft 365</a>
        </p>
      </main>
    </div>
  );
}
