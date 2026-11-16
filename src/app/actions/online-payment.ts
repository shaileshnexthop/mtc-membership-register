"use server";

import { redirect } from "next/navigation";
import { getCurrentAccount } from "@/lib/session";
import { clientIp } from "@/lib/request";
import { startCardPayment, startDuesCardPayment } from "@/lib/online-payments";

/** PAY-01: the applicant pays the joining fee by card on Peach Payments' secure page. */
export async function payByCard(): Promise<void> {
  const account = await getCurrentAccount();
  if (!account) redirect("/connexion?suite=paiement");
  const result = await startCardPayment(account.id, await clientIp());
  if ("error" in result) redirect(`/candidature/paiement?erreur=${result.error}`);
  redirect(result.redirectUrl);
}

/** REN-03: a member pays dues by card for the number of periods chosen. */
export async function payDuesByCard(fd: FormData): Promise<void> {
  const account = await getCurrentAccount();
  if (!account) redirect("/connexion?suite=cotisation");
  const periods = Number(fd.get("periods") ?? 1);
  const result = await startDuesCardPayment(account.id, periods, await clientIp());
  if ("error" in result) redirect(`/espace/cotisation?erreur=${result.error}`);
  redirect(result.redirectUrl);
}
