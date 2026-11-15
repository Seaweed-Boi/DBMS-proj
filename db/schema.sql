-- =====================================================================
-- Disaster Relief Resource Management System (DRRMS)
-- PostgreSQL schema — normalized to 3NF (see docs/normalization.md)
--
-- Run:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/schema.sql
-- This script is idempotent: it drops and recreates every object.
-- =====================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- used by seed.sql for bcrypt hashes

DROP VIEW  IF EXISTS v_inventory_health, v_zone_fulfillment, v_request_queue,
                     v_centre_stock_summary, v_dispatch_summary CASCADE;
DROP TABLE IF EXISTS allocation_batches, inventory_audit_log, volunteer_profiles,
                     resource_allocations, relief_requests, centre_inventory,
                     resource_items, resource_categories, relief_centres,
                     affected_zones, disasters, users CASCADE;

-- ---------------------------------------------------------------------
-- Table 1: USERS
-- ---------------------------------------------------------------------
CREATE TABLE users (
    user_id        INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    full_name      VARCHAR(120) NOT NULL,
    email          VARCHAR(150) NOT NULL UNIQUE,
    password_hash  TEXT         NOT NULL,
    phone          VARCHAR(20),
    role           VARCHAR(20)  NOT NULL
                   CHECK (role IN ('ADMIN', 'CENTRE_MANAGER', 'COORDINATOR', 'VOLUNTEER')),
    created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT users_email_lowercase CHECK (email = lower(email))
);

-- ---------------------------------------------------------------------
-- Table 2: DISASTERS
-- ---------------------------------------------------------------------
CREATE TABLE disasters (
    disaster_id     INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title           VARCHAR(150) NOT NULL,
    disaster_type   VARCHAR(30)  NOT NULL
                    CHECK (disaster_type IN ('FLOOD', 'EARTHQUAKE', 'CYCLONE', 'FIRE', 'LANDSLIDE')),
    severity_level  VARCHAR(20)  NOT NULL
                    CHECK (severity_level IN ('LOW', 'MODERATE', 'HIGH', 'CRITICAL')),
    start_date      DATE         NOT NULL,
    status          VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE'
                    CHECK (status IN ('ACTIVE', 'CONTAINED', 'RESOLVED')),
    description     TEXT
);

-- ---------------------------------------------------------------------
-- Table 3: AFFECTED_ZONES  (total participation in DISASTER 1:N)
-- ---------------------------------------------------------------------
CREATE TABLE affected_zones (
    zone_id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    disaster_id          INTEGER      NOT NULL
                         REFERENCES disasters(disaster_id) ON DELETE CASCADE,
    zone_name            VARCHAR(120) NOT NULL,
    district             VARCHAR(100) NOT NULL,
    latitude             DECIMAL(9,6) CHECK (latitude  BETWEEN -90  AND 90),
    longitude            DECIMAL(9,6) CHECK (longitude BETWEEN -180 AND 180),
    affected_population  INTEGER      NOT NULL CHECK (affected_population >= 0),
    urgency_score        DECIMAL(5,2) NOT NULL DEFAULT 0.00
                         CHECK (urgency_score BETWEEN 0 AND 100),
    status               VARCHAR(20)  NOT NULL DEFAULT 'CRITICAL'
                         CHECK (status IN ('CRITICAL', 'ACTIVE', 'STABILISED', 'CLEARED')),
    UNIQUE (disaster_id, zone_name)
);

-- ---------------------------------------------------------------------
-- Table 4: RELIEF_CENTRES
-- ---------------------------------------------------------------------
CREATE TABLE relief_centres (
    centre_id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    manager_id         INTEGER      NOT NULL REFERENCES users(user_id),
    centre_name        VARCHAR(150) NOT NULL UNIQUE,
    address            TEXT         NOT NULL,
    district           VARCHAR(100) NOT NULL,
    total_capacity     INTEGER      NOT NULL CHECK (total_capacity > 0),
    current_occupancy  INTEGER      NOT NULL DEFAULT 0,
    contact_phone      VARCHAR(20)  NOT NULL,
    is_active          BOOLEAN      NOT NULL DEFAULT TRUE,
    CONSTRAINT centre_occupancy_bounds
        CHECK (current_occupancy >= 0 AND current_occupancy <= total_capacity)
);

