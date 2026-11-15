import Redis from "ioredis";
import { randomUUID } from "crypto";

/**
 * Redis key space (see docs/redis-design.md)
 *   drrms:queue:requests          ZSET   open request_id -> priority score
 *   drrms:lock:inventory:{c}:{i}  STRING allocation mutex for centre c / item i (PX expiry)
 *   drrms:kpi                     HASH   cached dashboard KPIs
 *   drrms:alerts:recent           LIST   last 50 alerts (JSON)
 *   drrms:alerted:lowstock:{inv}  STRING de-duplicates low-stock alerts per batch
 *   channel drrms:alerts          PUB/SUB live alert stream (low stock, SOS)
 */
export const KEYS = {
  queue: "drrms:queue:requests",
  kpi: "drrms:kpi",
  recentAlerts: "drrms:alerts:recent",
  alertChannel: "drrms:alerts",
  lock: (centreId: number, itemId: number) => `drrms:lock:inventory:${centreId}:${itemId}`,
  lowStockFlag: (inventoryId: number) => `drrms:alerted:lowstock:${inventoryId}`,
};

const globalForRedis = globalThis as unknown as { redis?: Redis };

function createClient(subscriber = false) {
  const client = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    // Command connection fails fast so callers fall back to PostgreSQL;
    // a subscriber queues SUBSCRIBE until the socket is ready.
    maxRetriesPerRequest: subscriber ? null : 1,
    enableOfflineQueue: subscriber,
    retryStrategy: (times) => Math.min(times * 500, 5000),
  });
  client.on("error", (err) => {
    if (process.env.NODE_ENV !== "test") console.warn("[redis]", err.message);
  });
  return client;
}

export const redis = globalForRedis.redis ?? createClient();
if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;

/** New dedicated connection (needed for SUBSCRIBE). Caller must quit() it. */
export function createSubscriber() {
  return createClient(true);
}

export function redisReady() {
  return redis.status === "ready";
}

/**
 * Execute a Redis operation, degrading gracefully if Redis is unavailable.
 * PostgreSQL remains the system of record, so callers fall back to it.
 */
export async function safeRedis<T>(fn: (r: Redis) => Promise<T>, fallback: T): Promise<T> {
  if (!redisReady()) return fallback;
  try {
    return await fn(redis);
  } catch (err) {
    console.warn("[redis] operation failed:", (err as Error).message);
    return fallback;
  }
}

// ---------------------------------------------------------------- locks

const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end`;

export class LockBusyError extends Error {
  status = 409;
  constructor(key: string) {
    super(`Inventory is being allocated by another user (${key}); please retry.`);
  }
}

/**
 * Acquire a short-lived distributed mutex (SET NX PX) and run `fn` while holding it.
 * If Redis is down, falls back to PostgreSQL row-level locking only.
 */
export async function withLock<T>(
  key: string,
  fn: () => Promise<T>,
  { ttlMs = 10_000, waitMs = 3_000 } = {},
): Promise<T> {
  if (!redisReady()) return fn();

  const token = randomUUID();
  const deadline = Date.now() + waitMs;
  let acquired = false;
  try {
    while (!acquired) {
      acquired = (await redis.set(key, token, "PX", ttlMs, "NX")) === "OK";
      if (acquired) break;
      if (Date.now() > deadline) throw new LockBusyError(key);
      await new Promise((r) => setTimeout(r, 50 + Math.random() * 50));
    }
  } catch (err) {
    if (err instanceof LockBusyError) throw err;
    console.warn("[redis] lock unavailable, relying on PostgreSQL row locks:", (err as Error).message);
    return fn();
  }

  try {
    return await fn();
  } finally {
    await redis.eval(RELEASE_SCRIPT, 1, key, token).catch(() => undefined);
  }
}
