/**
 * Rebuild every piece of derived Redis state from PostgreSQL.
 *   npm run redis:rebuild
 */
import "dotenv/config";
import { pool } from "@/lib/db";
import { redis } from "@/lib/redis";
import { rebuildQueue } from "@/lib/services/queue";
import { getKpis, invalidateKpis } from "@/lib/services/kpi";

async function main() {
  await new Promise<void>((resolve, reject) => {
    if (redis.status === "ready") return resolve();
    redis.once("ready", () => resolve());
    redis.once("error", reject);
  });
  if (process.argv.includes("--flush")) {
    // Drop all derived DRRMS keys (alert history, low-stock flags, locks, caches).
    let cursor = "0", removed = 0;
    do {
      const [next, keys] = await redis.scan(cursor, "MATCH", "drrms:*", "COUNT", 500);
      if (keys.length) removed += await redis.del(...keys);
      cursor = next;
    } while (cursor !== "0");
    console.log(`Flushed ${removed} drrms:* keys.`);
  }
  const queued = await rebuildQueue();
  await invalidateKpis();
  const { kpis } = await getKpis();
  console.log(`Urgency queue rebuilt with ${queued} open requests.`);
  console.log("KPI cache primed:", kpis);
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(async () => { await pool.end(); redis.disconnect(); });
