# Standard: stack and vendor selection

How to choose technologies, libraries and external services for a new web project and how to record the decision
so that it can later be revisited with one line, not a new debate from scratch.

Builds on: ../project-structure-design.md (§ 3 steps 6 to 8 architecture, tooling, environments;
§ 4.2 discovery including buy vs build; § 4.4 milestones; § 10 deployment), standard-security.md

## 1 · Principle: architecture first, then the stack

- **The order is fixed:** the stack is chosen only in step 7 (§ 3), when the specification,
  the domain model and a one-page architecture exist. Technology serves the design, not the other way round.
- **Requirements drive the choice:** who uses it, how much data, how sensitive the data is, where it must reside,
  how much operation costs. Without these answers, stack selection is just taste.
- **The decision is per project:** no global "our stack". A proven setup is the default
  candidate, which must pass the criteria from § 2 like all the others.

## 2 · Decision criteria

Every candidate option is scored in a table. Weights are set before the options
are compared, otherwise the weights silently support a conclusion chosen in advance (§ 4.2, attack on the options).

| Criterion | Question | Warning sign |
|---|---|---|
| **Team knowledge** | Can someone on the team operate it at 2 a.m.? | Nobody has deployed it to production |
| **AI knowledge** | Is the technology widely documented, does AI generate good code for it? | Few examples, a fast-changing API, AI mixes up versions |
| **Ecosystem maturity** | Stable version, active maintenance, problems solved in public? | Version 0.x, one maintainer, last release a year ago |
| **Operability** | Can recurring operations be done via CLI or API (§ 4)? | Domain, log or access setup only by clicking |
| **Cost** | How much does it cost at M0, M1 and at 10× traffic? | Jump from free to an expensive plan because of one feature |
| **Lock-in** | How much work is moving to another vendor? | Proprietary query language, data cannot be exported |
| **Compliance and data** | Where does the data reside, is a DPA available, an EU region? | US region only, subprocessors unknown |
| **Security** | What is exposed without our code and can it be closed? | Open API over the database, public buckets by default |

- **AI knowledge is a separate criterion:** in AI development the quality of the output depends directly on
  how much public code exists for the given technology. A less common framework means
  worse code and more fixes.

## 3 · Buy vs build

- **Always an explicit decision:** never the reflex "we will buy a service". AI development made building
  common utilities cheaper, so the bar for buying went up.
- **Buy when:** it is the vendor's responsibility (payments, email deliverability, identity),
  an external audit trail or certification is needed, or operating our own version costs more
  than the subscription.
- **Build when:** it is the core of the product, a utility of a few hundred lines without sensitive logic, or
  when the service would require manual operation (§ 4).
- **Never build yourself:** cryptography, authentication from scratch, parsing of untrusted formats,
  database drivers. The decision is recorded in discovery (§ 4.2 step 1) and in an ADR (§ 7).

## 4 · Gates for a new vendor

Every new vendor or platform goes through two questions: **can it be operated without clicking**
and **can it be secured**. The unit is the pair (vendor, product): a database and storage from the same
vendor are two separate technologies.

### 4.1 Operability (about 30 minutes, before approval)

Rule: **a tool that must be clicked through cannot be operated by an agent.** If the dashboard
is mandatory for a recurring operation, the answer is no. One-off setup (payment, KYC, email
verification) is tolerated.

1. **CLI and a real weekly operation:** install the CLI and perform a real recurring
   operation (send an email from the domain, tail production logs, rotate a key), not hello world.
   Requires a trial account; before a paid plan is enough.
2. **API reference for operations hidden in settings:** custom domains, DKIM, creating an
   alert, creating a connection. These are the 2 a.m. operations.
3. **MCP versus API:** compare the tool list of the official MCP with the API. A complete API does not mean
   a complete CLI or a complete MCP; verify every surface that will actually be used.
4. **A pass-through command to the raw API:** like `gh api`. Every future gap is then solved by
   one command.

