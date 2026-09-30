# Standard: database (PostgreSQL)

Rules for schema, migrations, tenant isolation, concurrency and performance in PostgreSQL.
Applies to every application that runs in multiple instances and serves multiple tenants.

Builds on: ../project-structure-design.md (§ 1 structure, § 2 structure rules and operational
rules, § 10 deployment, § 15 structure guards)

## 0 · Summary

**Core idea:** the database is the last line of defense. Whatever must always hold is enforced by the DB
(constraint, policy, grant, trigger), not by code discipline. And every claim about the DB is verified
against the catalog and against the running instance, not against files in the repo.

1. **The only access to the DB is `<area>Sql.ts`**; no SQL in routers, actions or read models.
2. **Structural rule = constraint in the DB**, changing policy = one layer of code.
3. **Migrations are additive only**, staging first, destructive change with a separate confirmation.
4. **Tenant isolation is enforced by RLS under a role that owns nothing**, and is tested with a query without `WHERE`.
5. **Concurrency is closed by a writing statement with a condition in `WHERE`**, not by a transaction.
6. **A write whose result something depends on checks the row count.**
7. **Every isolation, concurrency or guard test has a control run:** remove the protection, the test must turn red.

## 1 · Schema design and naming

- **Names:** `snake_case`, English, tables consistent (either all singular or all
  plural). Columns without a table prefix (`status`, not `order_status`), foreign key `<entity>_id`.
- **Primary key:** `id uuid` (or `bigint generated always as identity`), never a business
  value (invoice number, e-mail).
- **Tenant:** every table with tenant data has `tenant_id uuid not null` and a foreign key to `tenants`.
  Relations between tables of the same tenant can carry `tenant_id` in a composite FK, so that a row cannot
  point to a record of another tenant.
- **Types:** time always `timestamptz`, money `numeric(p, s)` (never `float`), states as `text`
  with `CHECK` or an enum, JSON only `jsonb` and only for a truly free-form structure.
- **`NOT NULL` is the default**, `NULL` only where "unknown" is a valid state and the code handles it.
- **Audit columns:** `created_at`, `updated_at` (trigger), for sensitive tables also who made the change.
- **One meaning, one representation.** For a "live record" one condition (e.g. `expires_at > now()`),
  not a second `is_active` column next to it. Why: two representations of the same state drift apart over time.

## 2 · Where invariants live

| Rule | Where | Example |
|---|---|---|
| Uniqueness | `UNIQUE` (including a partial index) | one active user per e-mail and tenant |
| Relation | `FOREIGN KEY` | an item belongs to an existing order |
| Value range and shape | `CHECK` | `amount >= 0`, allowed states |
| Who sees which rows | RLS policy | only rows of your own tenant |
| Who may run which statement | `GRANT` / `REVOKE` | the application role may not `DELETE` on the audit |
| Which columns who may change | `BEFORE` trigger (§ 6) | a worker does not change the amount |
| Changing business policy | one layer of code | discount, approval limit |

- **Never duplicated.** A constraint in the DB and the same check in code drift apart; code may repeat
  the check only to give the user an understandable error, and the DB remains the source of truth.
- **Constraint errors are translated in `<area>Sql.ts`** (e.g. `23505` to "already exists"),
  not in the router. A raw DB error must never reach the user.
- **A rule you repeatedly "almost" manage to write as a predicate may be of the wrong kind.**
  When yet another condition in the policy still is not enough, ask whether it is a rule over columns
  (trigger), not over rows (RLS).

## 3 · Migrations

- **Additive only.** An applied migration is never edited; the fix is a new migration. Why:
  the runner will not run an edited file a second time and environments silently drift apart.
- **Staging first, then production**, production only on an explicit "yes" (project-structure-design.md § 10).
- **A destructive change gets a separate confirmation:** `DROP TABLE/SCHEMA/DATABASE`,
  `DROP COLUMN`, `TRUNCATE`, `DELETE` without `WHERE`. The guard in the hook blocks exactly these
  shapes (other `CASCADE`, e.g. `DROP VIEW ... CASCADE`, is covered by review) and lets them through only with a visible escape hatch (an environment variable in the command).
  The guard reads text: it does not see SQL generated at runtime (schema push), migrations run via
  `npm run`, or file includes. It turns a silent action into a conscious one, and claims nothing more.
