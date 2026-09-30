# Standard: API design

Uniform rules for the HTTP API between client and server: URL shape, methods, errors, pagination,
versions, idempotency, permissions and limits. The API is a contract; every endpoint is a commitment that cannot be taken back.

Builds on: ../project-structure-design.md (§ 1 structure and layers, § 2 structure rules and operational rules, § 10.4 resilience, § 15 guards S6, S7)

## 1 · Core principle

- **Design from the client, not from the tables.** The question is "what does the client need to DO?", not "which
  tables do I have?". Endpoints come from the use cases in the specification.
- **No generated CRUD over the DB schema.** You end up with an API nobody asked for, and the
  internal shape of the data gets glued onto the public contract.
- **The default protocol is REST + JSON** (`application/json`, UTF-8). GraphQL or gRPC only
  as a recorded decision with a reason.
- **One response shape across all endpoints.** No per-endpoint surprises.
- **Why:** a custom error format or envelope on every endpoint multiplies the cost of every integration.

**Placement in the layers** (§ 1 of the guide):

| Layer | What it does in the API |
|---|---|
| `http/<area>Router.ts` | registers routes via `defineRoute`, validates input, checks permissions |
| `<area>Actions.ts` / `<area>ReadModels.ts` | performs the operation or assembles the read; knows nothing about HTTP |
| `domain/`, `<area>Sql.ts` | rules and data; HTTP status codes do not belong here |
| `packages/contracts` | Zod schemas of requests and responses, shared by client and server |

## 2 · Resource naming

- **Plural nouns:** `/users`, `/orders`, `/payments`. Not `/user`.
- **No verbs in the URL:** `/getUsers`, `/createOrder` are wrong; the HTTP method carries the action.
- **Nesting at most two levels:** `/users/{id}/orders` yes,
  `/users/{id}/orders/{id}/items/{id}` no. A deeper relation = a separate resource or a query parameter.
- **Identifiers in the path, filters in the query:** `/orders/{id}`, `/orders?status=open`.
- **English names**, `kebab-case` in the path, `snake_case` in JSON (TypeScript identifiers stay `camelCase`, conversion at the boundary
  in the contract).
- **A business operation that is not a plain write** (approval, cancellation) is modeled as a
  subresource or a state change (`POST /orders/{id}/cancellation`, `PATCH /orders/{id}`), not as a
  verb in the URL.

## 3 · Methods and status codes

| Method | Purpose | Idempotent per HTTP | Typical success response |
|---|---|---|---|
| `GET` | read | yes | `200` |
| `POST` | create or business operation | no | `201` + `Location`, or `200` |
| `PUT` | replace the whole resource | yes | `200` or `204` |
| `PATCH` | partial update | no (need not be) | `200` |
| `DELETE` | removal | yes | `204` |

| Code | When |
|---|---|
| `400` | invalid request (shape, types, missing field, missing `Idempotency-Key`) |
| `401` | login missing or invalid |
| `403` | the logged-in user lacks permission for the action |
| `404` | the resource does not exist, or belongs to another tenant (§ 10) |
| `409` | conflict with the resource state (concurrent change, disallowed state transition) |
| `422` | same idempotency key with a different body (§ 8) |
| `429` | request limit exceeded, always with `Retry-After` |
| `500` | unexpected server error, no detail for the user |
| `503` | service or dependency unavailable (including the idempotency store) |

- **An error never returns `200`.** A failure does not pretend to be an empty result.
- **`GET` changes nothing.** A side effect in a read breaks both caching and retries.

## 4 · Response shape

```
success:       { "data": T }
success list:  { "data": T[], "next_cursor": string | null, "has_more": boolean }
error:         RFC 9457 Problem Details (§ 5)
```

- **The `data` envelope** leaves room for metadata without changing the shape.
- **Output is validated by the schema** just like input (`defineRoute`, § 11). The server does not return
  a field the contract does not know (leak of internal columns).

## 5 · Errors per RFC 9457

- **Content-Type:** `application/problem+json`.
- **Standard fields:** `type` (stable URI of the error type, documentable), `title` (the same
  for all occurrences of the type), `status`, `detail` (the specific occurrence), `instance` (reference to
  this occurrence for support).
- **Extensions:** `retryable` (may the client retry?), `trace_id` (link to logs and tracing),
  `errors` (list of field errors for validation).
- **No stack trace, SQL or secrets in the response.** The detail goes to the log with `trace_id`.

```json
{
  "type": "https://api.example.com/errors/validation",
  "title": "Request validation failed",
  "status": 400,
  "detail": "2 fields are invalid",
  "instance": "/errors/7f3c2a",
  "retryable": false,
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "errors": [
    { "field": "email", "code": "invalid_format", "message": "Must be a valid email" },
    { "field": "quantity", "code": "too_small", "message": "Must be at least 1" }
  ]
}
```