-- ---------------------------------------------------------------------
-- Table 5: RESOURCE_CATEGORIES
-- ---------------------------------------------------------------------
CREATE TABLE resource_categories (
    category_id      INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    category_name    VARCHAR(80) NOT NULL UNIQUE,
    unit_of_measure  VARCHAR(30) NOT NULL,
    is_perishable    BOOLEAN     NOT NULL DEFAULT FALSE
);

-- ---------------------------------------------------------------------
-- Table 6: RESOURCE_ITEMS
-- ---------------------------------------------------------------------
CREATE TABLE resource_items (
    item_id      INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    category_id  INTEGER      NOT NULL REFERENCES resource_categories(category_id),
    item_name    VARCHAR(120) NOT NULL,
    sku          VARCHAR(50)  NOT NULL UNIQUE,
    description  TEXT
);

-- ---------------------------------------------------------------------
-- Table 7: CENTRE_INVENTORY  (associative entity resolving CENTRE M:N ITEM)
-- One row per (centre, item, expiry) batch.
-- ---------------------------------------------------------------------
CREATE TABLE centre_inventory (
    inventory_id        INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    centre_id           INTEGER   NOT NULL REFERENCES relief_centres(centre_id) ON DELETE CASCADE,
    item_id             INTEGER   NOT NULL REFERENCES resource_items(item_id),
    quantity_available  INTEGER   NOT NULL DEFAULT 0 CHECK (quantity_available >= 0),
    quantity_reserved   INTEGER   NOT NULL DEFAULT 0 CHECK (quantity_reserved  >= 0),
    reorder_threshold   INTEGER   NOT NULL DEFAULT 10 CHECK (reorder_threshold >= 0),
    expiry_date         DATE,
    last_updated        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT centre_inventory_batch_unique
        UNIQUE NULLS NOT DISTINCT (centre_id, item_id, expiry_date)
);

