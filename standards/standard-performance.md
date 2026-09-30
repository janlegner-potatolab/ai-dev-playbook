# Standard: performance and scaling

Rules for measurement, performance budgets, caching, pooling, queues, load tests and capacity.
Applies to a TypeScript application (client + server + PostgreSQL) running in multiple instances and for multiple tenants.

Builds on: ../project-structure-design.md (§ 2 operational rules, § 10.3 observability,
§ 10.4 resilience), standard-database.md (§ 7 indexes and N+1, § 8 background jobs),
standard-api-design.md (§ 7 pagination, § 13 request limits)

## 0 · Summary

**Main idea:** performance is not estimated, it is measured. Every number has a baseline,
a target and a verification method. Optimization without measuring before and after is an opinion, not a change.

1. **Measure first, then optimize.** A profile, a trace or `EXPLAIN ANALYZE`, never a guess.
2. **Budgets are set from measurements** and guarded in CI; the numbers in this document are starting points.
3. **Instances are stateless.** Caches, locks and counters live in a shared layer, never in module memory.
4. **Nothing is unbounded:** a list has a limit, a call a timeout, a queue a maximum, a pool a cap.
5. **Slow work goes to the background**; the user's request only enqueues a job and returns.
6. **Latency in percentiles** (p50, p95, p99), never the average.

## 1 · Performance budgets

A budget is a commitment: "this path must not be slower than X". Without a budget a regression cannot be detected.

| Area | Metric | Starting point (verify by measurement) |
|---|---|---|
| API read | p95 / p99 latency per endpoint | 200 ms / 500 ms |
| API write | p95 / p99 latency per endpoint | 400 ms / 1,000 ms |
| DB query (OLTP) | p95 query time | 50 ms |
| Frontend | LCP / INP / CLS (75th percentile) | < 2.5 s / < 200 ms / < 0.1 |
| Bundle | initial page JS (gzip) | 200 KB |
| Background job | time from enqueue to completion | by job type |

- **Per endpoint, not globally.** An export and a dashboard have different budgets than a record detail.
- **How a budget is set:** measure p50/p95/p99 in an environment close to production on realistic
  data, record the baseline, set the target with headroom above the baseline. A budget without a baseline is a wish.
- **Critical paths** (sign-in, main list, save) have a budget and an alert; the others
  only a dashboard. Which path is critical is decided by the architect in the design decision.
- **Core Web Vitals** are measured in the browser for real users as well as in the lab; frontend details
  are in `standard-frontend.md`.

## 2 · Measurement as the first step

| Question | Tool |
|---|---|
| Which endpoint is slow | latency histogram per endpoint (§ 10.3 of the guide) |
| Where time disappears within a request | distributed trace with spans for DB, HTTP, cache, queue |
| Why a query is slow | `EXPLAIN (ANALYZE, BUFFERS)` under the application role |
| Where CPU or memory burns | process profile (`node --cpu-prof`, heap snapshot) |
| Why a page is slow | Lighthouse, DevTools performance trace, bundle analysis |

```sql
-- run under the application role: RLS changes which indexes are usable
SET ROLE app_user;
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, title, created_at FROM orders
 WHERE tenant_id = $1 AND status = 'open'
 ORDER BY created_at DESC, id DESC
 LIMIT 50;
```

- **Look in the plan for:** `Seq Scan` on a large table, a row estimate off by orders of magnitude,
  `Sort` with `external merge`, a nested loop over thousands of rows.
- **Measure on realistic data.** An empty development DB hides both a missing index and N+1.
- **A finding is reported uniformly:** impact, metric, current state, target, analysis, recommendation,
  expected effect, verification method.
- **After a change, measure again** with the same procedure and overwrite the baseline. Without a second measurement the change did not help.

## 3 · Stateless instances and horizontal scaling

- **No state in process memory** that correctness depends on (§ 2 of the guide). A second instance
  does not see it and a restart wipes it.
- **Sessions, caches, locks, rate limit counters and idempotency** belong in the DB or a shared cache.
- **Scheduled jobs** run either in one instance with a lock or as a separate job; otherwise
  they run N times.
- **Scale by adding instances**, not by enlarging one. Before scaling, verify that the bottleneck
  is not the DB: more instances over an overloaded DB make latency worse.
- **Health checks** decide routing (§ 10.3 of the guide): readiness takes an instance out of rotation,
  liveness does not check dependencies, otherwise a DB outage restarts everything.

## 4 · Caching and invalidation