- **`CASCADE` is not used in migrations or test teardown.** Even when PostgreSQL itself
  recommends it in a `HINT`. Why: `DROP ... CASCADE` on one partition can delete foreign keys
  valid for all tenants, reports it with just one `NOTICE`, and the data stays unprotected.
  Safe order for partitions: first the child partition, then `DETACH PARTITION`, then `DROP`.
- **A guard for a destructive operation also covers the siblings.** A check of the FK count catches
  `DROP ... CASCADE`, but lets through `TRUNCATE ... CASCADE`, which wipes the data of all tenants.
  Guard both the constraint count and the row count, and above all forbid the verb itself.
- **A migration verifies its result.** `REVOKE` without privileges ends with just a `WARNING` and the migration is
  recorded as applied. At the end, add a `DO` block that measures the state and raises an error on mismatch.
- **The runner usually runs all pending migrations in one transaction:** one failed
  statement rolls back the whole batch. Write statements over objects you do not own (managed platform,
  extensions) as a loop over the objects, and then verify the final state.
- **Do not determine migration state from the timestamp in the migrations table**, some tools
  store a value from the repo there, not the time of application. Count rows against the migration files.
- **Catalog, not repo.** Before rewriting a function, policy or trigger, load what the DB actually
  runs, and compare your version line by line. The only difference may be your change.

```sql
SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'my_function';
SELECT * FROM pg_policies WHERE tablename = 'orders';
-- likewise pg_trigger (incl. timing and order), pg_constraint, pg_default_acl
```

Why: the repo says what was intended, the catalog says what holds. A migration "same as in the file,
just with my change" can silently revert everything that was added in the meantime through another path.

- **State the dataset.** "0 rows changed out of 1 total" is honest, "verified on production data"
  over a single test row is not. On test data, build the cases deliberately.

## 4 · Tenant isolation (RLS)

### 4.1 The shape that works

1. **The policy lives in the schema** (in a migration or ORM declaration), one shared helper for
   the tenant predicate.
2. **The application connects with a role that owns nothing** and has neither `SUPERUSER` nor `BYPASSRLS`.
   RLS does not bind a superuser or the table owner. The owner role serves only migrations
   and provisioning, under a different connection string.
3. **The tenant for the request as a GUC in the transaction**, local (`is_local = true`), so that
   a pooled connection does not pass it on to the next caller. The wrapper is in the data layer; an explicit
   `tenant_id` in `WHERE` remains as a second layer.
4. **Guard at startup:** the application refuses to run when its role bypasses RLS.
5. **Exceptions are named and have minimal grants.** Tables that only determine the tenant
   (sessions, API keys, tenants, intake before tenant assignment) cannot carry a policy. They get
   only the DML statements their code actually calls.
6. **Proof against real PostgreSQL**, never against a mock (§ 4.4).

```sql
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY orders_select ON orders FOR SELECT
  USING (tenant_id = app.current_tenant());
CREATE POLICY orders_update ON orders FOR UPDATE
  USING (tenant_id = app.current_tenant())
  WITH CHECK (tenant_id = app.current_tenant());
-- INSERT (WITH CHECK only) and DELETE (USING only) follow the same shape

-- per request, inside the transaction
SELECT set_config('app.tenant_id', $1, true);

-- boot guard: refuse to serve when true
SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = current_user;
```

**A missing tenant must raise an error, not return nothing.** The predicate
`tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid` without a set
tenant returns zero rows, which looks like an empty tenant. `nullif` is necessary because the GUC
reverts to an empty string after the transaction, not to "not set". Better is a function that raises an error:

```sql
CREATE FUNCTION app.current_tenant() RETURNS uuid LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_tenant text := nullif(current_setting('app.tenant_id', true), '');
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant not set' USING ERRCODE = '42501';
  END IF;
  RETURN v_tenant::uuid;
END $$;
```

