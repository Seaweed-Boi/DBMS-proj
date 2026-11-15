/**
 * Apply SQL files without needing the psql CLI.
 *   npm run db:schema | db:seed | db:reset
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

const FILES: Record<string, string[]> = {
  schema: ["schema.sql"],
  seed: ["seed.sql"],
  reset: ["schema.sql", "seed.sql"],
};

async function main() {
  const mode = process.argv[2] ?? "reset";
  const files = FILES[mode];
  if (!files) throw new Error(`Unknown mode "${mode}" (use schema | seed | reset)`);
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set (copy .env.example to .env)");

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  client.on("notice", () => undefined); // silence DROP ... IF EXISTS notices
  try {
    for (const f of files) {
      const sql = readFileSync(join(__dirname, "..", "db", f), "utf8");
      await client.query(sql);
      console.log(`applied db/${f}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => { console.error(err.message ?? err); process.exitCode = 1; });