| Layer | What belongs there | Invalidation |
|---|---|---|
| HTTP / CDN | static files with a hash in the name | new file name on build |
| Browser | API responses with `ETag` | conditional request (`If-None-Match`) |
| Shared cache (e.g. Redis) | expensive reads, lookup tables, computed summaries | TTL + key deletion on write |
| DB | materialized view for reports | scheduled `REFRESH ... CONCURRENTLY` |

- **Never a module-memory cache** for data that changes. Each instance would return a different version.
  Exception: immutable configuration loaded at startup.
- **The key includes the tenant:** `{tenant}:{entity}:{id}:v{schemaVersion}`. A key without a tenant is a data leak.
- **Every entry has a TTL.** A cache without a TTL is a second database without migrations.
- **Invalidation on write** happens after a successful commit, not before it.
- **The cache is not the source of truth.** When the shared cache is down, read from the DB (slower), never
  return an empty result.
- **Stale data as a fallback** only for reads and always with a signal: a log, an `X-Degraded` header,
  a metric (§ 10.4 of the guide).
- **Against an expiry stampede**, random TTL jitter or a single recompute per key helps.
- **Add a cache only after measuring.** Index and a correct query first; a cache over a bad query
  hides the bug and adds invalidation.

## 5 · Connection pooling

- **Every instance has a pool with a fixed cap.** The sum of the caps of all instances and jobs must
  stay below the DB's `max_connections` with headroom for migrations and administration.
- **With many instances** or a serverless runtime, a pooler belongs between the application and the DB (e.g. PgBouncer
  in transaction mode). Caution: transaction mode does not tolerate connection-bound state
  (`SET` outside a transaction, an advisory lock across transactions).

```ts
import { Pool } from "pg";

// starting points, tune from pool saturation metrics
const POOL_MAX_CONNECTIONS = 10;
const POOL_IDLE_TIMEOUT_MS = 30_000;
const POOL_CONNECT_TIMEOUT_MS = 2_000;
const STATEMENT_TIMEOUT_MS = 5_000;

export const pool = new Pool({
  max: POOL_MAX_CONNECTIONS,
  idleTimeoutMillis: POOL_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: POOL_CONNECT_TIMEOUT_MS,
  statement_timeout: STATEMENT_TIMEOUT_MS,
});
```

- **Pool size from Little's law:** concurrent connections ≈ p99 query time × peak queries
  per second. A bigger pool over an overloaded DB does not improve latency.
- **Pool saturation is a metric** (waiting requests, wait time) with an alert.

## 6 · Pagination and limits

- **Every list has a limit with a maximum** (standard-api-design.md § 7) and paginates by key, not
  with a deep `OFFSET` (standard-database.md § 7).
- **Exports and bulk operations** have their own limit, or run as a background job.
- **Request body size and uploaded file size** are capped at the entry point.
- **Request limits** per tenant and endpoint (standard-api-design.md § 13), so that one
  client does not exhaust capacity for the others.

## 7 · Background jobs and queues

- **What belongs in a queue:** calls to a slow external system, document generation, imports, e-mails,
  recalculations and anything that takes longer than the endpoint budget.
- **The request returns `202 Accepted`** with a job id; the client polls for status or receives a notification.
- **Claiming a job** via `FOR UPDATE SKIP LOCKED` or a conditional `UPDATE`, a timeout for a stuck
  claim, and idempotency (standard-database.md § 8).
- **A queue has metrics:** depth, age of the oldest job, processing time, failure count.
  Growing age is an earlier signal than errors.
- **Scale workers separately** from the API, so that a batch does not slow down interactive traffic.
- **Non-idempotent sends** (e-mail, notification): a limited number of retries with backoff,
  the deduplication state is not deleted on failure, the client timeout is longer than the provider's slow tail.
  "Failed" does not mean "not delivered".

## 8 · Timeouts and backpressure

- **Every outbound call has a timeout** for connect, read and total, with cancellation (`AbortController`)
  (§ 10.4 of the guide). A timeout without cancellation lets the work keep running.
- **The deadline propagates:** outbound timeout = min(default, remaining time of the incoming request).
- **The DB has a `statement_timeout`** for the application role; a long report runs under a different role or in the background.
- **Backpressure instead of an in-memory queue:** when the pool or queue is full, reject fast
  (`503` or `429` with `Retry-After`), do not pile up waiting requests forever.
- **Bulkhead** with two or more dependencies: each has its own concurrency cap, a slow dependency
  does not exhaust the whole process.
- **Only one layer retries.** Three layers with three attempts each are 27 calls and turn a slow
  dependency into a dead one.

## 9 · Load tests

- **When:** before first exposure, before an expected peak, after an architecture change
  (new queue, pooler, cache), when a capacity regression is suspected.