When the error is actually raised depends on the shape of the policy (see pitfalls). Verify it on your own schema.

### 4.2 Pitfalls

- **Access is governed by GRANT, RLS only filters rows.** On tables without RLS, only the grant decides.
  A managed platform often gives its roles (e.g. `anon`, `authenticated`) everything on the `public`
  schema; on exceptions without a policy that means read and write for an unauthenticated user.
  Why: tables with RLS hide this (a role without a policy sees zero rows), exceptions do not.
- **When dismissing a finding, list the roles the platform created**, not just your own
  (`SELECT rolname FROM pg_roles`).
- **The fix is `REVOKE`, not enabling RLS on the exception.** Zero-policy RLS is default-deny and
  login is the first thing to die. Revoke privileges on tables, sequences, functions and `ALTER DEFAULT PRIVILEGES`.
  Do not revoke `USAGE ON SCHEMA public FROM PUBLIC`: `PUBLIC` includes the platform's internal roles too,
  and the pooler and migrations stop working, while `USAGE` alone grants no access.
- **`EXECUTE` on functions belongs to `PUBLIC` by default.** Revoke it on functions you own,
  and give the application role `GRANT EXECUTE` explicitly.
- **Grants propagate, protection does not.** Default privileges give a new table DML, but not RLS
  and policies. A read-only table therefore needs an explicit `REVOKE INSERT, UPDATE, DELETE`.
  Guard the generator too (`pg_default_acl`), not just today's object ACLs.
- **Check effective privileges** (`has_table_privilege`, `has_any_column_privilege`), not the ACL
  text. Caution: they do not follow membership in roles with `NOINHERIT`. Where the roles do not exist (local, CI),
  "nothing found" is worthless; the test creates the roles, repeats the grant and verifies that the check turns red.
- **A `FOR ALL` policy with a relaxed `USING` is a write hole.** `USING` determines which existing
  rows a write may touch, `WITH CHECK` only the new row. A read exception ("global or mine")
  on `FOR ALL` lets through `UPDATE`/`DELETE` of global rows. Split the policy per statement.
- **A constant sibling cancels the protection.** A permissive policy `USING (true)` next to a policy
  with an error-raising function: the planner folds `OR true` into `true` and returns all rows without an error.
  A non-constant sibling, on the other hand, lets the error reach a legitimate read before tenant selection.
  Guard with a test over `pg_policies`.
- **RLS does not propagate to partitions.** The policy is only on the parent, a partition is protected
  only by grants. `GRANT ... ON ALL TABLES IN SCHEMA` then allows reading another tenant's partition by name.
  Grant only the parent.
- **`FORCE ROW LEVEL SECURITY` applies to the owner too.** A maintenance job without a tenant then reads
  zero rows and finishes successfully, forever. Only `SUPERUSER` or `BYPASSRLS` bypass it, not
  ownership. The job has a guard:

```sql
DO $$ BEGIN
  IF row_security_active('document_tombstones') THEN
    RAISE EXCEPTION 'RLS active for this role: the job would read 0 rows and report success';
  END IF;
END $$;
```

- **RLS does not protect against SQL injection.** Anything the connection can set (GUC, `SET ROLE` with
  membership in tenant roles), injected SQL can set too. Real isolation requires logging in
  directly as the tenant. Write honestly in the documentation: RLS covers a bug in our query, not injection.
- **RLS and indexes:** an operator that is not `LEAKPROOF` (typically full-text `@@`) must not
  be evaluated as an index condition under RLS, so the GIN index is unreachable. Verify
  `pg_proc.proleakproof` on your version and diagnose with `enable_seqscan = off`.
  A vector index (HNSW) is blind to RLS: filtering happens only over the result, a small tenant's
  recall silently drops, and the result count reveals the density of other tenants' data. The solution is partitioning by
  tenant with an index per partition, not partial indexes (those lead to a sequential scan).
- **The tenant of a written row comes from the login context**, never from the request body.
  Even a write that carries the tenant in the row must run with the GUC set, otherwise `WITH CHECK` rejects it.

