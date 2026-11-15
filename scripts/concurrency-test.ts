/**
 * Concurrency test for the atomic FEFO allocation path.
 *
 * Fires many simultaneous allocations against the same centre/item and
 * asserts that stock is never over-allocated and that every invariant holds.
 * Runs twice: with the Redis mutex, and with PostgreSQL row locks only.
 * All allocations it makes are cancelled afterwards, restoring stock.
 *
 *   npm run test:concurrency
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { pool, query, queryOne } from "@/lib/db";
import { redis } from "@/lib/redis";
import { allocate, updateDispatchStatus } from "@/lib/services/allocation";
import type { SessionUser } from "@/lib/auth";

const ATTEMPTS = 25;
const EACH = 5;

async function waitForRedis() {
  if (redis.status === "ready") return;
  await new Promise((r) => { redis.once("ready", r); setTimeout(r, 2000); });
}

async function scenario(name: string, admin: SessionUser) {
  // Pick the centre/item batch set with the most usable stock that fits the test.
  const target = await queryOne<{ centre_id: number; item_id: number; usable: number }>(`
    SELECT centre_id, item_id, SUM(quantity_available)::int AS usable
      FROM centre_inventory ci JOIN relief_centres rc USING (centre_id)
     WHERE rc.is_active AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
     GROUP BY centre_id, item_id
    HAVING SUM(quantity_available) BETWEEN 10 AND ${ATTEMPTS * EACH - 1}
     ORDER BY usable DESC LIMIT 1`);
  assert(target, "No suitable centre/item stock found — run npm run db:reset first");

  const zone = await queryOne<{ zone_id: number }>("SELECT zone_id FROM affected_zones ORDER BY zone_id LIMIT 1");
  const req = await queryOne<{ request_id: number }>(
    `INSERT INTO relief_requests (zone_id, requested_by, item_id, quantity_requested, urgency_level, notes)
     VALUES ($1, $2, $3, $4, 'CRITICAL', 'concurrency test') RETURNING request_id`,
    [zone!.zone_id, admin.id, target.item_id, ATTEMPTS * EACH]);
  const requestId = req!.request_id;

  const before = await queryOne<{ avail: number; reserved: number }>(
    `SELECT SUM(quantity_available)::int AS avail, SUM(quantity_reserved)::int AS reserved
       FROM centre_inventory WHERE centre_id = $1 AND item_id = $2`, [target.centre_id, target.item_id]);

  const t0 = Date.now();
  const results = await Promise.allSettled(
    Array.from({ length: ATTEMPTS }, () => allocate(admin, requestId, target.centre_id, EACH)));
  const ms = Date.now() - t0;

  const ok = results.filter((r) => r.status === "fulfilled").length;
  const expected = Math.floor(target.usable / EACH);

  const after = await queryOne<{ avail: number; reserved: number }>(
    `SELECT SUM(quantity_available)::int AS avail, SUM(quantity_reserved)::int AS reserved
       FROM centre_inventory WHERE centre_id = $1 AND item_id = $2`, [target.centre_id, target.item_id]);
  const fulfilled = await queryOne<{ q: number }>("SELECT quantity_fulfilled AS q FROM relief_requests WHERE request_id = $1", [requestId]);

  console.log(`\n[${name}] centre ${target.centre_id}, item ${target.item_id}, usable ${target.usable}`);
  console.log(`  ${ATTEMPTS} concurrent × ${EACH} units -> ${ok} succeeded, ${ATTEMPTS - ok} rejected in ${ms} ms`);

  assert.equal(ok, expected, `expected exactly ${expected} successful allocations`);
  assert.equal(after!.avail, before!.avail - ok * EACH, "available stock mismatch");
  assert.equal(after!.reserved, before!.reserved + ok * EACH, "reserved stock mismatch");
  assert.equal(fulfilled!.q, ok * EACH, "request fulfilment mismatch");
  assert(after!.avail >= 0, "negative stock!");

  // Clean up: cancel every allocation we made (exercises the rollback path), then reject the request.
  const allocs = await query<{ allocation_id: number }>("SELECT allocation_id FROM resource_allocations WHERE request_id = $1", [requestId]);
  await Promise.all(allocs.map((a) => updateDispatchStatus(admin, a.allocation_id, "CANCELLED")));
  const restored = await queryOne<{ avail: number; reserved: number }>(
    `SELECT SUM(quantity_available)::int AS avail, SUM(quantity_reserved)::int AS reserved
       FROM centre_inventory WHERE centre_id = $1 AND item_id = $2`, [target.centre_id, target.item_id]);
  assert.deepEqual(restored, before, "cancellation did not restore stock");
  await query("UPDATE relief_requests SET status = 'REJECTED', notes = 'concurrency test (cleaned up)' WHERE request_id = $1", [requestId]);
  await redis.zrem("drrms:queue:requests", String(requestId)).catch(() => undefined);
  console.log("  invariants hold ✓  (stock restored by cancellation ✓)");
}

async function main() {
  await waitForRedis();
  const admin = await queryOne<{ user_id: number }>("SELECT user_id FROM users WHERE role = 'ADMIN' ORDER BY user_id LIMIT 1");
  const user: SessionUser = { id: admin!.user_id, role: "ADMIN", name: "test" };

  if (redis.status === "ready") await scenario("Redis mutex + PostgreSQL row locks", user);
  else console.log("Redis not reachable — skipping Redis-lock scenario");

  redis.disconnect(); // force the PostgreSQL-only path
  await new Promise((r) => setTimeout(r, 100));
  await scenario("PostgreSQL row locks only (Redis offline)", user);
  console.log("\nAll concurrency checks passed.");
}

main()
  .catch((err) => { console.error("\nFAILED:", err.message ?? err); process.exitCode = 1; })
  .finally(async () => { await pool.end(); redis.disconnect(); });