-- ---------------------------------------------------------------------
-- Table 8: RELIEF_REQUESTS
-- ---------------------------------------------------------------------
CREATE TABLE relief_requests (
    request_id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    zone_id             INTEGER     NOT NULL REFERENCES affected_zones(zone_id),
    requested_by        INTEGER     NOT NULL REFERENCES users(user_id),
    item_id             INTEGER     NOT NULL REFERENCES resource_items(item_id),
    quantity_requested  INTEGER     NOT NULL CHECK (quantity_requested > 0),
    quantity_fulfilled  INTEGER     NOT NULL DEFAULT 0,
    urgency_level       VARCHAR(20) NOT NULL
                        CHECK (urgency_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    notes               TEXT,
    status              VARCHAR(25) NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING', 'APPROVED', 'PARTIALLY_FULFILLED', 'FULFILLED', 'REJECTED')),
    created_at          TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT request_fulfilment_bounds
        CHECK (quantity_fulfilled >= 0 AND quantity_fulfilled <= quantity_requested)
);

-- ---------------------------------------------------------------------
-- Table 9: RESOURCE_ALLOCATIONS
-- ---------------------------------------------------------------------
CREATE TABLE resource_allocations (
    allocation_id       INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    request_id          INTEGER     NOT NULL REFERENCES relief_requests(request_id),
    centre_id           INTEGER     NOT NULL REFERENCES relief_centres(centre_id),
    item_id             INTEGER     NOT NULL REFERENCES resource_items(item_id),
    approved_by         INTEGER     NOT NULL REFERENCES users(user_id),
    quantity_allocated  INTEGER     NOT NULL CHECK (quantity_allocated > 0),
    dispatch_status     VARCHAR(20) NOT NULL DEFAULT 'ALLOCATED'
                        CHECK (dispatch_status IN ('ALLOCATED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED')),
    allocated_at        TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    delivered_at        TIMESTAMP,
    CONSTRAINT allocation_delivered_at_consistent
        CHECK ((dispatch_status = 'DELIVERED') = (delivered_at IS NOT NULL))
);

-- ---------------------------------------------------------------------
-- Implementation table: ALLOCATION_BATCHES
-- Records which FEFO batches (centre_inventory rows) supplied each
-- allocation, so delivery / cancellation can settle the exact batches.
-- Weak entity of RESOURCE_ALLOCATIONS; key = (allocation_id, inventory_id).
-- ---------------------------------------------------------------------
CREATE TABLE allocation_batches (
    allocation_id  INTEGER NOT NULL REFERENCES resource_allocations(allocation_id) ON DELETE CASCADE,
    inventory_id   INTEGER NOT NULL REFERENCES centre_inventory(inventory_id),
    quantity       INTEGER NOT NULL CHECK (quantity > 0),
    PRIMARY KEY (allocation_id, inventory_id)
);

-- ---------------------------------------------------------------------
-- Table 10: VOLUNTEER_PROFILES  (1:1 ISA specialisation of USERS)
-- ---------------------------------------------------------------------
CREATE TABLE volunteer_profiles (
    volunteer_id         INTEGER     PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    primary_skill        VARCHAR(30) NOT NULL
                         CHECK (primary_skill IN ('MEDICAL', 'LOGISTICS', 'RESCUE', 'SHELTER', 'GENERAL')),
    availability_status  VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE'
                         CHECK (availability_status IN ('AVAILABLE', 'DEPLOYED', 'ON_LEAVE')),
    assigned_centre_id   INTEGER REFERENCES relief_centres(centre_id) ON DELETE SET NULL,
    assigned_zone_id     INTEGER REFERENCES affected_zones(zone_id)  ON DELETE SET NULL
);

-- ---------------------------------------------------------------------
-- Table 11: INVENTORY_AUDIT_LOG  (append-only)
-- ---------------------------------------------------------------------
CREATE TABLE inventory_audit_log (
    log_id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    inventory_id    INTEGER     NOT NULL REFERENCES centre_inventory(inventory_id),
    changed_by      INTEGER     REFERENCES users(user_id),
    change_type     VARCHAR(20) NOT NULL
                    CHECK (change_type IN ('RESTOCK', 'RESERVE', 'DISPATCH', 'ADJUSTMENT')),
    quantity_delta  INTEGER     NOT NULL CHECK (quantity_delta <> 0),
    logged_at       TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------
-- Indexes (FK lookups + hot query paths)
-- ---------------------------------------------------------------------
CREATE INDEX idx_zones_disaster        ON affected_zones (disaster_id);
CREATE INDEX idx_centres_manager       ON relief_centres (manager_id);
CREATE INDEX idx_items_category        ON resource_items (category_id);
CREATE INDEX idx_inventory_item        ON centre_inventory (item_id);
CREATE INDEX idx_inventory_fefo        ON centre_inventory (centre_id, item_id, expiry_date NULLS LAST);
CREATE INDEX idx_requests_zone         ON relief_requests (zone_id);
CREATE INDEX idx_requests_item         ON relief_requests (item_id);
CREATE INDEX idx_requests_open         ON relief_requests (status)
    WHERE status IN ('PENDING', 'APPROVED', 'PARTIALLY_FULFILLED');
CREATE INDEX idx_allocations_request   ON resource_allocations (request_id);
CREATE INDEX idx_allocations_centre    ON resource_allocations (centre_id);
CREATE INDEX idx_allocations_status    ON resource_allocations (dispatch_status);
CREATE INDEX idx_volunteers_skill      ON volunteer_profiles (primary_skill, availability_status);
CREATE INDEX idx_audit_inventory       ON inventory_audit_log (inventory_id, logged_at DESC);

-- =====================================================================
-- Triggers — integrity rules that CHECK constraints cannot express
-- =====================================================================

-- Relief centres may only be managed by CENTRE_MANAGER or ADMIN users.
CREATE OR REPLACE FUNCTION trg_check_centre_manager() RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM users
                   WHERE user_id = NEW.manager_id AND role IN ('CENTRE_MANAGER', 'ADMIN')) THEN
        RAISE EXCEPTION 'User % is not a centre manager or admin', NEW.manager_id
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER centre_manager_role
    BEFORE INSERT OR UPDATE OF manager_id ON relief_centres
    FOR EACH ROW EXECUTE FUNCTION trg_check_centre_manager();

-- ISA constraint: only VOLUNTEER users may own a volunteer profile.
CREATE OR REPLACE FUNCTION trg_check_volunteer_role() RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM users WHERE user_id = NEW.volunteer_id AND role = 'VOLUNTEER') THEN
        RAISE EXCEPTION 'User % does not hold the VOLUNTEER role', NEW.volunteer_id
            USING ERRCODE = 'check_violation';
    END IF;
    -- Deployment status follows assignment.
    IF NEW.availability_status = 'ON_LEAVE' THEN
        NEW.assigned_centre_id := NULL;
        NEW.assigned_zone_id   := NULL;
    ELSIF NEW.assigned_centre_id IS NOT NULL OR NEW.assigned_zone_id IS NOT NULL THEN
        NEW.availability_status := 'DEPLOYED';
    ELSE
        NEW.availability_status := 'AVAILABLE';
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER volunteer_role_isa
    BEFORE INSERT OR UPDATE ON volunteer_profiles
    FOR EACH ROW EXECUTE FUNCTION trg_check_volunteer_role();