- **The client reads `retryable` and `Retry-After`;** the `retryable` field takes precedence over the client's own
  list of retryable codes.
- **The error shape is produced in one place only** (`defineRoute` or a shared error handler), not
  by individual routes.

## 6 · Validation at the boundary

- **Validation happens on input in the router**, before business logic. Actions and the domain receive
  already typed, verified data.
- **All errors are returned at once**, not one at a time.
- **Why:** otherwise a client with five invalid fields submits five times.
- **There is one schema, in `packages/contracts`;** the client uses it for the form, the server for
  validation. No second hand-written copy.
- **Unknown fields** are rejected or dropped by one rule for the whole API (Zod
  `strict` or `strip`), not by the mood of the endpoint.
- **Business rules** (sufficient stock, allowed state transition) belong in the domain, not in the
  schema; violating them returns `409` or `422` with its own `type`.

## 7 · Pagination, filtering, sorting

**Every list has a limit with a maximum** (§ 2 of the guide). A list without a limit is a bug.

- **Parameters:** `?cursor={opaque}&limit={int}`; default `limit` 20, maximum 100. A higher
  value is clamped to the maximum or returns `400`, uniformly for the whole API.
- **Response:** `data`, `next_cursor` (`null` on the last page), `has_more`.

| Method | When | Why |
|---|---|---|
| **Cursor** (default) | data that changes (rows are added, deleted) | stable, neither skips nor duplicates a record |
| **Offset** | only static or immutable data (code lists) | shifts when rows are inserted or deleted between pages |

- **The cursor is opaque** (e.g. the encoded last sort key + id); the client does not build it.
- **Sorting is deterministic:** it always ends with a unique column (`createdAt, id`), otherwise
  the cursor skips.
- **Filters as query parameters** with a fixed list of allowed fields in the schema:
  `?status=open&createdFrom=2026-01-01`.
- **Sorting:** `?sort=createdAt` / `?sort=-createdAt`, only through an allowed list of fields.
- **Filtered and sorted columns have an index;** no query in a loop (N+1).

## 8 · Idempotency of writes

The network fails even after a successful write; the client does not know whether the operation happened. A retry without a key
= a silent double execution (two orders, two payments).

- **When:** writes with a side effect (`POST`, `PATCH`, payment, e-mail, publishing to a queue).
  `PUT` and `DELETE` are idempotent per HTTP, the key is optional for them.
- **Header:** `Idempotency-Key`, the client generates a UUIDv4. Missing on an endpoint that
  requires it: `400`.
- **Key namespace:** `{tenant}:{endpoint}:{key}`.
- **States:** `NEW → PROCESSING → DONE | FAILED`.
- **A duplicate request** with the same key and body returns the stored response, the operation is
  not repeated.
- **Same key, different body:** `422`. The hash of the canonical JSON body is compared.
- **`PROCESSING` has a timeout** (default 30 s); after a process crash it moves to `FAILED`, otherwise the key
  gets stuck forever.
- **The key store is shared** (DB or a shared cache, not process memory), default TTL 24 h,
  longer for payments.
- **Store unavailable: `503`, fail closed.** A double write is worse than an outage.
- **Only one layer retries** (typically the API client), never retries within retries.
- **A send that cannot be made idempotent** (notification, e-mail through a third-party provider):
  "failed" does not mean "not delivered". The sent marker survives an error, retries are limited and
  spread over time, the client timeout is longer than the provider's slow tail.
- **Why:** a short timeout against a slow provider plus resetting the marker after an error leads to
  dozens of duplicate messages; any one of the three causes is enough, fix all three.

## 9 · Login and permissions per route

- **Every route declares its permission** in `defineRoute` (`permission`). A route without it
  does not pass typecheck.
- **A public route is explicit** (`permission: "public"`), never the default state.
- **The check is on the server,** in one place; the client only displays permissions (hides buttons).
- **`401` vs `403`:** an anonymous user gets `401`, a logged-in user without the right gets `403`.
- **Record-level permission** (owner, role in the project) is verified in the action or read model against
  the specific record, not only by the role on the route.
- **After an exposure change** (new public route, new login boundary) a probe verifies that
  protected routes without login return `401`/`403`, never `2xx` (§ 10.2 of the guide).

## 10 · Tenant isolation (tenant scoping)

- **The tenant is taken from the login context** (`ctx`), never from the body, query or a header sent by the
  client.
- **Every query filters by tenant** in the `*Sql.ts` layer; ideally with a safeguard in the DB (row-level
  security or a mandatory column in all keys).
- **Another tenant's record returns `404`,** not `403`; the response does not reveal that the record exists.
- **The tenant is part of the keys** for idempotency, cache and limits.
- **A test for every area:** a user of tenant A can neither read nor change a record of tenant B.

