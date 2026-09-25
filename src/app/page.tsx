import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.wordmark}>THE MAURITIUS TURF CLUB</span>
        <span className={styles.sub}>Portail des membres · Champ de Mars, Port Louis</span>
      </header>
      <main className={styles.main}>
        <h1>Devenir membre du Mauritius Turf Club</h1>
        <p>
          Créez votre compte, vérifiez votre adresse courriel, puis déposez votre
          candidature en ligne avec les documents requis.
        </p>
        <div className={styles.actions}>
          <a className={styles.primary} href="/inscription">
            Créer un compte
          </a>
          <a className={styles.secondary} href="/connexion">
            Se connecter
          </a>
        </div>
        <p className={styles.staff}>
          Personnel du Club : <a href="/staff">connexion Microsoft 365</a>
        </p>
      </main>
    </div>
  );
}