-- Requesters must be coordinators or admins.
CREATE OR REPLACE FUNCTION trg_check_requester() RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM users
                   WHERE user_id = NEW.requested_by AND role IN ('COORDINATOR', 'ADMIN', 'CENTRE_MANAGER')) THEN
        RAISE EXCEPTION 'User % may not submit relief requests', NEW.requested_by
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER request_requester_role
    BEFORE INSERT ON relief_requests
    FOR EACH ROW EXECUTE FUNCTION trg_check_requester();

-- Default zone urgency score when not supplied:
--   disaster severity weight (20..80) + population factor (0..20)
CREATE OR REPLACE FUNCTION trg_default_zone_urgency() RETURNS trigger AS $$
DECLARE
    sev VARCHAR(20);
BEGIN
    IF NEW.urgency_score IS NULL OR NEW.urgency_score = 0 THEN
        SELECT severity_level INTO sev FROM disasters WHERE disaster_id = NEW.disaster_id;
        NEW.urgency_score := LEAST(100,
            CASE sev WHEN 'CRITICAL' THEN 80 WHEN 'HIGH' THEN 60 WHEN 'MODERATE' THEN 40 ELSE 20 END
            + LEAST(20, NEW.affected_population / 1000.0));
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER zone_default_urgency
    BEFORE INSERT ON affected_zones
    FOR EACH ROW EXECUTE FUNCTION trg_default_zone_urgency();

-- Keep last_updated current on every stock movement.
CREATE OR REPLACE FUNCTION trg_touch_inventory() RETURNS trigger AS $$
BEGIN
    NEW.last_updated := CURRENT_TIMESTAMP;
    RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER inventory_touch
    BEFORE UPDATE ON centre_inventory
    FOR EACH ROW EXECUTE FUNCTION trg_touch_inventory();

-- Audit log is immutable: no UPDATE or DELETE.
CREATE OR REPLACE FUNCTION trg_audit_immutable() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'inventory_audit_log is append-only (% not permitted)', TG_OP
        USING ERRCODE = 'insufficient_privilege';
END $$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_immutable
    BEFORE UPDATE OR DELETE ON inventory_audit_log
    FOR EACH ROW EXECUTE FUNCTION trg_audit_immutable();