- **Where:** in an environment structurally identical to production, with data volumes matching production and
  with multiple tenants. Never against production without agreement.
- **Scenarios:** normal load, peak (2 to 3× normal), ramping load until failure, a long run
  (hours) for memory and connection leaks.
- **Tool:** a scripted generator (e.g. k6, Artillery) with a realistic mix of endpoints,
  not a single endpoint in a loop.

```js
// k6: ramp to peak, fail the run when the budget is broken
export const options = {
  stages: [
    { duration: "2m", target: 50 },
    { duration: "5m", target: 150 },
    { duration: "2m", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p(95)<200", "p(99)<500"],
    http_req_failed: ["rate<0.01"],
  },
};
```

- **What to report:** throughput, p50/p95/p99 per endpoint, error rate, saturation (CPU, memory,
  pool, queue depth, DB), the breaking point and what broke first, the configuration (instances,
  pool size, version, data volume).

## 10 · Capacity planning and costs

- **The capacity of one instance** is measured by a load test (requests per second while staying within
  budget, recorded with date, data volume and version). Required number of instances = peak / instance capacity + headroom for losing one.
- **The bottleneck is usually the DB**, not the application. Watch connections, CPU, I/O and table growth; scaling the DB
  is more expensive and slower than adding an instance.
- **Data growth:** estimate rows per tenant per month; tables growing without bound need
  archiving or partitioning before they slow down indexes.
- **Costs:** every speedup and every scaling step has a price. Compare the cost of instances, DB, cache and
  monitoring with the benefit. Logs and traces at 100 % sampling can cost more than compute.
- **Autoscaling has an upper cap**, otherwise a bug or an attack means an unlimited bill.

## 11 · Performance regressions in CI

- **Bundle size** is checked on every PR against the budget; exceeding it stops the build.
- **Lighthouse (or a similar run)** over key pages with thresholds for LCP, CLS and TBT.
- **N+1 test:** an integration test counts queries on a critical endpoint; an increase is a failure.
- **A benchmark of critical paths** on the same machine compares against the baseline; a tolerance (e.g. 10 %)
  against noise, otherwise the test flickers.
- **A budget is changed only deliberately** in a PR with a reason and a new baseline, never silently.

## 12 · Performance by milestone

| Milestone | What is done |
|---|---|
| M0 (PoC) | timeouts on outbound calls, list limits, indexes on filters; structured logs with duration; no optimization without measurement |
| M1 (MVP) | latency histograms per endpoint, tracing, baseline of critical paths, bundle budget in CI, pool with a saturation metric, slow work in a queue |
| M2 (v1.0) | budgets with SLO-based alerts, load test before release, capacity plan, shared cache where measurement showed it, bulkhead and backpressure, cost monitoring |

## Checklist

- [ ] Every critical path has a baseline, a budget (p95/p99) and a measurement date.
- [ ] Latency is tracked by a per-endpoint histogram, no averages.
- [ ] An optimization has measurements before and after using the same procedure.
- [ ] A slow query has `EXPLAIN (ANALYZE, BUFFERS)` under the application role.
- [ ] No cache, lock or counter in module memory.
- [ ] The cache key includes the tenant and has a TTL; a write invalidates the cache after commit.
- [ ] A cache outage leads to reading from the DB, not to an empty result.
- [ ] The sum of pool caps is below `max_connections` with headroom.
- [ ] The application role has a `statement_timeout`.
- [ ] Every list has a limit with a maximum and key-based pagination.
- [ ] Work longer than the endpoint budget goes to a queue; the queue has depth and age metrics.
- [ ] Every outbound call has a timeout with cancellation; only one layer retries.
- [ ] With a full pool or queue, the service rejects fast with `Retry-After`.
- [ ] The bundle budget and CWV are guarded in CI.
- [ ] A load test ran before first exposure and the result is recorded.
- [ ] Autoscaling has an upper cap and costs have a dashboard.

## Anti-patterns

- **Optimization by gut feeling** without a profile and without a second measurement.
- **Average latency** as the only number; it hides the slow tail users feel.
- **Measuring on an empty development DB** or as a superuser.
- **A `Map` as a module cache** across multiple instances: each instance returns a different truth.
- **A pool without a cap**, or a cap multiplied by the number of instances exceeding the DB limit.
- **Deep `OFFSET`** instead of key-based pagination.
- **Retries within retries** and a timeout without cancellation.
- **An in-memory queue** instead of rejecting under overload.
- **A load test of a single endpoint** in a loop and reporting only throughput.
- **A budget raised silently** to make CI pass.
- **100% tracing and an info log for every request** under heavy traffic.
