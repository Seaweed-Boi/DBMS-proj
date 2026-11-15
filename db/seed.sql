-- =====================================================================
-- DRRMS demo seed data.  All demo accounts use password:  relief@123
-- Run after schema.sql:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/seed.sql
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------- users
INSERT INTO users (full_name, email, password_hash, phone, role) VALUES
 ('Asha Raman',        'admin@drrms.org',      crypt('relief@123', gen_salt('bf', 10)), '+91-80-4000-1000', 'ADMIN'),
 ('Vikram Shetty',     'vikram@drrms.org',     crypt('relief@123', gen_salt('bf', 10)), '+91-98450-11111',  'CENTRE_MANAGER'),
 ('Meera Nair',        'meera@drrms.org',      crypt('relief@123', gen_salt('bf', 10)), '+91-98450-22222',  'CENTRE_MANAGER'),
 ('Rahul Das',         'rahul@drrms.org',      crypt('relief@123', gen_salt('bf', 10)), '+91-98450-33333',  'COORDINATOR'),
 ('Fatima Sheikh',     'fatima@drrms.org',     crypt('relief@123', gen_salt('bf', 10)), '+91-98450-44444',  'COORDINATOR'),
 ('Arjun Menon',       'arjun@drrms.org',      crypt('relief@123', gen_salt('bf', 10)), '+91-90000-00001',  'VOLUNTEER'),
 ('Divya Kulkarni',    'divya@drrms.org',      crypt('relief@123', gen_salt('bf', 10)), '+91-90000-00002',  'VOLUNTEER'),
 ('Sanjay Patil',      'sanjay@drrms.org',     crypt('relief@123', gen_salt('bf', 10)), '+91-90000-00003',  'VOLUNTEER'),
 ('Priya Iyer',        'priya@drrms.org',      crypt('relief@123', gen_salt('bf', 10)), '+91-90000-00004',  'VOLUNTEER'),
 ('Karthik Reddy',     'karthik@drrms.org',    crypt('relief@123', gen_salt('bf', 10)), '+91-90000-00005',  'VOLUNTEER'),
 ('Neha Joshi',        'neha@drrms.org',       crypt('relief@123', gen_salt('bf', 10)), '+91-90000-00006',  'VOLUNTEER');

-- ------------------------------------------------------------ disasters
INSERT INTO disasters (title, disaster_type, severity_level, start_date, status, description) VALUES
 ('Kodagu Monsoon Floods 2026', 'FLOOD',     'CRITICAL', CURRENT_DATE - 6,  'ACTIVE',
  'Cloudburst-driven flash floods along the Kaveri catchment; multiple villages cut off.'),
 ('Odisha Coastal Cyclone 2026', 'CYCLONE',  'HIGH',     CURRENT_DATE - 3,  'ACTIVE',
  'Severe cyclonic storm made landfall near Puri; widespread power and shelter loss.'),
 ('Wayanad Landslide',          'LANDSLIDE', 'MODERATE', CURRENT_DATE - 20, 'CONTAINED',
  'Hill-slope failure after sustained rainfall; rescue phase complete.');

-- --------------------------------------------------------------- zones
-- urgency_score left at 0 so the trigger derives it from severity + population.
INSERT INTO affected_zones (disaster_id, zone_name, district, latitude, longitude, affected_population, status) VALUES
 (1, 'Madikeri Town',   'Kodagu',   12.424400, 75.738200, 18500, 'CRITICAL'),
 (1, 'Somwarpet',       'Kodagu',   12.596500, 75.849800,  7200, 'CRITICAL'),
 (1, 'Virajpet',        'Kodagu',   12.195800, 75.804800,  4300, 'ACTIVE'),
 (2, 'Puri Coastal Belt','Puri',    19.813500, 85.831200, 26000, 'CRITICAL'),
 (2, 'Konark',          'Puri',     19.887600, 86.094500,  9100, 'ACTIVE'),
 (3, 'Meppadi',         'Wayanad',  11.555700, 76.134500,  3100, 'STABILISED');

-- ------------------------------------------------------------- centres
INSERT INTO relief_centres (manager_id, centre_name, address, district, total_capacity, current_occupancy, contact_phone) VALUES
 (2, 'Madikeri Central Relief Hub',  'Govt. PU College Grounds, Madikeri',      'Kodagu',  1200, 860, '+91-8272-220100'),
 (2, 'Kushalnagar Staging Warehouse','KIADB Industrial Area, Kushalnagar',      'Kodagu',   400,  60, '+91-8276-274500'),
 (3, 'Puri District Cyclone Shelter','Grand Road Community Hall, Puri',         'Puri',    1500, 1320,'+91-6752-222300'),
 (3, 'Bhubaneswar Supply Depot',     'Mancheswar Industrial Estate, Bhubaneswar','Khordha',  800, 120, '+91-674-2580900');

-- -------------------------------------------------- categories & items
INSERT INTO resource_categories (category_name, unit_of_measure, is_perishable) VALUES
 ('Food & Water',        'Boxes',  TRUE),
 ('Medical Supplies',    'Kits',   TRUE),
 ('Shelter & Clothing',  'Units',  FALSE),
 ('Rescue Equipment',    'Units',  FALSE);