-- =====================================================================
-- Stored procedures — core transactional operations (Section 9)
-- Each function runs inside the caller's transaction; any RAISE rolls
-- the entire unit of work back.
-- =====================================================================

-- Composite triage priority for the Redis urgency queue (higher = sooner).
--   urgency tier (1000..4000) + zone urgency score (0..100)
--   + log-scaled affected population (0..~350)
CREATE OR REPLACE FUNCTION fn_request_priority(p_request_id INTEGER) RETURNS NUMERIC AS $$
    SELECT (CASE r.urgency_level WHEN 'CRITICAL' THEN 4000 WHEN 'HIGH' THEN 3000
                                 WHEN 'MEDIUM' THEN 2000 ELSE 1000 END)
           + z.urgency_score
           + ROUND((25 * LN(1 + z.affected_population))::NUMERIC, 2)
    FROM relief_requests r JOIN affected_zones z USING (zone_id)
    WHERE r.request_id = p_request_id;
$$ LANGUAGE sql STABLE;

-- Restock: add units to a (centre, item, expiry) batch, creating it if needed.
CREATE OR REPLACE FUNCTION fn_restock(
    p_centre_id INTEGER, p_item_id INTEGER, p_quantity INTEGER,
    p_expiry DATE, p_user_id INTEGER, p_reorder_threshold INTEGER DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
    v_inventory_id INTEGER;
    v_perishable   BOOLEAN;
BEGIN
    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'Restock quantity must be positive' USING ERRCODE = 'check_violation';
    END IF;

    SELECT c.is_perishable INTO v_perishable
    FROM resource_items i JOIN resource_categories c USING (category_id)
    WHERE i.item_id = p_item_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Item % does not exist', p_item_id USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_perishable AND p_expiry IS NULL THEN
        RAISE EXCEPTION 'Perishable items require an expiry date' USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO centre_inventory (centre_id, item_id, quantity_available, expiry_date, reorder_threshold)
    VALUES (p_centre_id, p_item_id, p_quantity, p_expiry, COALESCE(p_reorder_threshold, 10))
    ON CONFLICT ON CONSTRAINT centre_inventory_batch_unique DO UPDATE
        SET quantity_available = centre_inventory.quantity_available + EXCLUDED.quantity_available,
            reorder_threshold  = COALESCE(p_reorder_threshold, centre_inventory.reorder_threshold)
    RETURNING inventory_id INTO v_inventory_id;

    INSERT INTO inventory_audit_log (inventory_id, changed_by, change_type, quantity_delta)
    VALUES (v_inventory_id, p_user_id, 'RESTOCK', p_quantity);

    RETURN v_inventory_id;
END $$ LANGUAGE plpgsql;

-- Manual stock adjustment (spoilage, count correction). Delta may be negative.
CREATE OR REPLACE FUNCTION fn_adjust_stock(
    p_inventory_id INTEGER, p_delta INTEGER, p_user_id INTEGER
) RETURNS VOID AS $$
BEGIN
    IF p_delta = 0 THEN RETURN; END IF;
    UPDATE centre_inventory
       SET quantity_available = quantity_available + p_delta
     WHERE inventory_id = p_inventory_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Inventory batch % not found', p_inventory_id USING ERRCODE = 'no_data_found';
    END IF;
    INSERT INTO inventory_audit_log (inventory_id, changed_by, change_type, quantity_delta)
    VALUES (p_inventory_id, p_user_id, 'ADJUSTMENT', p_delta);
END $$ LANGUAGE plpgsql;

-- Recompute a request's status from its fulfilled quantity.
CREATE OR REPLACE FUNCTION fn_refresh_request_status(p_request_id INTEGER) RETURNS VOID AS $$
    UPDATE relief_requests
       SET status = CASE
                      WHEN status = 'REJECTED'                     THEN 'REJECTED'
                      WHEN quantity_fulfilled >= quantity_requested THEN 'FULFILLED'
                      WHEN quantity_fulfilled > 0                   THEN 'PARTIALLY_FULFILLED'
                      ELSE 'APPROVED'
                    END
     WHERE request_id = p_request_id;
$$ LANGUAGE sql;

-- Atomic FEFO allocation.
--  1. Locks the request row (FOR UPDATE) to serialise competing allocations.
--  2. Locks candidate batches at the centre in earliest-expiry-first order,
--     skipping expired batches.
--  3. Moves units available -> reserved per batch, records the batch split,
--     writes RESERVE audit entries, and updates request fulfilment.
--  Any failed check raises, rolling back the whole transaction.
CREATE OR REPLACE FUNCTION fn_allocate_resource(
    p_request_id INTEGER, p_centre_id INTEGER, p_quantity INTEGER, p_approved_by INTEGER
) RETURNS INTEGER AS $$
DECLARE
    v_req           relief_requests%ROWTYPE;
    v_allocation_id INTEGER;
    v_remaining     INTEGER := p_quantity;
    v_take          INTEGER;
    v_available     INTEGER;
    b               RECORD;
BEGIN
    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'Allocation quantity must be positive' USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO v_req FROM relief_requests WHERE request_id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Request % not found', p_request_id USING ERRCODE = 'no_data_found';
    END IF;
    IF v_req.status IN ('REJECTED', 'FULFILLED') THEN
        RAISE EXCEPTION 'Request % is % and cannot receive allocations', p_request_id, v_req.status
            USING ERRCODE = 'check_violation';
    END IF;
    IF v_req.quantity_fulfilled + p_quantity > v_req.quantity_requested THEN
        RAISE EXCEPTION 'Allocation of % exceeds outstanding quantity % for request %',
            p_quantity, v_req.quantity_requested - v_req.quantity_fulfilled, p_request_id
            USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM relief_centres WHERE centre_id = p_centre_id AND is_active) THEN
        RAISE EXCEPTION 'Relief centre % is not active', p_centre_id USING ERRCODE = 'check_violation';
    END IF;

    SELECT COALESCE(SUM(quantity_available), 0) INTO v_available
    FROM centre_inventory
    WHERE centre_id = p_centre_id AND item_id = v_req.item_id
      AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE);
    IF v_available < p_quantity THEN
        RAISE EXCEPTION 'Insufficient stock at centre %: requested %, available %',
            p_centre_id, p_quantity, v_available USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO resource_allocations (request_id, centre_id, item_id, approved_by, quantity_allocated)
    VALUES (p_request_id, p_centre_id, v_req.item_id, p_approved_by, p_quantity)
    RETURNING allocation_id INTO v_allocation_id;

    FOR b IN
        SELECT inventory_id, quantity_available
        FROM centre_inventory
        WHERE centre_id = p_centre_id AND item_id = v_req.item_id
          AND quantity_available > 0
          AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
        ORDER BY expiry_date ASC NULLS LAST, inventory_id
        FOR UPDATE
    LOOP
        EXIT WHEN v_remaining = 0;
        v_take := LEAST(v_remaining, b.quantity_available);

        UPDATE centre_inventory
           SET quantity_available = quantity_available - v_take,
               quantity_reserved  = quantity_reserved  + v_take
         WHERE inventory_id = b.inventory_id;

        INSERT INTO allocation_batches (allocation_id, inventory_id, quantity)
        VALUES (v_allocation_id, b.inventory_id, v_take);

        INSERT INTO inventory_audit_log (inventory_id, changed_by, change_type, quantity_delta)
        VALUES (b.inventory_id, p_approved_by, 'RESERVE', -v_take);

        v_remaining := v_remaining - v_take;
    END LOOP;

    IF v_remaining > 0 THEN  -- stock changed between the check and the row locks
        RAISE EXCEPTION 'Insufficient stock at centre % after locking batches', p_centre_id
            USING ERRCODE = 'serialization_failure';
    END IF;

    UPDATE relief_requests
       SET quantity_fulfilled = quantity_fulfilled + p_quantity
     WHERE request_id = p_request_id;
    PERFORM fn_refresh_request_status(p_request_id);

    RETURN v_allocation_id;
