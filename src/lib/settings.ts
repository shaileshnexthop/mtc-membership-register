import "server-only";
import { inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";

/** Reads settings kept in the database (ADM-03). Missing keys come back undefined. */
export async function getSettings<K extends string>(keys: K[]): Promise<Partial<Record<K, unknown>>> {
  const rows = await getDb().select().from(schema.settings).where(inArray(schema.settings.key, keys));
  return Object.fromEntries(rows.map((r) => [r.key, r.value])) as Partial<Record<K, unknown>>;
}

export async function getBankDetails(): Promise<{ bankName: string; accountNumber: string }> {
  const s = await getSettings(["payment_bank_name", "payment_bank_account"]);
  return {
    bankName: String(s.payment_bank_name ?? "[banque à confirmer]"),
    accountNumber: String(s.payment_bank_account ?? "[numéro de compte à confirmer]"),
  };
}