### 4.3 A rejected write is silent

| Statement | Rejected by | Result |
|---|---|---|
| `INSERT` | `WITH CHECK` | error `42501`, loudly |
| `UPDATE` / `DELETE` | `USING` | **0 rows, no error** |
| `SELECT` | `USING` | 0 rows, no error |

- **Every write whose result something depends on verifies the row count** (`RETURNING id`, empty
  result = rejected). Checking only for an error is not enough. Why: otherwise a subsequent step under
  a privileged key (deleting a file, an account) performs what the policy just forbade.
- **Order with a file:** when deleting, the row first, then the file; when creating, the file first,
  then the row. A row must never exist without its data, an orphaned file can be cleaned up.

### 4.4 How to test isolation

- **Real PostgreSQL**, a dedicated DB for each run (create, migrate,
  `DROP DATABASE ... WITH (FORCE)`). The owner role creates the data, the application role runs the queries.
  Without an available DB the test **fails**, it is not skipped. A mock DB has no policies, it proves nothing.
- **Queries without `WHERE tenant_id`.** A test written like the application passes even without RLS. `SELECT *`
  and the row count must match only your own tenant.
- **Through the production entry point** (the real helper that sets the role and GUC), not your own copy.
- **Write: positive check first** (a write to your own tenant must pass), then an attempt on another tenant,
  and match on the text `row-level security`, not on `42501` alone. The same code is also returned for a missing
  grant, so the test would pass and verify nothing. `WHEN check_violation` does not catch the RLS error.
- **Exception guard as equality:** tables with `tenant_id` without RLS must exactly equal
  the list of named exceptions.

```sql
SELECT c.relname
FROM pg_class c JOIN pg_attribute a ON a.attrelid = c.oid
WHERE a.attname = 'tenant_id' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
ORDER BY c.relname;
```

- **The test must not run under a role with `BYPASSRLS`**, there not even `FORCE` changes anything.
- **Test errors on the text from the database**, not on the driver's message: the driver often embeds the whole statement,
  and the assertion then finds the text of your own `RAISE` in the SQL.
- **A safe grant probe is a write read by SQLSTATE:** `23502` means the privilege check
  passed (the grant exists), `42501` means no privilege. Nothing is written.
- **Control run:** remove the role switch or the policy, the test must turn red.
- **On a managed platform, verify after the migration** that RLS is enabled exactly on the intended
  tables (`pg_class.relrowsecurity` + count of `pg_policies`). The platform console can
  enable it on all of them, the exceptions then return zero rows and login fails, while the health check stays green.

## 5 · Concurrency: check-then-act

**A transaction does not close concurrency.** In the default `READ COMMITTED` isolation, both concurrent requests
read the state before anyone writes, both pass the check and both act. A transaction gives
atomicity and rollback, not mutual exclusion.

**The correct shape:** one statement that both reads and writes, with the checked condition in `WHERE`,
and returns whether it won. PostgreSQL serializes writes to the same row: the second waits for the lock,
then re-evaluates `WHERE` against the new row version and finds nothing.

```sql
-- single-use record
DELETE FROM pending_logins
 WHERE token_hash = $1 AND expires_at > now()
RETURNING subject;

-- conditional state transition
UPDATE orders SET status = 'approved', approved_at = now()
 WHERE id = $1 AND status = 'submitted'
RETURNING id;

-- uniqueness: let the constraint decide, map 23505
INSERT INTO users (tenant_id, email) VALUES ($1, $2)
ON CONFLICT (tenant_id, email) DO NOTHING
RETURNING id;
```

- **No returned row = someone else won = reject.** The claim is the first statement of the transaction,
  not a check before it. The transaction then serves a different purpose: when something fails after the claim, rollback
  returns the claim and the resource is not consumed.
- **`UPDATE ... RETURNING` returns values after the change.** If you need the original value, read it
  beforehand (`RETURNING OLD` only exists from PostgreSQL 18) and think through in which direction concurrency can shift it.
- **Row locking needs the `UPDATE` privilege.** `FOR UPDATE`, `FOR NO KEY UPDATE`, `FOR SHARE`
  and `FOR KEY SHARE` end with `42501` without it.
