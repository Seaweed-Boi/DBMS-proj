# Normalisation Proof (1NF → 2NF → 3NF)

## Functional dependencies

Each table's primary key determines all of its non-key attributes. The dependencies below are the
ones that matter for the proof.

| Relation | Key | Non-trivial FDs |
|---|---|---|
| users | user_id | user_id → full_name, email, password_hash, phone, role, created_at; **email → user_id** (candidate key) |
| disasters | disaster_id | disaster_id → title, disaster_type, severity_level, start_date, status, description |
| affected_zones | zone_id | zone_id → disaster_id, zone_name, district, latitude, longitude, affected_population, urgency_score, status; (disaster_id, zone_name) → zone_id |
| relief_centres | centre_id | centre_id → manager_id, centre_name, address, district, total_capacity, current_occupancy, contact_phone, is_active; centre_name → centre_id |
| resource_categories | category_id | category_id → category_name, unit_of_measure, is_perishable; category_name → category_id |
| resource_items | item_id | item_id → category_id, item_name, sku, description; sku → item_id |
| centre_inventory | inventory_id | inventory_id → centre_id, item_id, expiry_date, quantity_available, quantity_reserved, reorder_threshold, last_updated; **(centre_id, item_id, expiry_date) → inventory_id** |
| relief_requests | request_id | request_id → zone_id, requested_by, item_id, quantity_requested, quantity_fulfilled, urgency_level, notes, status, created_at |
| resource_allocations | allocation_id | allocation_id → request_id, centre_id, item_id, approved_by, quantity_allocated, dispatch_status, allocated_at, delivered_at |
| allocation_batches | (allocation_id, inventory_id) | (allocation_id, inventory_id) → quantity |
| volunteer_profiles | volunteer_id | volunteer_id → primary_skill, availability_status, assigned_centre_id, assigned_zone_id |
| inventory_audit_log | log_id | log_id → inventory_id, changed_by, change_type, quantity_delta, logged_at |

## 1NF

- Every column holds a single atomic value: no arrays, no comma-separated lists, no repeating groups.
- Values that could have been multi-valued are split into their own rows:
  - Stock across centres is one `centre_inventory` row per (centre, item, expiry) batch.
  - An allocation that spans batches is one `allocation_batches` row per batch.
  - Each request asks for one item; several items means several requests.
- Every relation has a primary key.

## 2NF (no partial dependencies)

All but one of the relations have a single-column surrogate key, so a partial dependency is
impossible. The key cases are:

- **`allocation_batches (allocation_id, inventory_id)`**. Its only non-key attribute is `quantity`,
  which depends on the whole key: how much *this* allocation took from *this* batch.
- **`centre_inventory`** has the composite candidate key `(centre_id, item_id, expiry_date)`.
  `quantity_available`, `quantity_reserved`, `reorder_threshold` and `last_updated` describe a
  specific batch, so they depend on all three columns.
  - Item facts that depend only on `item_id` (`item_name`, `sku`, `category_id`) are kept in
    `resource_items`, not repeated here. That removes the partial dependency `item_id → item_name`.
  - Centre facts that depend only on `centre_id` (`centre_name`, `district`) are kept in
    `relief_centres`.

## 3NF (no transitive dependencies)

For every FD X → A, either X is a superkey or A is a prime attribute.

- **`unit_of_measure` and `is_perishable` depend on the category.** Storing them on
  `resource_items` would create item_id → category_id → unit_of_measure, so they live only in
  `resource_categories`.
- **The disaster's severity and type** belong to `disasters`. A zone refers to them through
  `disaster_id` and does not copy them.
- **Manager details** (name, phone) live in `users`. `relief_centres` stores only `manager_id`.
- **Volunteer attributes** live in `volunteer_profiles`, the 1:1 ISA subtype of `users`. Only
  volunteers have them, so `users` has no nullable skill/assignment columns.
- **`resource_allocations.item_id`** could be derived through `request_id → item_id`. Strictly,
  this is a transitive dependency. It is kept as a deliberate, controlled redundancy, as the report
  schema specifies, because it is the item that was actually dispatched and it is the key used to
  lock and index the stock movement. `fn_allocate_resource` always copies it from the request, and
  no code path updates `request_id` or `item_id` on an existing allocation, so the two cannot
  disagree. A fully 3NF variant would drop the column and join through `relief_requests`.

## Derived values that are *not* stored

These are computed in views or functions and are never persisted, to avoid update anomalies:

- Request priority: `fn_request_priority`, cached only in Redis.
- Fulfilment percentage per zone: `v_zone_fulfillment`.
- Low-stock, near-expiry and expired flags: `v_inventory_health`.
- Delivery-time statistics: `v_dispatch_summary`.

`urgency_score` on a zone is stored because it is an operator-adjusted input, not a pure function
of other columns. The trigger only supplies a default on insert.
