import Link from "next/link";
import { logout } from "@/app/actions/auth";
import s from "./ui.module.css";

/** Header and page frame for applicant and member pages. */
export function PublicShell({
  children,
  wide = false,
  signedInAs,
}: {
  children: React.ReactNode;
  wide?: boolean;
  signedInAs?: string | null;
}) {
  return (
    <div className={s.page}>
      <header className={s.header}>
        <Link href="/" className={s.brand}>
          <span className={s.wordmark}>THE MAURITIUS TURF CLUB</span>
          <span className={s.sub}>Portail des membres · Champ de Mars, Port Louis</span>
        </Link>
        {signedInAs ? (
          <div className={s.headerRight}>
            <span>{signedInAs}</span>
            <form action={logout}>
              <button type="submit" className={s.linkButton}>
                Déconnexion
              </button>
            </form>
          </div>
        ) : null}
      </header>
      <main className={`${s.main} ${wide ? s.mainWide : ""}`}>{children}</main>
    </div>
  );
}