INSERT INTO resource_items (category_id, item_name, sku, description) VALUES
 (1, 'Packaged Drinking Water (20L)', 'FW-WATER-20L',  'Sealed 20 litre drinking water can.'),
 (1, 'Dry Ration Kit (7 day)',        'FW-RATION-7D',  'Rice, dal, oil, salt and sugar for a family of four.'),
 (1, 'Ready-to-Eat Meal Pack',        'FW-RTE-MEAL',   'Shelf-stable cooked meal, 12 per box.'),
 (2, 'First Aid Trauma Kit',          'MD-TRAUMA-KIT', 'Dressings, splints, antiseptic, tourniquet.'),
 (2, 'ORS & Water Purification Kit',  'MD-ORS-KIT',    'ORS sachets and chlorine tablets.'),
 (3, 'Family Tarpaulin Tent',         'SH-TENT-FAM',   'Waterproof tent for up to 5 people.'),
 (3, 'Blanket (Woollen)',             'SH-BLANKET',    'Heavy woollen blanket.'),
 (4, 'Inflatable Rescue Boat',        'RE-BOAT-INF',   '6-person inflatable boat with oars.'),
 (4, 'Life Jacket',                   'RE-LIFEJACKET', 'Adult buoyancy aid, ISI marked.');

-- ---------------------------------------------------------- inventory
-- Use fn_restock so every opening balance is audited.
SELECT fn_restock(1, 1, 600, CURRENT_DATE + 180, 2, 100);
SELECT fn_restock(1, 2, 140, CURRENT_DATE + 20,  2, 50);   -- near-expiry batch (FEFO first)
SELECT fn_restock(1, 2, 300, CURRENT_DATE + 120, 2, 50);
SELECT fn_restock(1, 4, 35,  CURRENT_DATE + 365, 2, 40);   -- below threshold
SELECT fn_restock(1, 6, 90,  NULL,               2, 20);
SELECT fn_restock(1, 8, 6,   NULL,               2, 4);
SELECT fn_restock(2, 1, 900, CURRENT_DATE + 200, 2, 100);
SELECT fn_restock(2, 3, 220, CURRENT_DATE + 15,  2, 30);   -- near-expiry
SELECT fn_restock(2, 7, 500, NULL,               2, 50);
SELECT fn_restock(2, 9, 150, NULL,               2, 30);
SELECT fn_restock(3, 1, 400, CURRENT_DATE + 150, 3, 120);
SELECT fn_restock(3, 2, 80,  CURRENT_DATE + 90,  3, 100);  -- below threshold
SELECT fn_restock(3, 5, 260, CURRENT_DATE + 240, 3, 50);
SELECT fn_restock(3, 6, 45,  NULL,               3, 60);   -- below threshold
SELECT fn_restock(4, 2, 700, CURRENT_DATE + 160, 3, 100);
SELECT fn_restock(4, 4, 200, CURRENT_DATE + 400, 3, 40);
SELECT fn_restock(4, 7, 800, NULL,               3, 80);
SELECT fn_restock(4, 8, 10,  NULL,               3, 3);

-- ------------------------------------------------------------ requests
INSERT INTO relief_requests (zone_id, requested_by, item_id, quantity_requested, urgency_level, notes, status, created_at) VALUES
 (1, 4, 2, 250, 'CRITICAL', 'Families relocated to college grounds; no cooking supplies.', 'PENDING',  NOW() - INTERVAL '5 hours'),
 (1, 4, 4,  30, 'CRITICAL', 'Multiple injuries from collapsed houses.',                  'PENDING',  NOW() - INTERVAL '3 hours'),
 (2, 4, 1, 300, 'HIGH',     'Municipal supply contaminated.',                            'APPROVED', NOW() - INTERVAL '20 hours'),
 (2, 4, 8,   3, 'HIGH',     'Low-lying wards still submerged.',                          'PENDING',  NOW() - INTERVAL '2 hours'),
 (3, 4, 7, 120, 'MEDIUM',   'Night temperatures dropping.',                              'PENDING',  NOW() - INTERVAL '1 day'),
 (4, 5, 6,  80, 'CRITICAL', 'Thatched homes destroyed along the coast.',                 'PENDING',  NOW() - INTERVAL '4 hours'),
 (4, 5, 5, 150, 'HIGH',     'Diarrhoea cases reported at shelter.',                      'APPROVED', NOW() - INTERVAL '10 hours'),
 (5, 5, 2, 200, 'MEDIUM',   NULL,                                                        'PENDING',  NOW() - INTERVAL '8 hours'),
 (6, 5, 7,  60, 'LOW',      'Recovery phase; replacing damaged bedding.',                'PENDING',  NOW() - INTERVAL '3 days');

-- ------------------------------------------------ allocations (via SP)
SELECT fn_allocate_resource(3, 2, 300, 1);          -- request 3 fully allocated from Kushalnagar
SELECT fn_allocate_resource(7, 3, 100, 3);          -- request 7 partially allocated
SELECT fn_update_dispatch_status(1, 'IN_TRANSIT', 2);
SELECT fn_update_dispatch_status(1, 'DELIVERED',  2);
SELECT fn_update_dispatch_status(2, 'IN_TRANSIT', 3);

-- ---------------------------------------------------------- volunteers
INSERT INTO volunteer_profiles (volunteer_id, primary_skill, availability_status, assigned_centre_id, assigned_zone_id) VALUES
 (6,  'MEDICAL',   'DEPLOYED',  1, 1),
 (7,  'LOGISTICS', 'DEPLOYED',  2, NULL),
 (8,  'RESCUE',    'AVAILABLE', NULL, NULL),
 (9,  'SHELTER',   'DEPLOYED',  3, 4),
 (10, 'MEDICAL',   'AVAILABLE', NULL, NULL),
 (11, 'GENERAL',   'ON_LEAVE',  NULL, NULL);

COMMIT;
