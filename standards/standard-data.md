# Standard: data, reports and data for AI

Rules for data pipelines, transformations, reports and dashboards, and for data that AI reads.
Applies to every web application that ingests data, recomputes it or answers questions over it.

Builds on: ../project-structure-design.md (§ 1 structure, § 2 structure rules and operational
rules, § 4.1 Data role, § 4.4 milestones, § 10.3 observability), standard-database.md
(migrations, RLS, background jobs, transactions)

## 0 · Summary

**Main idea:** a number in a report is a claim. It must be traceable: where it came from, when,
how many rows it covers and who is responsible for it. A pipeline that cannot say what it left out
is worse than none, because it looks like the truth. Layers are not skipped, every run can be
repeated and checks itself, a missing value shows up as missing.

## 1 · Where data lives in the project structure

Data work is a separate area with its own folder, not scripts scattered in `scripts/`.
It is owned by the **Data** role (§ 4.1); schemas are aligned with the Backend role, which reviews the data layer.

```
project/
├─ data/
│  ├─ pipelines/<source>/     load from one source: extract, load, run state
│  ├─ sql/
│  │   ├─ staging/            typing, cleaning, deduplication (1 file = 1 model)
│  │   ├─ core/               unified facts and dimensions
│  │   └─ marts/              tables and views for reports and AI
│  ├─ contracts/              data contracts with sources (schema, grain, owner)
│  └─ tests/                  quality and transformation tests
├─ docs/data/                 catalog: metrics, grain, owners, data lineage
└─ server/migrations/         DDL of data tables and views (standard-database.md § 3)
```

- **Transformations are SQL files in git**, never a query saved only in a BI tool or in the DB.
- **DDL goes through migrations**, transformations (what fills the tables) live in `data/sql/`.
- **A pipeline does not write directly into area tables** (§ 2 rule 3); it reads through a view
  or replica, and writes only into its own schema (`raw`, `staging`, `core`, `marts`).

## 2 · Layers and grain

| Layer | What it holds | Rules |
|---|---|---|
| **Raw** (`raw`) | data exactly as it arrived | append only, no logic, used for replay and debugging |
| **Cleaned** (`staging`, `core`) | typed, validated, deduplicated | bad rows to quarantine, single source of truth |
| **Read** (`marts`) | aggregations, wide tables, materialized views | precomputed for dashboards and AI, refreshed on schedule |

- **Grain first.** A fact table starts in the catalog with the sentence "one row = ___", one grain per table.
- **Store the finest grain**, aggregate only in a view; a pre-aggregated table as the
  only source kills drill-down to detail.
- **Measure additivity:** only an additive measure can be summed. A balance is not summed over time, a ratio
  and a percentage are never summed, they are recomputed from numerator and denominator.
- **`NULL` in a measure means "not measured", not zero.** An unknown dimension has an "unknown" row, not `NULL` in the foreign key.
- **Explicit column list**, no `SELECT *` in a transformation or a view.

## 3 · Repeatable loading

- **Idempotency:** a second run with the same input gives the same result. `INSERT ... ON CONFLICT`
  or replacing the whole partition in a transaction, never a blind `INSERT`.
- **Every run has a `load_id`** and is written to a runs table with counts and status.
- **Lineage on every row:** `_load_id`, `_loaded_at`, `_source`.
- **A run locks its pipeline** (standard-database.md § 8), two concurrent runs must not exist.
- **Quarantine instead of discarding:** a bad row goes into an error table with the reason and the original content.

```sql
insert into core.order_line (source_id, order_id, amount, currency, _load_id, _loaded_at, _source)
select s.source_id, s.order_id, s.amount, s.currency, :load_id, now(), 'shop_api'
from staging.order_line s
where s._load_id = :load_id
on conflict (source_id) do update
set amount     = excluded.amount,
    currency   = excluded.currency,
    _load_id   = excluded._load_id,
    _loaded_at = excluded._loaded_at
where (core.order_line.amount, core.order_line.currency)
      is distinct from (excluded.amount, excluded.currency);
```

## 4 · Incremental and full load

| When | Method | Watch out for |
|---|---|---|
| Small source, cheap reads, source can delete | **full** load into a new version, switch in a transaction | deleted rows disappear correctly only with a full switch |
| Large source with a reliable `updated_at` | **incremental** via a high-water mark | late writes, deleted records |
| Source sends events (webhook, queue) | **incremental** by event id | duplicates, ordering, delivery outage |