- **Concurrency test:** one round with two racers is a coin toss. Many rounds, the winner count across
  all rounds, and a control run: remove the condition from `WHERE`, the test must turn red. A separate test
  for exclusion and a separate one for rollback, otherwise you will believe the transaction is what excludes.

## 6 · Column guards

**RLS cannot lock a column.** A policy says which rows you may write, not which columns.
A user satisfies every predicate and overwrites the amount underneath it. "May change part of a row" calls for
a `BEFORE INSERT OR UPDATE` trigger.

```sql
CREATE FUNCTION app.guard_invoice_columns() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_writable constant text[] := array['description', 'note', 'due_date', 'updated_at'];
BEGIN
  IF coalesce(current_setting('app.invoice_rpc', true), '') = '1' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND to_jsonb(NEW) - v_writable IS DISTINCT FROM to_jsonb(OLD) - v_writable THEN
    RAISE EXCEPTION 'column not writable on this path' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

-- inside the privileged function, transaction-local
PERFORM set_config('app.invoice_rpc', '1', true);
```

- **An allowlist of writable columns, never a denylist of locked ones.** Why: a denylist stops
  protecting with the first new column and nobody reports it. An allowlist locks a new column immediately,
  and a rename fails loudly. For `INSERT`, decide separately what values a new row may have.
- **The allowlist also contains columns written by other triggers** (`updated_at`). Triggers of the same
  event run in alphabetical order of their names; verify in `pg_trigger`, do not assume.
- **The privileged path announces itself with a local GUC** (`is_local = true`). Verify that no exposed
  function calls `set_config` with an argument from the caller, and test that the flag does not survive the transaction.
- **`SECURITY INVOKER` + a flag is better than `SECURITY DEFINER`**; definer disables RLS for
  all reads inside the function and each one has to be audited again.
- **Write guard exceptions into the migration** (for whom it does not apply) and the remaining gap into the findings log.
- **Enumerating writers:** a grep on the column name will not find a write via spread
  (`...buildRow(data)`). Also go through helper functions that assemble the payload, and compare with the
  actual list of columns.
- **Test:** a control run without the migration, the attack tests must fail and legitimate edits must pass.
  Otherwise the test may be measuring a neighboring `NOT NULL` or `CHECK`.

## 7 · Indexes and N+1

- **Every filtered, sorted and joined column has an index**, including foreign keys
  (PostgreSQL does not index them on its own). In a multi-tenant table, the index starts with `tenant_id`.
- **Partial unique index** for rules like "one active per tenant":
  `CREATE UNIQUE INDEX ON subscriptions (tenant_id) WHERE status = 'active';`
- **No query in a loop.** Instead of N queries, one with `WHERE id = ANY($1)` or a `JOIN`;
  a read model assembles a screen from a few queries, not from one per row.
- **Every list has a `LIMIT` with a maximum** and keyset pagination (`WHERE (created_at, id) < ($1, $2)`),
  not a deep `OFFSET`.
- **Verify the plan under the application role**, not under a superuser: RLS changes which indexes are
  usable (§ 4.2). `enable_seqscan = off` reveals the difference in index availability.
- **An expression in the predicate that has no index** (`to_tsvector(...) @@ ...`, a function over a column)
  means a sequential scan; index the expression or store the computed value.

## 8 · Background jobs

The application runs in multiple instances, so several workers may want to process the same record.
A job **claims the record first** and only then does the work.

```sql
-- queue: take the next job, skip rows another worker holds
UPDATE jobs SET status = 'running', locked_by = $1, locked_at = now()
 WHERE id = (
   SELECT id FROM jobs
    WHERE status = 'queued' AND run_after <= now()
    ORDER BY run_after
    FOR UPDATE SKIP LOCKED
    LIMIT 1)
RETURNING id, payload;

-- single known record: conditional UPDATE
UPDATE invoices SET sync_status = 'syncing'
 WHERE id = $1 AND sync_status = 'pending'
RETURNING id;
```

