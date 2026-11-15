-- =====================================================================
-- DRRMS sample queries: joins, aggregation, sub-queries, views,
-- window functions and stored procedures. Run against seeded data.
-- =====================================================================

-- 1. Open requests ranked by triage priority (view + function)
SELECT request_id, zone_name, item_name, quantity_outstanding, urgency_level, priority_score
FROM v_request_queue
ORDER BY priority_score DESC, created_at
LIMIT 10;

-- 2. Stock per centre and category (multi-table join + GROUP BY)
SELECT rc.centre_name, cat.category_name,
       SUM(ci.quantity_available) AS available, SUM(ci.quantity_reserved) AS reserved
FROM centre_inventory ci
JOIN relief_centres rc       ON rc.centre_id = ci.centre_id
JOIN resource_items ri       ON ri.item_id = ci.item_id
JOIN resource_categories cat ON cat.category_id = ri.category_id
GROUP BY ROLLUP (rc.centre_name, cat.category_name)
ORDER BY rc.centre_name NULLS LAST, cat.category_name NULLS LAST;

-- 3. FEFO order for one centre/item (what fn_allocate_resource consumes first)
SELECT inventory_id, expiry_date, quantity_available,
       SUM(quantity_available) OVER (ORDER BY expiry_date NULLS LAST, inventory_id) AS cumulative
FROM centre_inventory
WHERE centre_id = 1 AND item_id = 2 AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
ORDER BY expiry_date NULLS LAST, inventory_id;

-- 4. Zones whose requests are less than 50% fulfilled (view + HAVING-style filter)
SELECT zone_name, disaster_title, units_fulfilled, units_requested, fulfillment_pct
FROM v_zone_fulfillment
WHERE fulfillment_pct < 50
ORDER BY urgency_score DESC;

-- 5. Items requested but with no usable stock anywhere (NOT EXISTS)
SELECT DISTINCT ri.item_name
FROM relief_requests r JOIN resource_items ri USING (item_id)
WHERE r.status IN ('PENDING','APPROVED','PARTIALLY_FULFILLED')
  AND NOT EXISTS (SELECT 1 FROM centre_inventory ci
                  WHERE ci.item_id = r.item_id AND ci.quantity_available > 0
                    AND (ci.expiry_date IS NULL OR ci.expiry_date >= CURRENT_DATE));

-- 6. Available volunteers by skill vs. zones needing them (LEFT JOIN + FILTER)
SELECT primary_skill,
       COUNT(*) FILTER (WHERE availability_status = 'AVAILABLE') AS available,
       COUNT(*) FILTER (WHERE availability_status = 'DEPLOYED')  AS deployed,
       COUNT(*)                                                  AS total
FROM volunteer_profiles
GROUP BY primary_skill
ORDER BY available DESC;

-- 7. Complete stock movement history for a batch (append-only audit log)
SELECT l.logged_at, l.change_type, l.quantity_delta, u.full_name,
       SUM(l.quantity_delta) OVER (ORDER BY l.logged_at, l.log_id) AS running_total_moved
FROM inventory_audit_log l LEFT JOIN users u ON u.user_id = l.changed_by
WHERE l.inventory_id = 7
ORDER BY l.logged_at, l.log_id;

-- 8. Centre managers ranked by units delivered (RANK window function)
SELECT u.full_name, SUM(a.quantity_allocated) AS units_delivered,
       RANK() OVER (ORDER BY SUM(a.quantity_allocated) DESC) AS rnk
FROM resource_allocations a
JOIN relief_centres rc ON rc.centre_id = a.centre_id
JOIN users u           ON u.user_id = rc.manager_id
WHERE a.dispatch_status = 'DELIVERED'
GROUP BY u.full_name;

-- 9. Transaction demo: allocate, inspect, roll back
BEGIN;
  SELECT fn_allocate_resource(1, 1, 200, 1) AS allocation_id;  -- spans two FEFO batches
  SELECT * FROM allocation_batches ab
    JOIN centre_inventory ci USING (inventory_id)
   WHERE ab.allocation_id = currval(pg_get_serial_sequence('resource_allocations', 'allocation_id'));
ROLLBACK;

-- 10. Constraint demos (each statement fails)
-- UPDATE relief_centres SET current_occupancy = total_capacity + 1 WHERE centre_id = 1;  -- CHECK
-- UPDATE inventory_audit_log SET quantity_delta = 0 WHERE log_id = 1;                    -- trigger
-- SELECT fn_allocate_resource(1, 1, 100000, 1);                                         -- over-allocation
-- INSERT INTO volunteer_profiles VALUES (2, 'MEDICAL', 'AVAILABLE', NULL, NULL);        -- ISA role check
