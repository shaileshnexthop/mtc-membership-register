import { connection } from "next/server";
import { getPool } from "@/db";

/** Used by Docker and the deploy workflow to check the app and database are up. */
export async function GET() {
  await connection();
  try {
    await getPool().query("select 1");
    return Response.json({ status: "ok", database: "ok" });
  } catch {
    return Response.json(
      { status: "degraded", database: "unreachable" },
      { status: 503 },
    );
  }
}
