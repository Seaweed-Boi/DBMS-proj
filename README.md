# Disaster Relief Resource Management System (DRRMS)

DBMS course project, Department of CSE, PES University, Bengaluru.
**Gautam Prasanth Nair** (PES1UG24CS169) · **Harsh Pandya** (PES1UG24CS182)

DRRMS is a full-stack web platform for coordinating disaster relief. It tracks disasters, affected
zones, relief centres, batch inventory (including perishables), relief requests, FEFO resource
allocations, dispatches and volunteer deployments.

It uses two databases:

| Store | Role |
|---|---|
| **PostgreSQL** | The system of record. 3NF schema with PK/FK/CHECK/UNIQUE constraints, triggers, stored procedures for atomic allocation, an append-only audit log and reporting views. |
| **Redis** | Real-time layer: an urgency priority queue (sorted set), distributed allocation locks (`SET NX PX`), a KPI cache (hash), and low-stock / SOS alerts (Pub/Sub plus a capped list). |

The full specification is in
`Disaster Relief Resource Management System — DBMS Project Report.docx`.

---

## Quick start

Prerequisites: Node.js 20 or newer, plus PostgreSQL 15 or newer and Redis 6 or newer (or Docker).

```bash
# 1. Start PostgreSQL 16 + Redis 7. The schema and seed load automatically
#    the first time the container starts.
docker compose up -d

# 2. Configure the environment
cp .env.example .env          # set NEXTAUTH_SECRET to a long random string

# 3. Install and (re)initialise the data
npm install
npm run db:reset              # applies db/schema.sql + db/seed.sql, rebuilds Redis state

# 4. Run
npm run dev                   # http://localhost:3000
```

If you use a local PostgreSQL/Redis instead of Docker, point `DATABASE_URL` and `REDIS_URL` at it,
then run `npm run db:reset`.

### Demo accounts (password `relief@123`)

| Email | Role | Can do |
|---|---|---|
| `admin@drrms.org` | System Admin | Everything |
| `vikram@drrms.org` | Centre Manager (Kodagu centres) | Restock, adjust, approve, allocate and dispatch for own centres |
| `meera@drrms.org` | Centre Manager (Odisha centres) | Same, for Puri / Bhubaneswar |
| `rahul@drrms.org` | Field Coordinator | Log requests, manage zones, assign volunteers |
| `arjun@drrms.org` | Volunteer | View operations, toggle own availability |

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev server, production build and production server |
| `npm run lint` | TypeScript type-check |
| `npm run db:schema` | Drop and recreate all tables, triggers, functions and views |
| `npm run db:seed` | Load demo data |
| `npm run db:reset` | Schema + seed, flush derived Redis keys, rebuild the queue and KPI cache |
| `npm run redis:rebuild` | Re-derive the Redis queue and KPI cache from PostgreSQL |
| `npm run test:concurrency` | Race 25 simultaneous allocations and assert there is no over-allocation (see below) |

---

## Architecture

```
 Browser (Next.js React UI, Tailwind)
   │  fetch / SSE
   ▼
 Next.js API routes ── lib/api.ts: NextAuth JWT session → RBAC permission → zod validation
   │                                → PG SQLSTATE → HTTP status mapping
   ├── lib/services/allocation.ts ─┐
   ├── lib/services/inventory.ts   │ 1. Redis lock  drrms:lock:inventory:{centre}:{item}
   │                               │ 2. BEGIN; SELECT fn_allocate_resource(...); COMMIT
   │                               │ 3. post-commit: ZADD/ZREM queue · DEL KPI cache · low-stock alert
   ├── lib/services/queue.ts  ──── Redis ZSET drrms:queue:requests (PostgreSQL fallback: v_request_queue)
   ├── lib/services/kpi.ts    ──── Redis HASH drrms:kpi (read-through, invalidated on writes)
   └── lib/services/alerts.ts ──── Redis PUBLISH drrms:alerts + LIST drrms:alerts:recent
                                     └─► /api/alerts/stream (SSE) ─► live toasts in the UI
```

**Write path.** Every state change runs inside a PostgreSQL transaction. Allocation, dispatch,
restock and adjustment logic lives in PL/pgSQL functions, so integrity does not depend on
application code.

**Hybrid read path.** The dashboard KPIs and the triage ranking come from Redis. Ledgers, histories
and reports query PostgreSQL views.

**Graceful degradation.** If Redis is down, every Redis call falls back to PostgreSQL: the queue
uses `ORDER BY priority`, KPIs are computed live, and locking relies on `SELECT … FOR UPDATE` alone.
The UI tags each panel as served from `REDIS` or `POSTGRES`.

### Project layout

```
db/schema.sql          tables, constraints, indexes, triggers, stored procedures, views
db/seed.sql            demo data (inventory and allocations created through the stored procedures)
docs/                  ER diagram, normalisation proof, Redis design, sample SQL queries
scripts/               db runner, Redis rebuild, concurrency test
src/lib/               db pool, redis client and locks, auth, RBAC, read queries, services
src/app/api/           REST endpoints
src/app/(app)/         authenticated pages
src/components/        UI building blocks (forms, modals, tables, alert feed)
```

---

## Database design

