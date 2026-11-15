# Redis (NoSQL) Data Structures — Report §8

PostgreSQL remains the system of record. All Redis state is **derived**: it can be rebuilt at any
time with `npm run redis:rebuild`. If Redis is down, the application falls back to PostgreSQL.

| Key / channel | Type | Purpose | Written when | Read by |
|---|---|---|---|---|
| `drrms:queue:requests` | Sorted set | Urgency priority queue of open request IDs | After any commit that changes a request or its zone (`syncRequest`) | Triage console, dashboard (`ZREVRANGE`) |
| `drrms:lock:inventory:{centre}:{item}` | String + PX TTL | Distributed mutex around allocation, dispatch and restock | `SET … NX PX 10000`; released by a compare-and-delete Lua script | `withLock()` |
| `drrms:kpi` | Hash (TTL 300 s) | Cached dashboard KPIs | Read-through on a miss; `DEL` after every relevant write | Dashboard |
| `drrms:alerts` | Pub/Sub channel | Live LOW_STOCK and CRITICAL_SOS notifications | `PUBLISH` after commit | `/api/alerts/stream` (SSE) → browser toasts |
| `drrms:alerts:recent` | List (capped at 50) | Alert history for newly loaded dashboards | `LPUSH` + `LTRIM` alongside each publish | Dashboard "Recent alerts" |
| `drrms:alerted:lowstock:{inventory_id}` | String + EX TTL | Sends at most one low-stock alert per batch until it recovers | `SET NX EX 21600`; deleted when stock is back above threshold | `checkLowStock()` |

## Priority score

The base priority comes from `fn_request_priority`, computed in PostgreSQL:

```
priority = tier(urgency_level)        CRITICAL 4000 · HIGH 3000 · MEDIUM 2000 · LOW 1000
         + zone.urgency_score         0 – 100 (operator-adjusted; default from severity + population)
         + 25 · ln(1 + affected_population)
```

The ZSET score packs this priority together with a tie-breaker, so ties go to the older request:

```
score = round(priority × 100) × 2^30 + (2^30 − 1 − minutes_since_2020(created_at))
```

The result is an integer below 2^53, so it is represented exactly in Redis's double-precision
scores. One `ZREVRANGE` then returns requests in strict triage order.

## Why each structure

- **Sorted set:** O(log N) insert and update, O(log N + k) top-k. Reprioritising a request is a
  single `ZADD`, and no table scan is needed for the console.
- **`SET NX PX` lock:** only one allocator per centre/item pair enters the critical section. The TTL
  prevents deadlock if a process crashes. The token check stops one client from releasing a lock
  that another client holds.
- **Hash:** one `HGETALL` serves all 12 KPI cards in about a millisecond, instead of 12 aggregate
  queries.
- **Pub/Sub + list:** Pub/Sub gives push delivery to every connected dashboard. The list gives a
  short history for dashboards that load after the alert was sent.
