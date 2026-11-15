import { queryOne } from "../db";
import { KEYS, safeRedis } from "../redis";

export type Kpis = {
  active_disasters: number;
  affected_population: number;
  open_requests: number;
  pending_critical_requests: number;
  total_allocated_units: number;
  units_in_pipeline: number;
  units_delivered: number;
  available_volunteers: number;
  deployed_volunteers: number;
  low_stock_batches: number;
  near_expiry_batches: number;
  shelter_occupancy_pct: number;
};

const KPI_TTL_SECONDS = 300;

export async function computeKpis(): Promise<Kpis> {
  const row = await queryOne<Kpis>(`
    SELECT
      (SELECT COUNT(*) FROM disasters WHERE status = 'ACTIVE')                                    AS active_disasters,
      (SELECT COALESCE(SUM(z.affected_population),0) FROM affected_zones z
         JOIN disasters d USING (disaster_id) WHERE d.status = 'ACTIVE' AND z.status <> 'CLEARED') AS affected_population,
      (SELECT COUNT(*) FROM relief_requests WHERE status IN ('PENDING','APPROVED','PARTIALLY_FULFILLED')) AS open_requests,
      (SELECT COUNT(*) FROM relief_requests
         WHERE urgency_level = 'CRITICAL' AND status IN ('PENDING','APPROVED','PARTIALLY_FULFILLED')) AS pending_critical_requests,
      (SELECT COALESCE(SUM(quantity_allocated),0) FROM resource_allocations
         WHERE dispatch_status <> 'CANCELLED')                                                     AS total_allocated_units,
      (SELECT COALESCE(SUM(quantity_allocated),0) FROM resource_allocations
         WHERE dispatch_status IN ('ALLOCATED','IN_TRANSIT'))                                      AS units_in_pipeline,
      (SELECT COALESCE(SUM(quantity_allocated),0) FROM resource_allocations
         WHERE dispatch_status = 'DELIVERED')                                                      AS units_delivered,
      (SELECT COUNT(*) FROM volunteer_profiles WHERE availability_status = 'AVAILABLE')            AS available_volunteers,
      (SELECT COUNT(*) FROM volunteer_profiles WHERE availability_status = 'DEPLOYED')             AS deployed_volunteers,
      (SELECT COUNT(*) FROM v_inventory_health WHERE is_low_stock AND NOT is_expired)               AS low_stock_batches,
      (SELECT COUNT(*) FROM v_inventory_health WHERE is_near_expiry AND quantity_available > 0)     AS near_expiry_batches,
      (SELECT COALESCE(ROUND(100.0 * SUM(current_occupancy) / NULLIF(SUM(total_capacity),0), 1), 0)
         FROM relief_centres WHERE is_active)                                                      AS shelter_occupancy_pct
  `);
  return row!;
}

/** Read-through cache: Redis HASH first, PostgreSQL on miss. */
export async function getKpis(): Promise<{ source: "redis" | "postgres"; kpis: Kpis }> {
  const cached = await safeRedis((r) => r.hgetall(KEYS.kpi), {} as Record<string, string>);
  if (Object.keys(cached).length > 0) {
    const kpis = Object.fromEntries(Object.entries(cached).map(([k, v]) => [k, Number(v)])) as Kpis;
    return { source: "redis", kpis };
  }
  const kpis = await computeKpis();
  await safeRedis(async (r) => {
    await r.multi().hset(KEYS.kpi, kpis as unknown as Record<string, number>).expire(KEYS.kpi, KPI_TTL_SECONDS).exec();
  }, undefined);
  return { source: "postgres", kpis };
}

/** Invalidate after any PostgreSQL write commit that affects dashboard numbers. */
export async function invalidateKpis() {
  await safeRedis((r) => r.del(KEYS.kpi), 0);
}
