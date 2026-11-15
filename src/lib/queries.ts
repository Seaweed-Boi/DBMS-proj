import { query } from "./db";

/* Read models used by server-rendered pages and GET endpoints. */

export type Disaster = {
  disaster_id: number; title: string; disaster_type: string; severity_level: string;
  start_date: string; status: string; description: string | null;
  zone_count: number; affected_population: number; open_requests: number;
};

export function listDisasters() {
  return query<Disaster>(`
    SELECT d.*,
           COUNT(z.zone_id)::int                        AS zone_count,
           COALESCE(SUM(z.affected_population), 0)::int AS affected_population,
           (SELECT COUNT(*)::int FROM relief_requests r JOIN affected_zones z2 USING (zone_id)
             WHERE z2.disaster_id = d.disaster_id AND r.status IN ('PENDING','APPROVED','PARTIALLY_FULFILLED')) AS open_requests
      FROM disasters d
      LEFT JOIN affected_zones z ON z.disaster_id = d.disaster_id
     GROUP BY d.disaster_id
     ORDER BY CASE d.status WHEN 'ACTIVE' THEN 0 WHEN 'CONTAINED' THEN 1 ELSE 2 END,
              CASE d.severity_level WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MODERATE' THEN 2 ELSE 3 END,
              d.start_date DESC`);
}

export type Zone = {
  zone_id: number; disaster_id: number; disaster_title: string; zone_name: string; district: string;
  latitude: number | null; longitude: number | null; affected_population: number;
  urgency_score: number; status: string; open_requests: number; volunteers: number;
};

export function listZones(disasterId?: number) {
  return query<Zone>(`
    SELECT z.*, d.title AS disaster_title,
           (SELECT COUNT(*)::int FROM relief_requests r
             WHERE r.zone_id = z.zone_id AND r.status IN ('PENDING','APPROVED','PARTIALLY_FULFILLED')) AS open_requests,
           (SELECT COUNT(*)::int FROM volunteer_profiles v WHERE v.assigned_zone_id = z.zone_id) AS volunteers
      FROM affected_zones z JOIN disasters d USING (disaster_id)
     WHERE ($1::int IS NULL OR z.disaster_id = $1)
     ORDER BY z.urgency_score DESC, z.zone_name`, [disasterId ?? null]);
}

export type Centre = {
  centre_id: number; centre_name: string; address: string; district: string;
  total_capacity: number; current_occupancy: number; contact_phone: string; is_active: boolean;
  manager_id: number; manager_name: string; units_available: number; units_reserved: number;
  low_stock_batches: number; volunteers: number;
};

export function listCentres() {
  return query<Centre>(`
    SELECT rc.*, u.full_name AS manager_name,
           COALESCE(SUM(ci.quantity_available),0)::int AS units_available,
           COALESCE(SUM(ci.quantity_reserved),0)::int  AS units_reserved,
           COUNT(ci.inventory_id) FILTER (WHERE ci.quantity_available < ci.reorder_threshold)::int AS low_stock_batches,
           (SELECT COUNT(*)::int FROM volunteer_profiles v WHERE v.assigned_centre_id = rc.centre_id) AS volunteers
      FROM relief_centres rc
      JOIN users u ON u.user_id = rc.manager_id
      LEFT JOIN centre_inventory ci ON ci.centre_id = rc.centre_id
     GROUP BY rc.centre_id, u.full_name
     ORDER BY rc.is_active DESC, rc.centre_name`);
}

export function listCategories() {
  return query<{ category_id: number; category_name: string; unit_of_measure: string; is_perishable: boolean; item_count: number }>(`
    SELECT c.*, COUNT(i.item_id)::int AS item_count
      FROM resource_categories c LEFT JOIN resource_items i USING (category_id)
     GROUP BY c.category_id ORDER BY c.category_name`);
}

export type Item = {
  item_id: number; item_name: string; sku: string; description: string | null;
  category_id: number; category_name: string; unit_of_measure: string; is_perishable: boolean;
  total_available: number; total_reserved: number;
};

export function listItems() {
  return query<Item>(`
    SELECT i.*, c.category_name, c.unit_of_measure, c.is_perishable,
           COALESCE(SUM(ci.quantity_available),0)::int AS total_available,
           COALESCE(SUM(ci.quantity_reserved),0)::int  AS total_reserved
      FROM resource_items i
      JOIN resource_categories c USING (category_id)
      LEFT JOIN centre_inventory ci ON ci.item_id = i.item_id
     GROUP BY i.item_id, c.category_id
     ORDER BY c.category_name, i.item_name`);
}

export type InventoryRow = {
  inventory_id: number; centre_id: number; centre_name: string; item_id: number; item_name: string; sku: string;
  category_name: string; unit_of_measure: string; is_perishable: boolean;
  quantity_available: number; quantity_reserved: number; reorder_threshold: number;
  expiry_date: string | null; last_updated: string;
  is_expired: boolean; is_near_expiry: boolean; is_low_stock: boolean;
};