- **Why 95 % is not enough:** the missing 5 % permanently puts a human back in the loop. Gates 2 to 4
  can be done from public documentation even before creating an account.

### 4.2 Security surface

- **Default exposure:** what is reachable without our code (automatic API over the schema,
  storage, webhooks, login methods). A code audit does not cover this.
- **Security profile:** default surface, steps taken, accepted residual risk, output of the
  vendor's advisor or scanner with a date. Details in standard-security.md.
- **Reject the platform if:**
  1. hardening cannot reduce the default surface to a documented residual risk,
  2. the vendor has no check mechanism that can be automated in CI,
  3. closing the default surface requires a plan the project will not pay for.

## 5 · Reference setups (examples, not mandatory)

The tables are a menu with tradeoffs. The choice is recorded per project according to § 2.

| Layer | Option A | Option B | Decided by |
|---|---|---|---|
| Backend runtime | Node.js LTS | Python 3.12+ | team knowledge, async, ecosystem |
| Backend framework | Fastify, NestJS | FastAPI | OpenAPI support, middleware model |
| ORM | Drizzle, Prisma | SQLAlchemy 2 | type safety, migrations |
| Validation, tests | Zod, Vitest | Pydantic v2, Pytest | follows from the runtime (one runtime per project) |
| Frontend | Next.js (App Router) | Astro | application vs content site, SSR |
| Components, style | shadcn/ui + Radix, Tailwind | Headless UI, CSS Modules | design system maturity, tokens |
| Client state | Zustand + TanStack Query | Nanostores | follows from the framework |
| E2E tests | Playwright | Cypress | multiple browsers, speed |
| Database | PostgreSQL | SQLite | concurrency, scale, hosting |

**Typical project shapes:**

| Shape | Example setup | When it fits |
|---|---|---|
| **Business application** | Next.js + Postgres (Supabase, Cloud SQL) + Vercel or Cloud Run hosting | roles, permissions, multiple tenants, relational data |
| **Small paid service without accounts** | Astro + React islands + Cloudflare Pages Functions + KV + Stripe Checkout | pay per use, credits instead of accounts, no database |
| **Content site** | Astro, static hosting, CDN | content dominates, interactivity only in places |
| **Data application** | Python + Postgres or BigQuery + dbt | reports, transformations, analytics |

- **Reuse the backbone, design the surface:** take proven infrastructure (payments, credits, i18n,
  deployment) as shared packages, build the product to fit. Do not copy the whole
  previous application.

## 6 · Library selection

Decision tree before every new dependency:

1. **Can the standard library handle it?** Then use it and stop.
2. **Can it be written in 50 lines without sensitive logic** (cryptography, authentication, TLS, compression,
   XML, DB drivers)? Then write it and stop.
3. **Does the package meet the criteria below?** If not, do not install it and request an exception in an ADR.

| Criterion | Requirement |
|---|---|
| **Activity** | latest release within 12 months |
| **Maintainers** | at least 2, security policy published |
| **Adoption** | over 1,000 downloads per week (protection against typosquatting) |
| **License** | MIT, Apache-2.0, BSD-2/3, ISC, MPL-2.0 |
| **Vulnerabilities** | zero critical and high in the audit |
| **Install scripts** | none (npm `--ignore-scripts` as the default) |
| **Dependency depth** | at most 5 levels transitively |

- **Exact versions:** `"1.2.3"`, not `^` or `~`; lockfile always in the repo; updates only deliberately
  after reading the changelog, a bot may open a PR, never merges it by itself.
- **Adapter:** a non-trivial package is wrapped in our own interface, business logic imports
  the interface. A vulnerable package is then replaced without touching the rules.
- **Audit in CI blocks merge** on critical and high, and also runs weekly against `main`.

## 7 · Recording the decision (ADR)

The stack decision goes into an ADR, the technology inventory into one table in the repo.

