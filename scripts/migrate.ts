/**
 * Applies pending SQL migrations from ./drizzle, then seeds reference data.
 * Runs once per deploy (the `migrate` service in docker-compose.yml).
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import path from "node:path";
import { seedReferenceData } from "./seed-reference";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const pool = new Pool({ connectionString, max: 1 });
  const db = drizzle(pool);
  const migrationsFolder =
    process.env.MIGRATIONS_DIR ?? path.join(process.cwd(), "drizzle");

  console.log(`Applying migrations from ${migrationsFolder}`);
  await migrate(db, { migrationsFolder });
  console.log("Migrations applied");

  await seedReferenceData(pool);
  console.log("Reference data seeded");

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