- **Empty result = there is no work or another worker has it**, not an error.
- **A stuck claim has a timeout:** `running` with `locked_at` older than the limit returns to the queue.
- **Repeatability:** the job is idempotent and writes its result conditionally based on state.
- **A job without a tenant over a table with RLS** needs a role with `BYPASSRLS` and the
  `row_security_active` guard (§ 4.2), otherwise it silently does nothing.
- **An error is logged with the record id and the state is set to `failed`** with the attempt count; never a silent `catch`.

## 9 · Transactions

- **Transactions at the action level** (`<area>Actions.ts` via a helper from `db/`), `<area>Sql.ts`
  accepts a passed-in connection. The router does not open transactions.
- **Short.** No calls to an external system and no waiting for the user inside a transaction; it holds locks
  and a connection from the pool.
- **Tenant context and guard flags only transaction-local** (`set_config(..., true)`,
  `SET LOCAL`). Why: otherwise a pooled connection carries the value over to the next request.
- **Higher isolation (`SERIALIZABLE`) only with retries** on `40001`; without them it is just a different kind of error.
- **`NOTICE` and `WARNING` are not exceptions:** drivers usually do not show them and the transaction passes.
  Verify what must hold with a query and raise an error on mismatch.

## Checklist

- [ ] All queries only in `<area>Sql.ts`; the action opens the transaction.
- [ ] Tenant tables have `tenant_id not null`, FK and index; money `numeric`, time `timestamptz`.
- [ ] Uniqueness, relations and ranges are constraints; errors `23505`/`23503`/`23514` are translated.
- [ ] Migrations only added, went through staging, verify their result; a destructive statement has
      a separate confirmation; no `CASCADE` in migrations or teardown.
- [ ] A rewritten function, policy or trigger compared with the catalog, not with the file.
- [ ] The application runs under a role without ownership, `SUPERUSER` and `BYPASSRLS`; guard at startup.
- [ ] Tenant as a local GUC in the transaction; a missing tenant raises an error.
- [ ] Policies split per statement; no constant permissive sibling.
- [ ] Tables without RLS equal the named exception list (test).
- [ ] Platform roles without privileges (tables, sequences, functions, default privileges); read-only
      tables with an explicit `REVOKE INSERT, UPDATE, DELETE`; for partitions, grant only on the parent.
- [ ] Isolation tests: real PostgreSQL, queries without `WHERE tenant_id`, production entry point,
      for writes a positive check and a match on `row-level security`.
- [ ] A write with a follow-up action checks the row count (`RETURNING`).
- [ ] Check-then-act solved with a conditional write; the concurrency test has many rounds and a control run.
- [ ] Columns guarded by a trigger with an allowlist; privileged path via a local GUC.
- [ ] Every list has a `LIMIT` with a maximum; no query in a loop.
- [ ] Jobs claim their record (`SKIP LOCKED` or a conditional `UPDATE`), have a claim timeout,
      and over a table with RLS the `row_security_active` guard.

## Anti-patterns

- **"I will wrap the check and the write in a transaction"** as protection against concurrency.
- **An `if (error)` check after `UPDATE`/`DELETE` under RLS** without checking the row count.
- **A denylist of locked columns** in a trigger, or another condition in a policy instead of a trigger.
- **An isolation test with `WHERE tenant_id = ...`**, under a role with `BYPASSRLS`, or matching on `42501`.
- **Enabling RLS without a policy on a table that determines the tenant** (login stops working).
- **`REVOKE USAGE ... FROM PUBLIC` on the schema** on a managed platform; **`GRANT ... ON ALL
  TABLES`** when partitioning by tenant.
- **Editing an applied migration** or rewriting a function based on the file in the repo.
- **`DROP ... CASCADE` following a `HINT`** and a guard that covers only one verb.
- **Tenant from the request body** or a GUC set outside the transaction.
- **A query in a loop, a list without a limit, a foreign key without an index.**
- **A worker that reads the queue and writes only afterwards** without `SKIP LOCKED` or a condition in `WHERE`.
- **A mock DB or a superuser as proof** of RLS, triggers, concurrency or a query plan.
