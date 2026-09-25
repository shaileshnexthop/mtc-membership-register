/** Runtime configuration, read lazily so `next build` needs no secrets. */
export function appBaseUrl(): string {
  return (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function isHttps(): boolean {
  return appBaseUrl().startsWith("https://");
}

export function mailConfig() {
  return {
    apiKey: process.env.SMTP2GO_API_KEY ?? "",
    fromAddress: process.env.MAIL_FROM_ADDRESS ?? "",
    fromName: process.env.MAIL_FROM_NAME ?? "The Mauritius Turf Club",
  };
}

export function entraConfig() {
  return {
    tenantId: process.env.ENTRA_TENANT_ID ?? "",
    clientId: process.env.ENTRA_CLIENT_ID ?? "",
    clientSecret: process.env.ENTRA_CLIENT_SECRET ?? "",
  };
}

export function storageConfig() {
  return {
    bucket: process.env.S3_BUCKET ?? "",
    region: process.env.S3_REGION ?? "",
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  };
}
