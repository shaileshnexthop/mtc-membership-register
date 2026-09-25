import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pgPool?: Pool };

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  return new Pool({ connectionString, max: 10 });
}

/** Lazily created so `next build` does not need a database. */
export function getPool(): Pool {
  if (!globalForDb.pgPool) globalForDb.pgPool = createPool();
  return globalForDb.pgPool;
}

export function getDb() {
  return drizzle(getPool(), { schema });
}

export { schema };
