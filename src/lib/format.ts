/** Rs 1,250.00 style amounts from integer cents. */
export function formatMur(cents: number): string {
  return `Rs ${(cents / 100).toLocaleString("en-MU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const frDate = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Indian/Mauritius" });
const frDateTime = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Indian/Mauritius",
});

export function formatDateFr(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value.length === 10 ? `${value}T12:00:00Z` : value) : value;
  return frDate.format(d);
}

export function formatDateTimeFr(value: Date | null | undefined): string {
  return value ? frDateTime.format(value) : "";
}

export function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} Mo` : `${Math.max(1, Math.round(bytes / 1024))} Ko`;
}

const enDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Indian/Mauritius" });
const enDateTime = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Indian/Mauritius",
});

/** English dates for staff pages, e.g. "5 Oct 2026". */
export function formatDateEn(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value.length === 10 ? `${value}T12:00:00Z` : value) : value;
  return enDate.format(d);
}

export function formatDateTimeEn(value: Date | null | undefined): string {
  return value ? enDateTime.format(value) : "";
}

export function formatSizeEn(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