- **ER model:** [`docs/er-diagram.md`](docs/er-diagram.md) (Mermaid, renders on GitHub)
- **Normalisation (1NF → 3NF):** [`docs/normalization.md`](docs/normalization.md)
- **Redis key design:** [`docs/redis-design.md`](docs/redis-design.md)
- **Example SQL (joins, aggregates, views, procedures):** [`docs/sample-queries.sql`](docs/sample-queries.sql)

### Tables (report §7.2)

`users`, `disasters`, `affected_zones`, `relief_centres`, `resource_categories`, `resource_items`,
`centre_inventory`, `relief_requests`, `resource_allocations`, `volunteer_profiles`,
`inventory_audit_log`.

There is also one implementation table, `allocation_batches (allocation_id, inventory_id, quantity)`.
A single allocation can draw on several FEFO batches at a centre. Delivery and cancellation must
settle exactly those batches, but `resource_allocations` stores only `(centre_id, item_id)`. This
table records the batch split without denormalising the allocation row.

### Integrity rules enforced in the database

| Rule | Mechanism |
|---|---|
| No negative stock; reserved ≥ 0 | `CHECK (quantity_available >= 0)`, `CHECK (quantity_reserved >= 0)` |
| No over-fulfilment | `CHECK (quantity_fulfilled BETWEEN 0 AND quantity_requested)` |
| Occupancy ≤ capacity | `CHECK (current_occupancy >= 0 AND current_occupancy <= total_capacity)` |
| One batch per (centre, item, expiry) | `UNIQUE NULLS NOT DISTINCT (centre_id, item_id, expiry_date)` |
| `delivered_at` set iff DELIVERED | `CHECK ((dispatch_status = 'DELIVERED') = (delivered_at IS NOT NULL))` |
| Only managers/admins manage centres | trigger `centre_manager_role` |
| ISA: only VOLUNTEER users have profiles; status follows assignment | trigger `volunteer_role_isa` |
| Requesters are coordinators/managers/admins | trigger `request_requester_role` |
| Audit log is append-only | trigger `audit_log_immutable` (blocks UPDATE/DELETE) |
| Perishables must have an expiry date | `fn_restock` |
| Valid dispatch transitions only | `fn_update_dispatch_status` |

### Core transactions (report §9)

**`fn_allocate_resource(request, centre, qty, approver)`** performs an atomic FEFO allocation:

1. Locks the request row with `SELECT … FOR UPDATE`.
2. Validates the request status, the outstanding quantity, that the centre is active, and that
   enough non-expired stock exists.
3. Locks the candidate batches in order with `ORDER BY expiry_date NULLS LAST … FOR UPDATE`. For
   each batch it moves units from available to reserved, records the split in
   `allocation_batches`, and writes a `RESERVE` audit row.
4. Updates `quantity_fulfilled` and the request status (`PARTIALLY_FULFILLED` / `FULFILLED`).
5. Raises an exception on any failure, which rolls back the whole transaction.

**`fn_update_dispatch_status(allocation, status, user)`** handles the dispatch lifecycle:

- Allowed transitions: `ALLOCATED → IN_TRANSIT → DELIVERED`, or either active state → `CANCELLED`.
- **DELIVERED** removes the reserved units permanently and writes `DISPATCH` audit rows.
- **CANCELLED** returns the reserved units to the original batches, writes `ADJUSTMENT` audit rows,
  rolls back the request's fulfilment and recomputes its status.

**`fn_restock`, `fn_adjust_stock`** are audited stock movements. **`fn_request_priority`** is the
triage score used for the Redis queue.

### Concurrency control

Allocations are protected at two layers:

1. A **Redis mutex** (`SET drrms:lock:inventory:{centre}:{item} <token> NX PX 10000`, released by a
   compare-and-delete Lua script) serialises competing allocators before they reach the database.
2. **PostgreSQL row locks** (`FOR UPDATE` on the request and the batches) guarantee correctness
   even when Redis is unavailable.

`npm run test:concurrency` checks this. It fires 25 simultaneous 5-unit allocations at a centre that
holds 90 units, once with Redis and once without. In both runs exactly 18 succeed, stock never goes
negative, the reserved and fulfilled totals match, and cancelling every allocation restores the
original stock.

---

## Role-based access control

| Action | Admin | Centre Mgr | Coordinator | Volunteer |
|---|:-:|:-:|:-:|:-:|
| View dashboards, inventory, requests, roster | ✓ | ✓ | ✓ | ✓ |
| Register / edit disasters | ✓ | | | |
| Add / update affected zones | ✓ | | ✓ | |
| Create centres, edit capacity/manager | ✓ | | | |
| Update occupancy / status of a centre | ✓ | own | | |
| Manage catalog (categories, items) | ✓ | | | |
| Restock / adjust inventory | ✓ | own centres | | |
| Submit relief requests | ✓ | ✓ | ✓ | |
| Approve / reject requests | ✓ | ✓ | | |
| Allocate stock, update dispatch | ✓ | own centres | | |
| Assign volunteers | ✓ | ✓ | ✓ | own availability |
| Reports | ✓ | ✓ | ✓ | |
| User management, Redis rebuild | ✓ | | | |

Permissions are defined in `src/lib/constants.ts`. API routes enforce them in `src/lib/api.ts`,
centre ownership is checked in `src/lib/services/access.ts`, and page access is checked in
`src/middleware.ts`.
