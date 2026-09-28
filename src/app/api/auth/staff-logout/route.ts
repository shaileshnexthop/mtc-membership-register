import { destroySession } from "@/lib/session";
import { appBaseUrl } from "@/lib/config";

export async function POST() {
  await destroySession();
  return Response.redirect(`${appBaseUrl()}/staff?signedout=1`, 303);
}