## 11 · The contract in shared schemas

- **`packages/contracts`** holds the Zod schema of the request and response of every endpoint; types are
  derived from it (`z.infer`), not duplicated.
- **Routes only via `defineRoute`** (guards S6, S7): method, path, `request`, `response`,
  `permission`, `handler`. Any other way of registering fails lint.
- **The client calls the server only via `modules/<area>/api.ts`,** which uses the same schemas.
- **API documentation is generated from the definitions** (OpenAPI); hand-written documentation goes stale.
- **A schema change is a contract change:** it goes through the versioning rules (§ 12).

## 12 · Versioning and backward compatibility

- **Version in the path:** `/v1/orders`. Visible, cacheable, unambiguous. Not in a header
  (hidden, breaks caching, requires coordination).
- **Evolve additively:** a new field, a new endpoint, a new optional parameter at any time.
- **A breaking change = a new version:** removing or renaming a field, changing a type or
  meaning, a new required input field, narrower allowed values, a different status code.
- **The current and previous versions run side by side** (N and N-1).
- **Retiring a version:** `Deprecation` and `Sunset` headers (RFC 8594) with a date, an entry in
  `CHANGELOG.md`, a notice period of typically 6 months.
- **Even an internal API** with a client from the same repo changes the contract additively: an open browser
  can hold the old client even after deployment.

## 13 · Request limits (rate limiting)

- **Every endpoint has a limit,** internal and external. Otherwise a broken internal client takes down the service.
- **Response when exceeded:** `429` + `Retry-After: {seconds}`, RFC 9457 body with
  `retryable: true`.
- **Informational headers** (common convention, not a standard): `X-RateLimit-Limit`,
  `X-RateLimit-Remaining`, `X-RateLimit-Reset`.
- **Sliding window per client and endpoint;** starting points: 1000/min logged in,
  100/min anonymous. Exact values are set per endpoint and recorded.
- **The counter lives in shared storage,** not in instance memory (the application runs in multiple instances).
- **The client respects `Retry-After`** before its own backoff.

## 14 · Scope by milestone

| Milestone | Mandatory |
|---|---|
| M0 PoC | REST + JSON, basic validation, uniform error shape |
| M1 MVP | cursor pagination, rate limiting, RFC 9457, `/v1/` prefix, idempotency of writes |
| M2 v1.0 | enforced version policy, `Deprecation`/`Sunset` headers, per-endpoint limit tuning |

## Checklist

- [ ] the endpoint comes from a use case, not from a table
- [ ] URL: plural noun, no verb, nesting at most 2 levels
- [ ] method and status code match the table in § 3; an error never returns `200`
- [ ] route registered via `defineRoute` with an input schema, output schema and permission
- [ ] schemas in `packages/contracts`, client and server use the same ones
- [ ] validation returns all field errors at once, `400` in RFC 9457 shape
- [ ] all errors are `application/problem+json` with `type`, `title`, `status`, `retryable`, `trace_id`
- [ ] the response contains no stack trace, SQL or internal fields
- [ ] the list has a `limit` with a maximum; cursor for changing data; deterministic sorting
- [ ] filters and sorting only through an allowed list of fields; the columns have an index
- [ ] a write with a side effect accepts `Idempotency-Key`; a duplicate returns the stored response
- [ ] the same key with a different body returns `422`; `PROCESSING` has a timeout; store unavailable = `503`
- [ ] tenant from the login context, every query filters by tenant, another tenant's record = `404`
- [ ] tenant isolation test for the affected area
- [ ] the endpoint has a rate limit, `429` with `Retry-After`
- [ ] the contract change is additive, or has a new version and an entry in `CHANGELOG.md`
- [ ] the generated API documentation matches the schemas

## Anti-patterns

- **CRUD generated from the DB schema:** an API nobody asked for, with the internal data shape exposed.
- **Verbs in the URL** (`/getUser`, `/createOrder`): that is what HTTP methods are for.
- **A custom error format per endpoint:** every integration gets written again.
- **`200` with `{ "error": ... }` in the body:** neither the client, the cache nor monitoring recognizes the error.
- **Validation errors one at a time:** the client fixes the form in five attempts.
- **Offset pagination over changing data:** records are skipped and duplicated.
- **A list without a limit:** one request downloads the whole table.
- **Retrying a write without an idempotency key:** silent double execution.
- **Retries in multiple layers:** 3 layers × 3 attempts = 27× load on the dependency.
- **Tenant from the request body or URL:** changing a number is enough for a user to read another tenant's data.
- **Permissions only on the client:** a hidden button is not a check.
- **Version in a header:** hidden, breaks caching.
- **A silent breaking change** without a new version: the old client crashes without warning.
- **Rate limit only on the public API** or a counter in instance memory.
- **Nesting deeper than two levels:** flatten it or use a query parameter.