export function listInventory(f: { centreId?: number; itemId?: number; flag?: string } = {}) {
  return query<InventoryRow>(`
    SELECT * FROM v_inventory_health
     WHERE ($1::int IS NULL OR centre_id = $1)
       AND ($2::int IS NULL OR item_id = $2)
       AND ($3::text IS NULL
            OR ($3 = 'low'     AND is_low_stock AND NOT is_expired)
            OR ($3 = 'expiry'  AND is_near_expiry)
            OR ($3 = 'expired' AND is_expired))
     ORDER BY centre_name, category_name, item_name, expiry_date NULLS LAST`,
    [f.centreId ?? null, f.itemId ?? null, f.flag ?? null]);
}

export function inventoryAudit(inventoryId?: number, limit = 100) {
  return query<{
    log_id: number; inventory_id: number; change_type: string; quantity_delta: number; logged_at: string;
    changed_by_name: string | null; centre_name: string; item_name: string; expiry_date: string | null;
  }>(`
    SELECT l.log_id, l.inventory_id, l.change_type, l.quantity_delta, l.logged_at,
           u.full_name AS changed_by_name, rc.centre_name, ri.item_name, ci.expiry_date
      FROM inventory_audit_log l
      JOIN centre_inventory ci ON ci.inventory_id = l.inventory_id
      JOIN relief_centres rc   ON rc.centre_id = ci.centre_id
      JOIN resource_items ri   ON ri.item_id = ci.item_id
      LEFT JOIN users u        ON u.user_id = l.changed_by
     WHERE ($1::int IS NULL OR l.inventory_id = $1)
     ORDER BY l.logged_at DESC, l.log_id DESC
     LIMIT $2`, [inventoryId ?? null, limit]);
}

export type RequestRow = {
  request_id: number; zone_id: number; zone_name: string; district: string; disaster_title: string;
  item_id: number; item_name: string; unit_of_measure: string;
  quantity_requested: number; quantity_fulfilled: number; urgency_level: string; status: string;
  notes: string | null; created_at: string; requested_by: number; requested_by_name: string;
  priority_score: number; active_allocations: number;
};

export function listRequests(f: { status?: string; zoneId?: number; requestedBy?: number } = {}) {
  return query<RequestRow>(`
    SELECT r.*, z.zone_name, z.district, d.title AS disaster_title, ri.item_name, c.unit_of_measure,
           u.full_name AS requested_by_name, fn_request_priority(r.request_id) AS priority_score,
           (SELECT COUNT(*)::int FROM resource_allocations a
             WHERE a.request_id = r.request_id AND a.dispatch_status IN ('ALLOCATED','IN_TRANSIT')) AS active_allocations
      FROM relief_requests r
      JOIN affected_zones z       ON z.zone_id = r.zone_id
      JOIN disasters d            ON d.disaster_id = z.disaster_id
      JOIN resource_items ri      ON ri.item_id = r.item_id
      JOIN resource_categories c  ON c.category_id = ri.category_id
      JOIN users u                ON u.user_id = r.requested_by
     WHERE ($1::text IS NULL OR r.status = $1)
       AND ($2::int IS NULL OR r.zone_id = $2)
       AND ($3::int IS NULL OR r.requested_by = $3)
     ORDER BY r.created_at DESC`,
    [f.status ?? null, f.zoneId ?? null, f.requestedBy ?? null]);
}

export type AllocationRow = {
  allocation_id: number; request_id: number; centre_id: number; centre_name: string;
  item_id: number; item_name: string; zone_name: string; district: string;
  quantity_allocated: number; dispatch_status: string; allocated_at: string; delivered_at: string | null;
  approved_by_name: string; urgency_level: string; batches: { inventory_id: number; quantity: number; expiry_date: string | null }[];
};

export function listAllocations(f: { status?: string; centreId?: number; requestId?: number } = {}) {
  return query<AllocationRow>(`
    SELECT a.*, rc.centre_name, ri.item_name, z.zone_name, z.district, u.full_name AS approved_by_name, r.urgency_level,
           COALESCE((SELECT json_agg(json_build_object('inventory_id', ab.inventory_id, 'quantity', ab.quantity,
                                                       'expiry_date', ci.expiry_date) ORDER BY ci.expiry_date NULLS LAST)
                       FROM allocation_batches ab JOIN centre_inventory ci USING (inventory_id)
                      WHERE ab.allocation_id = a.allocation_id), '[]') AS batches
      FROM resource_allocations a
      JOIN relief_requests r  ON r.request_id = a.request_id
      JOIN affected_zones z   ON z.zone_id = r.zone_id
      JOIN relief_centres rc  ON rc.centre_id = a.centre_id
      JOIN resource_items ri  ON ri.item_id = a.item_id
      JOIN users u            ON u.user_id = a.approved_by
     WHERE ($1::text IS NULL OR a.dispatch_status = $1)
       AND ($2::int IS NULL OR a.centre_id = $2)
       AND ($3::int IS NULL OR a.request_id = $3)
     ORDER BY CASE a.dispatch_status WHEN 'ALLOCATED' THEN 0 WHEN 'IN_TRANSIT' THEN 1 ELSE 2 END,
              a.allocated_at DESC`,
    [f.status ?? null, f.centreId ?? null, f.requestId ?? null]);
}