- **The mark is taken from the data, not the clock:** new mark = `max(updated_at)` from the loaded rows, not `now()`.
- **Overlapping window:** read from `mark - overlap`, idempotency absorbs the duplicates.
- **Deletion in the source is handled explicitly** (a `deleted_at` flag, key comparison, or a periodic
  full comparison). An incremental load without it silently keeps dead rows.
- **A full recompute must be possible at any time** from the raw layer; without it a transformation bug cannot be fixed.

## 5 · Data contract with the source

One file per source in `data/contracts/`:

| Item | Content |
|---|---|
| Owner | who on the source side is responsible for changes |
| Grain and key | what one record is, what uniquely identifies it |
| Fields | name, type, required, unit, allowed values, forms in which it has already arrived |
| Freshness | how often the data changes and what delay is still acceptable |
| Deletion | how the source reports a deleted record |
| Behavior on change | what the pipeline does with an unknown field or a changed type |

- **The contract is a test, not a document:** the pipeline verifies it on every run.
- **The schema of every table is described** in the catalog (`docs/data/`): column meaning, units, grain.

## 6 · Quality checks on every pipeline

A run without checks does not exist. A failed blocking check stops publishing into `marts`.

| Check | What it verifies | On failure |
|---|---|---|
| **Counts** | loaded = received - quarantine; deviation from the average of recent runs | blocks |
| **Required** | `not null` on grain keys; share of `NULL` in other columns within limits | blocks / warns |
| **Uniqueness** | the grain key is unique | blocks |
| **Allowed values** | states, currencies, ranges | blocks |
| **References** | every foreign key finds its dimension | row quarantine |
| **Freshness** | the newest record is not older than the limit from the contract | alert |

- **A check enumerates, it does not filter.** The output is a list of added, lost, changed
  and moved rows. A hand-written exception list is a claim that goes stale, and a check using it
  confirms only what the author already believed.
- **An equal count does not prove equal rows.** In a recompute compare keys and values, not just totals.
- **Verify a new test by making it fail** on bad data. A test that never failed proves nothing.
- **Log counts and schemas, never row content.**

## 7 · External and vendor data

A field whose type you do not own will change type one day. The source will not announce it and the host often swallows the error.

- **Decode section by section, not the whole payload at once.** An unknown shape in one part costs only that
  part, not the whole record. Only input that is not a readable format at all fails loudly.
- **Accept every form the field has ever had** (text and number for a date, both time notations).
- **Tolerant in shape, strict in content:** drop unknown keys, a missing field is unknown,
  every value passes through the sanitizer for its type. Reject ambiguous values, do not guess
  (`24.200` means twenty-four thousand in Czech).
- **Give values bounds** and check them positively (`v >= lo and v <= hi`); `NaN` passes
  a negated pair of conditions.
- **Degrade, do not invent.** An old value with an age label is honest, a fresh-looking zero is not.
- **A number computed by an external tool** is verified against the authority row by row, not on the total. Offline
  mode also freezes reference data (price lists, exchange rates), and new items then silently come out as zero.
- **A zero "because nothing was priced" must be distinguishable from a real zero** and the unpriced item is named.
- **A test for every form that has ever arrived.** A fixture with only the first shape keeps the suite green
  precisely through the change that breaks production.
- **Content from outside is untrusted** (standard-security.md). AI extraction from a document has an output schema
  with only the fields you want, every field may be "unknown", and no action follows the result without a human.

## 8 · Data lineage

- **Every row in `marts` is traceable** via `_load_id` to the run, source and time.
- **The catalog lists the inputs of every read table**; the runs table lists the commit that ran.
- **Before changing a column, find all consumers** (views, dashboards, exports, AI index).

## 9 · Dashboards and reports

- **A dashboard reads only from `marts`**, never from area tables or from live transactional queries.
  No ETL logic in a BI tool query.
- **A materialized view for every heavier screen**, refreshed after a successful pipeline run.

```sql
create materialized view marts.revenue_by_month as
select tenant_id,
       date_trunc('month', invoiced_at) as month,
       sum(amount_net) as revenue_net,
       count(*) as invoice_count
from core.invoice
where cancelled_at is null
group by tenant_id, date_trunc('month', invoiced_at);

create unique index revenue_by_month_key on marts.revenue_by_month (tenant_id, month);

refresh materialized view concurrently marts.revenue_by_month;
```

- **A metric definition lives in one place** (`docs/data/metrics.md` + one SQL model).
  Two dashboards with the same metric name and a different number are a defect.
- **Every metric has an owner and an action:** who watches it and what they do when it moves (§ 10.3).
  A metric without an action is not collected.
- **Every chart has a title, axes, units and the time of the last data update.**
- **A chart distinguishes zero from "no data".** A failed pipeline must not look like a quiet period.

## 10 · Data for AI

