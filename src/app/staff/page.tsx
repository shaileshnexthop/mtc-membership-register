import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { getCurrentStaff } from "@/lib/session";
import ui from "@/components/ui.module.css";

export const metadata: Metadata = { title: "Staff sign-in" };

const ERRORS: Record<string, string> = {
  norole:
    "You signed in, but your account has no role in the membership portal. Ask the portal administrator to assign you a role in Microsoft Entra.",
  forbidden: "Your role does not give access to that page.",
  signin: "Sign-in with Microsoft 365 did not complete. Please try again.",
  state: "The sign-in request expired or was changed. Please try again.",
  expired: "The sign-in request expired. Please try again.",
  access_denied: "Access was not granted. If you should have access, ask the portal administrator.",
};

export default async function StaffSignIn({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : "";
  if (!error && (await getCurrentStaff())) redirect("/staff/applications");
  return (
    <div className={ui.page}>
      <SiteHeader />
      <main className={ui.main} lang="en">
        <div className={ui.card}>
          <h1 className={ui.title}>Club staff</h1>
          <p className={ui.lead}>
            Sign in with your Mauritius Turf Club Microsoft 365 account to review applications and
            manage members.
          </p>
          {error ? (
            <p role="alert" className={ui.alertError}>
              {ERRORS[error] ?? ERRORS.signin}
            </p>
          ) : null}
          {params.signedout ? (
            <p role="status" className={ui.alertInfo}>
              You are signed out.
            </p>
          ) : null}
          <a className={ui.primary} href="/api/auth/entra/login" style={{ marginTop: 8 }}>
            Sign in with Microsoft 365
          </a>
        </div>
      </main>
    </div>
  );
}