```markdown
# ADR NNNN: <decision in one line>

Status: proposed | accepted | superseded · Date: YYYY-MM-DD

## Context
Requirements that drive the choice, constraints (budget, data residency, team).

## Options
| Option | Strongest argument for | Main risk | Score |
|---|---|---|---|

## Decision
What we chose and why, one paragraph.

## Consequences
What gets easier, what gets harder, what we must now maintain.
External platforms: default-exposed surface, hardening profile link, residual risk,
operability gates passed (date, weekly operation tested).

## Revisit when
One line: the measurement, price, limit, headcount or vendor answer that would change this.
```

- **The "Revisit when" line is mandatory:** a decision with its own reversal condition is revisited
  with one line; without it the next session takes it apart from scratch, and with less context.
- **Technology inventory:** a table `Tech | Version/Tier | Profile | Last reviewed`, one
  row per (vendor, product) pair. The review date makes the age check mechanical.

## 8 · Environments and the account map

- **Three environments from the start:** dev, staging, production, with separate data and separate keys
  (§ 3 step 8, § 10).
- **Account map in the repo:** for every service and environment, who owns the account, under which organization,
  where billing is, who has admin. No secret values, only where they live.

| Service | Environment | Account or project | Owner | Billing | Secrets in |
|---|---|---|---|---|---|
| hosting | dev / staging / prod | … | … | … | platform env |
| database | dev / staging / prod | … | … | … | secret manager |

- **Customer's account vs ours:** decide in advance under whose organization the service runs. Moving an account
  later tends to be the most expensive migration of the project.

## 9 · Stack by milestone

| Milestone | Goal | Stack |
|---|---|---|
| **M0 PoC** | validate the hardest assumption | cheapest path: free plans, local or a single host, SQLite or free managed Postgres; no production URL |
| **M1 MVP** | first users | full environments, full security profiles, dependency audit in CI, technology inventory |
| **M2 v1.0** | operation and scale | SBOM with releases, alerts, backups with verified restore, pricing review under real traffic |

- **M0 may have a shortened platform profile** (three lines: default exposure, what would leak,
  "deferred, not reachable from production"). Moving to M1 is not approved while any
  technology remains on a shortened profile.
- **M0 does not mean a temporary stack forever:** whatever is chosen in M0 for speed gets, in the ADR,
  a revisit condition before M1.

## 10 · When to revisit the decision

- **A "Revisit when" condition occurred:** price, limit, number of users, vendor answer.
- **A new product from an existing vendor:** it is a new technology and goes through the gates from § 4.
- **A profile older than 90 days** before deploying M1 and above, or a change in the vendor's price or region.

## Checklist

- [ ] Specification, domain model and architecture exist before stack selection
- [ ] Criterion weights set before comparing options, at least two genuinely different options
- [ ] Buy vs build decided explicitly and recorded
- [ ] Every new vendor passed the four operability gates with a real weekly operation
- [ ] Every (vendor, product) pair has a security profile, at least a shortened one at M0
- [ ] New libraries went through the tree from § 6, exact versions, lockfile in the repo
- [ ] The ADR has options, decision, consequences and a "Revisit when" line
- [ ] The technology inventory with the last review date is in the repo
- [ ] Account map for all three environments, without secret values
- [ ] No shortened profile before M1

## Anti-patterns

- **Stack before design:** "we will build it in X" before it is clear what is being built.
- **A trendy or niche framework:** AI writes worse code for it and the team cannot operate it.
- **Buying reflex:** a subscription for a utility that can be written in an afternoon.
- **"95 % via API is enough":** the remaining 5 % is clicked through by a human at night.
- **One profile per vendor:** a new product from a trusted vendor hides a new surface.
- **"We do not use that product":** an enabled product is exposed until it is disabled.
- **ADR without a revisit condition:** anyone who has doubts reopens the decision from scratch.
- **Weights adjusted to the favorite option:** the matrix then only confirms a predetermined conclusion.
