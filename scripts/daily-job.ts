/**
 * Runs the scheduled checks once (see src/lib/daily-job.ts). The `scheduler`
 * container runs this every hour; it can also be run by hand:
 *   sudo -u deploy docker compose --project-directory /opt/mtc run --rm scheduler node daily-job.cjs
 */
import { runDailyJob } from "@/lib/daily-job";
import { getPool } from "@/db";

runDailyJob()
  .then(async (summary) => {
    console.log(new Date().toISOString(), "daily job", JSON.stringify(summary));
    await getPool().end();
  })
  .catch(async (err) => {
    console.error(new Date().toISOString(), "daily job failed", err);
    await getPool().end().catch(() => {});
    process.exit(1);
  });