END $$ LANGUAGE plpgsql;

-- Dispatch lifecycle: ALLOCATED -> IN_TRANSIT -> DELIVERED, or -> CANCELLED.
--  DELIVERED: reserved units leave the centre permanently (DISPATCH audit).
--  CANCELLED: reserved units return to available stock and the request's
--             fulfilled quantity is rolled back.
CREATE OR REPLACE FUNCTION fn_update_dispatch_status(
    p_allocation_id INTEGER, p_new_status VARCHAR, p_user_id INTEGER
) RETURNS VOID AS $$
DECLARE
    v_alloc resource_allocations%ROWTYPE;
    b       RECORD;
BEGIN
    SELECT * INTO v_alloc FROM resource_allocations WHERE allocation_id = p_allocation_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Allocation % not found', p_allocation_id USING ERRCODE = 'no_data_found';
    END IF;

    IF NOT (
        (v_alloc.dispatch_status = 'ALLOCATED'  AND p_new_status IN ('IN_TRANSIT', 'DELIVERED', 'CANCELLED')) OR
        (v_alloc.dispatch_status = 'IN_TRANSIT' AND p_new_status IN ('DELIVERED', 'CANCELLED'))
    ) THEN
        RAISE EXCEPTION 'Invalid dispatch transition % -> %', v_alloc.dispatch_status, p_new_status
            USING ERRCODE = 'check_violation';
    END IF;

    IF p_new_status IN ('DELIVERED', 'CANCELLED') THEN
        FOR b IN SELECT inventory_id, quantity FROM allocation_batches
                 WHERE allocation_id = p_allocation_id ORDER BY inventory_id
        LOOP
            IF p_new_status = 'DELIVERED' THEN
                UPDATE centre_inventory
                   SET quantity_reserved = quantity_reserved - b.quantity
                 WHERE inventory_id = b.inventory_id;
                INSERT INTO inventory_audit_log (inventory_id, changed_by, change_type, quantity_delta)
                VALUES (b.inventory_id, p_user_id, 'DISPATCH', -b.quantity);
            ELSE
                UPDATE centre_inventory
                   SET quantity_reserved  = quantity_reserved  - b.quantity,
                       quantity_available = quantity_available + b.quantity
                 WHERE inventory_id = b.inventory_id;
                INSERT INTO inventory_audit_log (inventory_id, changed_by, change_type, quantity_delta)
                VALUES (b.inventory_id, p_user_id, 'ADJUSTMENT', b.quantity);
            END IF;
        END LOOP;
    END IF;

    UPDATE resource_allocations
       SET dispatch_status = p_new_status,
           delivered_at    = CASE WHEN p_new_status = 'DELIVERED' THEN CURRENT_TIMESTAMP END
     WHERE allocation_id = p_allocation_id;

    IF p_new_status = 'CANCELLED' THEN
        UPDATE relief_requests
           SET quantity_fulfilled = quantity_fulfilled - v_alloc.quantity_allocated
         WHERE request_id = v_alloc.request_id;
        PERFORM fn_refresh_request_status(v_alloc.request_id);
    END IF;
