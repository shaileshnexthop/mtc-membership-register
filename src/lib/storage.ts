import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { storageConfig } from "./config";

/**
 * Private document storage. Uses the Lightsail bucket (S3 API) when configured;
 * otherwise a local folder, for development only. Objects are never public:
 * every download goes through /api/documents/[id], which checks access.
 */

let client: S3Client | null = null;
function s3(): S3Client | null {
  const cfg = storageConfig();
  if (!cfg.bucket || !cfg.region || !cfg.accessKeyId || !cfg.secretAccessKey) return null;
  client ??= new S3Client({
    region: cfg.region,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  });
  return client;
}

const localDir = () =>
  process.env.DOCUMENTS_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), ".data", "documents");

function safeLocalPath(key: string): string {
  const root = path.resolve(/*turbopackIgnore: true*/ localDir());
  const full = path.resolve(/*turbopackIgnore: true*/ root, key);
  if (!full.startsWith(root + path.sep)) throw new Error("invalid key");
  return full;
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  const c = s3();
  if (c) {
    await c.send(
      new PutObjectCommand({
        Bucket: storageConfig().bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return;
  }
  const file = safeLocalPath(key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
}

export async function getObject(key: string): Promise<Buffer> {
  const c = s3();
  if (c) {
    const res = await c.send(new GetObjectCommand({ Bucket: storageConfig().bucket, Key: key }));
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes) throw new Error("empty object");
    return Buffer.from(bytes);
  }
  return readFile(safeLocalPath(key));
}
