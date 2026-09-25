import "server-only";
import { createHash } from "node:crypto";

export const MIN_PASSWORD_LENGTH = 12;

/**
 * REG-05: at least 12 characters and not in a known data breach.
 * The breach check uses the k-anonymity range API: only the first five
 * characters of the password's SHA-1 hash leave the server. If the service
 * cannot be reached, the check is skipped rather than blocking sign-up.
 * Returns an error message in French, or null when the password is acceptable.
 */
export async function checkPassword(password: string): Promise<string | null> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`;
  }
  if (password.length > 200) {
    return "Le mot de passe est trop long.";
  }
  if (await isBreached(password)) {
    return "Ce mot de passe figure dans une fuite de données connue. Veuillez en choisir un autre.";
  }
  return null;
}

async function isBreached(password: string): Promise<boolean> {
  const hash = createHash("sha1").update(password).digest("hex").toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true" },
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    if (!res.ok) return false;
    const body = await res.text();
    return body.split("\n").some((line) => {
      const [s, count] = line.trim().split(":");
      return s === suffix && Number(count) > 0;
    });
  } catch {
    return false;
  }
}
