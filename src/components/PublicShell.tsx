import { logout } from "@/app/actions/auth";
import { SiteHeader } from "./SiteHeader";
import s from "./ui.module.css";

/** Page frame for applicant and member pages. */
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
      <SiteHeader>
        {signedInAs ? (
          <>
            <span className={s.signedIn}>{signedInAs}</span>
            <form action={logout}>
              <button type="submit" className={s.linkButton}>
                Déconnexion
              </button>
            </form>
          </>
        ) : null}
      </SiteHeader>
      <main className={`${s.main} ${wide ? s.mainWide : ""}`}>{children}</main>
    </div>
  );
}
