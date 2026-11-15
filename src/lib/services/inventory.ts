import { query, queryOne, withTransaction } from "../db";
import { KEYS, withLock } from "../redis";
import type { SessionUser } from "../auth";
import { assertCentreAccess } from "./access";
import { invalidateKpis } from "./kpi";
import { checkLowStock } from "./alerts";
import { HttpError } from "../api";

export async function restock(
  user: SessionUser,
  input: { centre_id: number; item_id: number; quantity: number; expiry_date?: string | null; reorder_threshold?: number | null },
) {
  await assertCentreAccess(user, input.centre_id);
  const id = await withLock(KEYS.lock(input.centre_id, input.item_id), () =>
    withTransaction(async (c) => {
      const [row] = await query<{ id: number }>(
        "SELECT fn_restock($1, $2, $3, $4, $5, $6) AS id",
        [input.centre_id, input.item_id, input.quantity, input.expiry_date || null, user.id, input.reorder_threshold ?? null],
        c,
      );
      return row.id;
    }),
  );
  await Promise.all([invalidateKpis(), checkLowStock(input.centre_id, input.item_id)]);
  return id;
}

export async function adjustStock(
  user: SessionUser,
  inventoryId: number,
  input: { delta?: number; reorder_threshold?: number },
) {
  const batch = await queryOne<{ centre_id: number; item_id: number }>(
    "SELECT centre_id, item_id FROM centre_inventory WHERE inventory_id = $1", [inventoryId]);
  if (!batch) throw new HttpError(404, `Inventory batch ${inventoryId} not found`);
  await assertCentreAccess(user, batch.centre_id);

  await withLock(KEYS.lock(batch.centre_id, batch.item_id), () =>
    withTransaction(async (c) => {
      if (input.delta) await c.query("SELECT fn_adjust_stock($1, $2, $3)", [inventoryId, input.delta, user.id]);
      if (input.reorder_threshold !== undefined) {
        await c.query("UPDATE centre_inventory SET reorder_threshold = $2 WHERE inventory_id = $1",
          [inventoryId, input.reorder_threshold]);
      }
    }),
  );
  await Promise.all([invalidateKpis(), checkLowStock(batch.centre_id, batch.item_id)]);
}
