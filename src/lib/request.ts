import "server-only";
import { headers } from "next/headers";

/** Client IP as forwarded by Caddy, for the audit log and signature evidence. */
export async function clientIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  if (!ip) return null;
  // Keep only values Postgres' inet type accepts.
  return /^[0-9a-fA-F:.]+$/.test(ip) ? ip : null;
}

export async function userAgent(): Promise<string | null> {
  const h = await headers();
  return h.get("user-agent")?.slice(0, 400) ?? null;
}
