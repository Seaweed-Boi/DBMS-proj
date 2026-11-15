import { query, queryOne, withTransaction } from "../db";
import { KEYS, withLock } from "../redis";
import { HttpError } from "../api";
import type { SessionUser } from "../auth";
import { assertCentreAccess } from "./access";
import { syncRequest } from "./queue";
import { invalidateKpis } from "./kpi";
import { checkLowStock } from "./alerts";

/**
 * Allocation workflow (report §5, §9):
 *  1. Acquire Redis mutex on the (centre, item) pair.
 *  2. Run fn_allocate_resource in one PostgreSQL transaction (FEFO, row locks, audit).
 *  3. After COMMIT: update urgency queue, invalidate KPI cache, raise low-stock alerts.
 */
export async function allocate(user: SessionUser, requestId: number, centreId: number, quantity: number) {
  const req = await queryOne<{ item_id: number }>("SELECT item_id FROM relief_requests WHERE request_id = $1", [requestId]);
  if (!req) throw new HttpError(404, `Request ${requestId} not found`);
  await assertCentreAccess(user, centreId);

  const allocationId = await withLock(KEYS.lock(centreId, req.item_id), () =>
    withTransaction(async (c) => {
      const [row] = await query<{ id: number }>(
        "SELECT fn_allocate_resource($1, $2, $3, $4) AS id", [requestId, centreId, quantity, user.id], c);
      return row.id;
    }),
  );

  await Promise.all([syncRequest(requestId), invalidateKpis(), checkLowStock(centreId, req.item_id)]);
  return allocationId;
}

export async function updateDispatchStatus(user: SessionUser, allocationId: number, status: string) {
  const alloc = await queryOne<{ centre_id: number; item_id: number; request_id: number }>(
    "SELECT centre_id, item_id, request_id FROM resource_allocations WHERE allocation_id = $1", [allocationId]);
  if (!alloc) throw new HttpError(404, `Allocation ${allocationId} not found`);
  await assertCentreAccess(user, alloc.centre_id);

  await withLock(KEYS.lock(alloc.centre_id, alloc.item_id), () =>
    withTransaction((c) => c.query("SELECT fn_update_dispatch_status($1, $2, $3)", [allocationId, status, user.id])),
  );

  await Promise.all([syncRequest(alloc.request_id), invalidateKpis(), checkLowStock(alloc.centre_id, alloc.item_id)]);
}

/** Centres that can supply a request, with usable (non-expired) stock, FEFO-ordered expiry. */
export async function eligibleCentres(requestId: number) {
  return query<{
    centre_id: number; centre_name: string; district: string; usable_quantity: number;
    batches: number; earliest_expiry: string | null; same_district: boolean;
  }>(
    `SELECT rc.centre_id, rc.centre_name, rc.district,
            SUM(ci.quantity_available)::int AS usable_quantity,
            COUNT(*)::int AS batches,
            MIN(ci.expiry_date) AS earliest_expiry,
            rc.district = z.district AS same_district
       FROM relief_requests r
       JOIN affected_zones z    ON z.zone_id = r.zone_id
       JOIN centre_inventory ci ON ci.item_id = r.item_id
       JOIN relief_centres rc   ON rc.centre_id = ci.centre_id AND rc.is_active
      WHERE r.request_id = $1 AND ci.quantity_available > 0
        AND (ci.expiry_date IS NULL OR ci.expiry_date >= CURRENT_DATE)
      GROUP BY rc.centre_id, z.district
      ORDER BY same_district DESC, usable_quantity DESC`,
    [requestId],
  );
}