END $$ LANGUAGE plpgsql;

-- =====================================================================
-- Reporting views
-- =====================================================================

-- Per-batch stock health: low stock and near-expiry flags.
CREATE VIEW v_inventory_health AS
SELECT ci.inventory_id, ci.centre_id, rc.centre_name, ci.item_id, ri.item_name, ri.sku,
       cat.category_name, cat.unit_of_measure, cat.is_perishable,
       ci.quantity_available, ci.quantity_reserved, ci.reorder_threshold,
       ci.expiry_date, ci.last_updated,
       (ci.expiry_date IS NOT NULL AND ci.expiry_date < CURRENT_DATE)          AS is_expired,
       (ci.expiry_date IS NOT NULL AND ci.expiry_date >= CURRENT_DATE
            AND ci.expiry_date <= CURRENT_DATE + 30)                           AS is_near_expiry,
       (ci.quantity_available < ci.reorder_threshold)                         AS is_low_stock
FROM centre_inventory ci
JOIN relief_centres rc       ON rc.centre_id = ci.centre_id
JOIN resource_items ri       ON ri.item_id = ci.item_id
JOIN resource_categories cat ON cat.category_id = ri.category_id;

-- Fulfilment rate per affected zone.
CREATE VIEW v_zone_fulfillment AS
SELECT z.zone_id, z.zone_name, z.district, z.status AS zone_status, z.urgency_score,
       z.affected_population, d.disaster_id, d.title AS disaster_title,
       COUNT(r.request_id)                                        AS total_requests,
       COUNT(r.request_id) FILTER (WHERE r.status = 'FULFILLED')   AS fulfilled_requests,
       COALESCE(SUM(r.quantity_requested) FILTER (WHERE r.status <> 'REJECTED'), 0) AS units_requested,
       COALESCE(SUM(r.quantity_fulfilled), 0)                     AS units_fulfilled,
       CASE WHEN COALESCE(SUM(r.quantity_requested) FILTER (WHERE r.status <> 'REJECTED'), 0) = 0 THEN NULL
            ELSE ROUND(100.0 * SUM(r.quantity_fulfilled)
                       / SUM(r.quantity_requested) FILTER (WHERE r.status <> 'REJECTED'), 1)
       END                                                        AS fulfillment_pct