- **Clean text:** normalization (Unicode NFKC, removal of invisible and control characters),
  no leftover HTML and navigation, deduplication of near-identical chunks.
- **Metadata on every chunk:** source, document id, section, date, `tenant_id`, access
  level. Without them you can neither filter nor cite.
- **Chunking by meaning** (headings, paragraphs) with a small overlap, not by a fixed character count.
- **The embedding model is pinned including its version** and stored with every vector. Changing the model =
  recomputing the whole index; two models in one index silently degrade search.
- **Raw text is stored next to the vector.**
- **The default choice is pgvector** in PostgreSQL; a separate store only when a limit has been measured.
- **Measure retrieval before blaming the model:** retrieval precision on a labeled question set.
- **An empty result is the correct answer** to a question outside the content. A similarity threshold is not
  enough for that (scores of out-of-content questions overlap with scores of correct ones). A working pattern:
  1. a deterministic check whether the question's named entities occur in the content at all
     (tolerant of inflection); if none occurs, the result is empty;
  2. the model judges the retrieved chunks all-or-nothing: nothing relevant = empty, otherwise the
     result is returned unchanged, without per-chunk pruning.
- **A judge failure is an error** (5xx), not a silent pass and not an invented empty result.

## 11 · Privacy and tenant isolation

- **Every table in `core` and `marts` carries `tenant_id`** and has RLS like the operational tables
  (standard-database.md § 4). A materialized view has no RLS: it is read only through a function or
  a view with a tenant filter, the application role gets no direct grant on it.
- **The AI index filters tenant and permissions in the query**, not after retrieval.
- **Personal data goes into `marts` only masked**, unless a screen explicitly needs it; exports encrypted with a retention period.
- **Cross-tenant aggregation** (operational overview for the application vendor) only in a separate schema,
  without tenant identification, unless the contract allows it.

## 12 · Claims about data

- **Every number says what it is from:** which dataset, what period, how many rows, what filter,
  when it was pulled. "Conversion 12 %" without a denominator is not a result.
- **Distinguish measured from derived.** The report states what was measured by a query and what is an estimate.
- **Coverage has a shape:** write what the check did not see (skipped sources, periods, tenants).
- **The conclusion "nothing was found" requires proof that a search happened** (number of rows searched, run without error).

## 13 · Data by milestone

| Milestone | Data work |
|---|---|
| **M0** | one source, manual run, verification of the hardest assumption (can it be joined at all, is the quality usable); measured numbers, no dashboard |
| **M1** | layers, idempotent load, contract, blocking quality checks, metric catalog, first materialized views |
| **M2** | scheduled runs, freshness and deviation alerts, lineage, retention and masking, retrieval evaluation for AI |

## Checklist

- [ ] The pipeline lives in `data/`, transformations are SQL in git, DDL goes through migrations.
- [ ] Every fact table has its grain written down; no `SELECT *`.
- [ ] The load is idempotent, the run has a `load_id`, rows carry lineage, the run locks the pipeline.
- [ ] Incremental mark from the data, overlapping window, deletion handled; a full recompute is possible at any time.
- [ ] Every source has a contract that is verified during the run.
- [ ] Checks: counts, required, uniqueness, allowed values, references, freshness.
- [ ] Bad rows go to quarantine with a reason; the sum matches (received = loaded + quarantine).
- [ ] External payload is decoded section by section, values have bounds, fixtures cover every known form.
- [ ] A dashboard reads only from `marts`; heavy screens have a materialized view.
- [ ] A metric has one definition, an owner and an action; a chart shows the data update time.
- [ ] Data for AI: clean text, metadata, pinned embedding model, measured retrieval.
- [ ] RAG can return empty; a judge failure is an error.
- [ ] `tenant_id` and RLS in both `core` and `marts`; materialized views without a direct grant.
- [ ] Every number in a report states the dataset, period, row count and filter.

## Anti-patterns

- **A query saved only in a BI tool** or ETL logic in a dashboard query.
- **Blind `INSERT`** and a pipeline that cannot be run twice.
- **A `now()` mark** instead of the maximum from the loaded data; an incremental load that does not see deletions.
- **Silently discarding bad rows** instead of quarantine.
- **A check with a hand-written exception list** or a check only on the total.
- **Strict decoding of the whole external payload**; **zero instead of "unknown"**.
- **Two definitions of one metric** in different dashboards; a metric without an owner and an action.
- **A similarity threshold as the only protection** against an invented RAG answer; **mixing embedding
  models** in one index.
- **A materialized view with data of all tenants** directly accessible to the application role.
- **"Nothing was found" without proof that a search happened.**
