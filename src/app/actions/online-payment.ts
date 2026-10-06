"use server";

import { redirect } from "next/navigation";
import { getCurrentAccount } from "@/lib/session";
import { clientIp } from "@/lib/request";
import { startCardPayment } from "@/lib/online-payments";

/** PAY-01: the applicant pays the joining fee by card on Peach Payments' secure page. */
export async function payByCard(): Promise<void> {
  const account = await getCurrentAccount();
  if (!account) redirect("/connexion?suite=paiement");
  const result = await startCardPayment(account.id, await clientIp());
  if ("error" in result) redirect(`/candidature/paiement?erreur=${result.error}`);
  redirect(result.redirectUrl);
}