FROM affected_zones z
JOIN disasters d ON d.disaster_id = z.disaster_id
LEFT JOIN relief_requests r ON r.zone_id = z.zone_id
GROUP BY z.zone_id, d.disaster_id;

-- Open requests with their computed priority (PostgreSQL fallback for the Redis queue).
CREATE VIEW v_request_queue AS
SELECT r.request_id, r.zone_id, z.zone_name, z.district, r.item_id, ri.item_name,
       r.quantity_requested, r.quantity_fulfilled,
       r.quantity_requested - r.quantity_fulfilled AS quantity_outstanding,
       r.urgency_level, r.status, r.created_at, r.notes,
       u.full_name AS requested_by_name,
       fn_request_priority(r.request_id) AS priority_score
FROM relief_requests r
JOIN affected_zones z  ON z.zone_id = r.zone_id
JOIN resource_items ri ON ri.item_id = r.item_id
JOIN users u           ON u.user_id = r.requested_by
WHERE r.status IN ('PENDING', 'APPROVED', 'PARTIALLY_FULFILLED');

-- Dispatch progress summary per centre.
CREATE VIEW v_dispatch_summary AS
SELECT rc.centre_id, rc.centre_name,
       COUNT(a.allocation_id) FILTER (WHERE a.dispatch_status = 'ALLOCATED')  AS allocated,
       COUNT(a.allocation_id) FILTER (WHERE a.dispatch_status = 'IN_TRANSIT') AS in_transit,
       COUNT(a.allocation_id) FILTER (WHERE a.dispatch_status = 'DELIVERED')  AS delivered,
       COUNT(a.allocation_id) FILTER (WHERE a.dispatch_status = 'CANCELLED')  AS cancelled,
       COALESCE(SUM(a.quantity_allocated) FILTER (WHERE a.dispatch_status = 'DELIVERED'), 0) AS units_delivered,
       ROUND(AVG(EXTRACT(EPOCH FROM (a.delivered_at - a.allocated_at)) / 3600.0)
             FILTER (WHERE a.dispatch_status = 'DELIVERED')::NUMERIC, 1)  AS avg_delivery_hours
FROM relief_centres rc
LEFT JOIN resource_allocations a ON a.centre_id = rc.centre_id
GROUP BY rc.centre_id;

COMMIT;