export type VolunteerRow = {
  volunteer_id: number; full_name: string; email: string; phone: string | null;
  primary_skill: string; availability_status: string;
  assigned_centre_id: number | null; centre_name: string | null;
  assigned_zone_id: number | null; zone_name: string | null;
};

export function listVolunteers(f: { skill?: string; availability?: string } = {}) {
  return query<VolunteerRow>(`
    SELECT v.*, u.full_name, u.email, u.phone, rc.centre_name, z.zone_name
      FROM volunteer_profiles v
      JOIN users u ON u.user_id = v.volunteer_id
      LEFT JOIN relief_centres rc ON rc.centre_id = v.assigned_centre_id
      LEFT JOIN affected_zones z  ON z.zone_id = v.assigned_zone_id
     WHERE ($1::text IS NULL OR v.primary_skill = $1)
       AND ($2::text IS NULL OR v.availability_status = $2)
     ORDER BY CASE v.availability_status WHEN 'AVAILABLE' THEN 0 WHEN 'DEPLOYED' THEN 1 ELSE 2 END, u.full_name`,
    [f.skill ?? null, f.availability ?? null]);
}

export function listUsers() {
  return query<{
    user_id: number; full_name: string; email: string; phone: string | null; role: string; created_at: string;
    centres_managed: number; requests_submitted: number;
  }>(`
    SELECT u.user_id, u.full_name, u.email, u.phone, u.role, u.created_at,
           (SELECT COUNT(*)::int FROM relief_centres WHERE manager_id = u.user_id)  AS centres_managed,
           (SELECT COUNT(*)::int FROM relief_requests WHERE requested_by = u.user_id) AS requests_submitted
      FROM users u ORDER BY u.role, u.full_name`);
}

export function listUsersByRole(roles: string[]) {
  return query<{ user_id: number; full_name: string; role: string }>(
    "SELECT user_id, full_name, role FROM users WHERE role = ANY($1) ORDER BY full_name", [roles]);
}

// ---------------------------------------------------------------- reports

export function zoneFulfillment() {
  return query<{
    zone_id: number; zone_name: string; district: string; zone_status: string; urgency_score: number;
    affected_population: number; disaster_title: string; total_requests: number; fulfilled_requests: number;
    units_requested: number; units_fulfilled: number; fulfillment_pct: number | null;
  }>("SELECT * FROM v_zone_fulfillment ORDER BY urgency_score DESC");
}

export function dispatchSummary() {
  return query<{
    centre_id: number; centre_name: string; allocated: number; in_transit: number; delivered: number;
    cancelled: number; units_delivered: number; avg_delivery_hours: number | null;
  }>("SELECT * FROM v_dispatch_summary ORDER BY centre_name");
}

export function categoryStock() {
  return query<{
    category_name: string; unit_of_measure: string; available: number; reserved: number;
    low_stock_batches: number; near_expiry_units: number;
  }>(`
    SELECT category_name, unit_of_measure,
           SUM(quantity_available) FILTER (WHERE NOT is_expired)::int AS available,
           SUM(quantity_reserved)::int AS reserved,
           COUNT(*) FILTER (WHERE is_low_stock AND NOT is_expired)::int AS low_stock_batches,
           COALESCE(SUM(quantity_available) FILTER (WHERE is_near_expiry), 0)::int AS near_expiry_units
      FROM v_inventory_health
     GROUP BY category_name, unit_of_measure
     ORDER BY category_name`);
}

/** Request turnaround by urgency: time to first allocation and to final delivery. */
export function requestTurnaround() {
  return query<{
    urgency_level: string; requests: number; allocated_requests: number;
    avg_hours_to_first_allocation: number | null; avg_hours_to_delivery: number | null;
  }>(`
    WITH firsts AS (
      SELECT r.request_id, r.urgency_level, r.created_at,
             MIN(a.allocated_at) FILTER (WHERE a.dispatch_status <> 'CANCELLED') AS first_alloc,
             MAX(a.delivered_at) AS last_delivery
        FROM relief_requests r LEFT JOIN resource_allocations a USING (request_id)
       GROUP BY r.request_id
    )
    SELECT urgency_level,
           COUNT(*)::int AS requests,
           COUNT(first_alloc)::int AS allocated_requests,
           ROUND(AVG(EXTRACT(EPOCH FROM (first_alloc - created_at)) / 3600)::numeric, 1)   AS avg_hours_to_first_allocation,
           ROUND(AVG(EXTRACT(EPOCH FROM (last_delivery - created_at)) / 3600)::numeric, 1) AS avg_hours_to_delivery
      FROM firsts
     GROUP BY urgency_level
     ORDER BY CASE urgency_level WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END`);
}
