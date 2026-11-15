import { query, Queryable, pool } from "../db";
import { KEYS, safeRedis } from "../redis";

export type QueueEntry = {
  request_id: number;
  zone_id: number;
  zone_name: string;
  district: string;
  item_id: number;
  item_name: string;
  quantity_requested: number;
  quantity_fulfilled: number;
  quantity_outstanding: number;
  urgency_level: string;
  status: string;
  created_at: string;
  notes: string | null;
  requested_by_name: string;
  priority_score: number;
};

/**
 * Redis ZSET score: integer-encoded so it is exact in a double.
 *   high bits: priority (2 decimals)    low 30 bits: inverted age in minutes
 * Higher priority first; among equal priorities the older request first.
 */
const EPOCH_2020 = Date.UTC(2020, 0, 1);
const LOW_BITS = 2 ** 30;
export function redisScore(priority: number, createdAt: Date) {
  const minutes = Math.min(LOW_BITS - 1, Math.max(0, Math.floor((createdAt.getTime() - EPOCH_2020) / 60000)));
  return Math.round(priority * 100) * LOW_BITS + (LOW_BITS - 1 - minutes);
}

/** Re-sync one request's membership/score in the urgency ZSET after a commit. */
export async function syncRequest(requestId: number, client: Queryable = pool) {
  const [row] = await query<{ status: string; priority: number; created_at: Date }>(
    `SELECT status, fn_request_priority(request_id) AS priority, created_at
       FROM relief_requests WHERE request_id = $1`,
    [requestId],
    client,
  );
  await safeRedis(async (r) => {
    if (row && ["PENDING", "APPROVED", "PARTIALLY_FULFILLED"].includes(row.status)) {
      await r.zadd(KEYS.queue, redisScore(row.priority, row.created_at), String(requestId));
    } else {
      await r.zrem(KEYS.queue, String(requestId));
    }
  }, undefined);
}

/** Re-sync every open request belonging to a zone (after urgency / population edits). */
export async function syncZoneRequests(zoneId: number) {
  const rows = await query<{ request_id: number }>(
    "SELECT request_id FROM relief_requests WHERE zone_id = $1", [zoneId]);
  for (const r of rows) await syncRequest(r.request_id);
}

/** Rebuild the whole urgency queue from PostgreSQL. */
export async function rebuildQueue() {
  const rows = await query<{ request_id: number; priority_score: number; created_at: Date }>(
    "SELECT request_id, priority_score, created_at FROM v_request_queue");
  return safeRedis(async (r) => {
    const tx = r.multi().del(KEYS.queue);
    for (const row of rows) tx.zadd(KEYS.queue, redisScore(row.priority_score, row.created_at), String(row.request_id));
    await tx.exec();
    return rows.length;
  }, 0);
}

/**
 * Top-N most urgent open requests. Ranking comes from the Redis ZSET
 * (O(log N)); details are hydrated from PostgreSQL. Falls back to a
 * PostgreSQL ORDER BY when Redis is unavailable.
 */
export async function getQueue(limit = 50): Promise<{ source: "redis" | "postgres"; entries: QueueEntry[] }> {
  const ids = await safeRedis((r) => r.zrevrange(KEYS.queue, 0, limit - 1), null as string[] | null);
  if (ids) {
    if (ids.length === 0) return { source: "redis", entries: [] };
    const rows = await query<QueueEntry>(
      "SELECT * FROM v_request_queue WHERE request_id = ANY($1::int[])", [ids.map(Number)]);
    const byId = new Map(rows.map((r) => [r.request_id, r]));
    return { source: "redis", entries: ids.map((id) => byId.get(Number(id))).filter(Boolean) as QueueEntry[] };
  }
  const rows = await query<QueueEntry>(
    "SELECT * FROM v_request_queue ORDER BY priority_score DESC, created_at ASC LIMIT $1", [limit]);
  return { source: "postgres", entries: rows };
}
