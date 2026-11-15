import { query } from "../db";
import { KEYS, safeRedis } from "../redis";

export type Alert = {
  id: string;
  type: "LOW_STOCK" | "CRITICAL_SOS" | "NEAR_EXPIRY";
  message: string;
  at: string;
  meta?: Record<string, unknown>;
};

/** Publish to the Pub/Sub channel and keep a capped history list. */
export async function publishAlert(alert: Omit<Alert, "id" | "at">) {
  const full: Alert = { ...alert, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, at: new Date().toISOString() };
  const payload = JSON.stringify(full);
  await safeRedis(async (r) => {
    await r.multi()
      .lpush(KEYS.recentAlerts, payload)
      .ltrim(KEYS.recentAlerts, 0, 49)
      .publish(KEYS.alertChannel, payload)
      .exec();
  }, undefined);
  return full;
}

export async function recentAlerts(limit = 20): Promise<Alert[]> {
  const raw = await safeRedis((r) => r.lrange(KEYS.recentAlerts, 0, limit - 1), [] as string[]);
  return raw.map((s) => JSON.parse(s) as Alert);
}

/**
 * Check batches of a (centre, item) pair and alert once per batch when it
 * drops below its reorder threshold. Restocking above threshold clears the flag.
 */
export async function checkLowStock(centreId: number, itemId: number) {
  const rows = await query<{
    inventory_id: number; centre_name: string; item_name: string;
    quantity_available: number; reorder_threshold: number; is_low_stock: boolean; is_expired: boolean;
  }>(
    `SELECT inventory_id, centre_name, item_name, quantity_available, reorder_threshold, is_low_stock, is_expired
       FROM v_inventory_health WHERE centre_id = $1 AND item_id = $2`,
    [centreId, itemId],
  );
  for (const b of rows) {
    const flag = KEYS.lowStockFlag(b.inventory_id);
    if (b.is_low_stock && !b.is_expired) {
      const first = await safeRedis((r) => r.set(flag, "1", "EX", 6 * 3600, "NX"), null);
      if (first === "OK") {
        await publishAlert({
          type: "LOW_STOCK",
          message: `${b.item_name} at ${b.centre_name} is down to ${b.quantity_available} (threshold ${b.reorder_threshold}).`,
          meta: { inventory_id: b.inventory_id, centre_id: centreId, item_id: itemId },
        });
      }
    } else {
      await safeRedis((r) => r.del(flag), 0);
    }
  }
}
