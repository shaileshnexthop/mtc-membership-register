import Image from "next/image";
import Link from "next/link";
import s from "./SiteHeader.module.css";

/** Portal header: MTCJC logo, the portal line, and optional content on the right. */
export function SiteHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className={s.header}>
      <Link href="/" className={s.brand} aria-label="MTC Jockey Club – Portail des membres, accueil">
        <Image
          src="/mtcjc-logo.png"
          alt="MTC Jockey Club"
          width={270}
          height={200}
          priority
          unoptimized
          className={s.logo}
        />
        <span className={s.sub}>
          <span>Portail des membres</span>
          <span className={s.dot} aria-hidden="true">
            {" · "}
          </span>
          <span className={s.place}>Champ de Mars, Port Louis</span>
        </span>
      </Link>
      {children ? <div className={s.right}>{children}</div> : null}
    </header>
  );
}
