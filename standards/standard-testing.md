# Standard: testing strategy

How to write tests that catch a bug, and how to recognize a test that only glows green.
Applies to every project built with AI; it extends the general guide with **what** tests assert and **how** that is proven.

Builds on: ../project-structure-design.md (§ 0 principles 6 and 9, § 4.4 milestones, § 7 single change cycle, § 11 typical AI failures, § 15 S16 test for logic)

**Contents:** 1 purpose of tests · 2 test levels · 3 test data and seeds · 4 verification against the running application ·
5 tests by milestone · 6 build loop · 7 characterization tests · 8 mutation tests and the control run ·
9 typical traps · 10 QA report · 11 checklist · 12 anti-patterns

## 1 · Purpose of tests

- **Contract, not implementation.** A test asserts public behavior (output for an input, response to a request,
  DB state after an action). It does not call private methods and does not count mock calls.
- **Every test names the bug it catches.** If that cannot be said in one sentence, the test is deleted.
  A test without a named catch is maintenance without benefit.
- **A test survives a refactor.** When the internals change and the behavior stays, the test stays green.
  A test that fails after renaming an internal function was testing the implementation.
- **Green is not proof until it has seen red.** A test that never failed proved nothing
  (§ 8 control run).
- **Coverage is a trend, not quality.** A high percentage with weak assertions catches nothing. A 100 % target is
  not set: it leads to testing trivial code.

**What to always test:**

| Area | Example |
|---|---|
| Domain rules | input X gives Y (price, margin, rounding) |
| Error paths | invalid input returns 400 with a structured error |
| Boundary values | empty array, `null`, zero, negative number, maximum, off-by-one |
| State transitions | `PENDING -> PAID` allowed, `SHIPPED -> PENDING` rejected |
| Permissions | endpoint with the wrong role returns 403; another tenant does not see the record |
| Idempotency | same request twice: same response, no second write |

**What not to test:** private functions directly, framework behavior (router routing), trivial
getters, layout and style (except accessibility), internals of third-party libraries.

**Naming:** scenario and expected result, not the method name.

```ts
describe("createOrder", () => {
  it("returns 400 when email is invalid", async () => { /* ... */ });
  it("returns the original response for a duplicate idempotency key", async () => { /* ... */ });
});
```

## 2 · Test levels

Pyramid: most unit, fewer integration, fewest e2e. An inverted pyramid (mostly e2e) is a signal
of bad design: logic is not separated from I/O.

| Level | What it proves | Where in the repo | Tool | Share, speed |
|---|---|---|---|---|
| **Unit** | a domain rule computes correctly for given inputs | `server/src/domain/<x>.test.ts`, `client/src/modules/**/<x>Model.test.ts` | Vitest | ~70 %, < 10 ms |
| **Integration** | endpoint, DB query and adapter work at the real boundary | `server/src/**/<x>Actions.test.ts`, `server/test/integration/` | Vitest + Supertest, test Postgres (container) | ~20 %, < 1 s |
| **Contract** | the data shape between client, server and external service matches in both directions | `contracts/**/*.test.ts` | Vitest + shared schemas (e.g. zod), or Pact | small, fast |
| **E2E** | a critical flow passes in the browser from start to finish | `e2e/<flow>.spec.ts` | Playwright | ~10 %, < 30 s |

- **Unit:** direct function call, no DB, network or files. Dependencies are passed as parameters
  (constructor injection), not through `vi.mock` of internal modules.
- **Integration:** real HTTP request, real test DB, external APIs replaced by an
  injected stub. Tenant isolation and permissions belong here too.
- **Contract:** one schema shared by client and server; the test verifies that the server returns what the schema
  promises and that the client does not read a field the schema lacks. Checked **in both directions** (§ 9).
- **E2E:** only critical flows (login, main business action, export). Happy path plus
  the most important error path. The list of critical flows is set by the architect in an ADR.

**Mocking:**

- **Rule:** when something cannot be tested by swapping an argument, the design is wrong, not the test.
- **Real:** DB (test instance), file system (temporary directory).
- **Stub:** external APIs, email, payments, LLM.
- **Forbidden:** monkey-patching, `vi.mock` of internal modules, overwriting global state.

```ts
// Dependency passed in, so the test swaps it without mocking a module.
export function createInvoiceService(deps: { repo: InvoiceRepo; clock: () => Date }) {
  return {
    async issue(orderId: string) {
      const order = await deps.repo.getOrder(orderId);
      return { number: order.number, issuedAt: deps.clock() };
    },
  };
}
```

**Test structure:** Arrange, Act, Assert. Tests are independent and pass in any order.
No `sleep`: wait for an event, not for time.

## 3 · Test data and seeds

- **Expected values are literals.** They are never computed with the same expression as the implementation.
  Why: a mirror assertion moves together with the bug and stays green.
- **Parameters cover sign, zero and boundary.** A table with only positive numbers cannot reveal
  a swapped sign, however the assertion is written.
- **A value that only the tested path creates.** A fallback test must not set a value equal to
  the default: the fallback and the explicit value then cannot be told apart.
- **Order and sets need enough elements.** Two elements are "sorted" by chance in half the runs.
  A fixture with at least 6 to 8 elements, given in **reverse** order.
- **An invariant is not sampled.** When a property must hold for every input, extract a pure function
  and walk the whole reachable domain. Random seeds belong only to emergent properties.
- **The empty state is a separate case.** A guard that reads data from earlier runs must have a test
  that starts from a truly empty store. Why: a fixture that injects state tests the guard's
  logic, not whether it runs at all in reality (first run, new tenant).
- **The seed for integration and e2e tests** is in the repo, idempotent, runs with one command and
  creates deliberately built cases (every state, every role, boundary values).
- **Fresh DB per run.** A container on a verified free port, migrations from zero, no shared data
  between suites. Why: a warm DB with foreign data gives results that cannot be reproduced.

```ts
it.each([
  { input: "-42", expected: "-42" },
  { input: "0", expected: "0" },
  { input: "2147483647", expected: "2147483647" },
])("normalizeNumber keeps sign and value for $input", ({ input, expected }) => {
  expect(normalizeNumber(input)).toBe(expected); // literal, not String(Number(input))
});
```

## 4 · Verification against the running application

Tests prove code. The user gets an **artifact**: a deployed build, a database with its real
state, a browser with a cache. The general rule is in § 7 point 8 and § 11 of the guide; here are the procedures.

| Trap | Procedure |
|---|---|
| **Navigation reads the cache** | verify with a direct request `fetch(url, { cache: "no-store" })`, not a page reload |
| **The migration file is not what runs** | read the definition from the DB catalog (`pg_get_functiondef`, `pg_policies`, `pg_trigger`, `pg_constraint`) and compare with your version |
| **Grep does not see a write through a helper function** | also enumerate functions that build the payload (`...buildRow(`) and compare with the column list from the generated types |
| **"Verified on data" over an empty set** | state what is in the data ("0 changes out of 1 record"); build cases deliberately |
| **curl does not see browser behavior** | verify headers that depend on the request mode (referrer policy, SameSite, CSP `form-action`, COOP) with a headless browser that submits a real form |
| **Tests passed, the application does not start** | after changing the exports of a shared package, load at least one page of every application that uses it |
| **The assertion reads its own input** | when a library merges configuration with another source (connection string, env), create a real client and verify the **resulting** value |

- **Discriminating measurement:** when two request modes (form vs `fetch`) give a different result,
  the variable is the mode, not the data.
- **The smoke test after deployment** is part of the deployment (§ 10 of the guide), not an optional step.

## 5 · Tests by milestone

Builds on the table in § 4.4 of the guide (0 / 60 / 80 %). Coverage is measured **on new code**.

| Milestone | Mandatory tests | Coverage |
|---|---|---|
| **M0 PoC** | unit tests of the core domain logic; the hardest assumption has a test that proves it | no target |
| **M1 MVP** | + integration test of every endpoint, error paths, permissions and tenant isolation | reported, target 60 % |
| **M2 v1.0** | + e2e of critical flows, full boundary values, contract tests, mutation run on guards | 80 %, blocks merge |
| **M3+** | as M2; every fixed bug gets a regression test | as M2 |

- **S16 (§ 15 of the guide)** enforces that a test exists for logic. It does not enforce test quality: that is done by
  the control run and review.
- **80 % coverage with weak assertions is worse than 60 % with sharp ones:** it looks safe.

## 6 · Build loop

Details in § 7 of the guide: **RED, GREEN, REFACTOR 1 (contract), REFACTOR 2 (house rules)**.
For tests this means:

- **RED pins the contract before the code exists.** The test must fail **for the right reason**
  (missing behavior), not on an import or a typo.
- **The "done" report names the test from the RED step.** The "test first" order leaves no trace in the finished
  diff, so it cannot be verified otherwise.
- **During development, tests of the affected code run**, including callers in unchanged files; the whole suite
  only at the end of the series.
- **Changing a test because of your own change** is the weakest spot of self-review. Name it to the reviewer.
  When a fix makes the test scenario impossible to construct, the invariant is pinned again, the assertion is
  not weakened.

## 7 · Characterization tests

Untested code has no written contract, only what it happens to do today. Rewriting it directly means
not telling an intentional change from an accident; typecheck and build pass both.

**Procedure:**

1. **Find seams shaped like a contract:** pure functions and boundaries. Not every internal step.
2. **Compute expected values, do not guess them.** Run the function on real inputs and record
   what it returned, including ugly boundaries and floating-point artifacts.
3. **A pinned bug says so in the test:** test name, why the result is wrong, where it gets fixed.
4. **Fix it in the same change** for which the tests were created. Otherwise the marker stays forever and the green
   assertion reads as intent.

```ts
describe("calculateMargin (characterization)", () => {
  it("CURRENT, NOT CORRECT: rounds profit up, favouring the seller", () => {
    // Wrong: price and profit are ceil-rounded separately. Fixed by the margin rewrite in this change.
    expect(calculateMargin({ cost: 99.1, markup: 0.15 })).toEqual({ price: 114, profit: 15 });
  });
});
```

- **Why:** characterization routinely finds real defects that typecheck, build and click-through check do not catch
  (rounding always in favor of one side, a price for a combination that is not sold).
- **Do not use it instead of understanding the code:** a wall of assertions on every step cannot be maintained.

## 8 · Mutation tests and the control run

Green says the code passes the tests. It does not say the tests would fail if the code stopped working.
For code whose job is to **reject** (guard, validator, permission check, structure guard), that is the only
question that matters. Coverage does not answer it: a test can pass through a guard and assert nothing that depends on it.

**Control run (always, cheap):** revert the fix, the test must turn red, restore the fix.

```sh
git stash push -- src/domain/pricing.ts   # remove the fix only
npx vitest run src/domain/pricing.test.ts # must FAIL, naming the expected test
git stash pop
```

**Mutation test (for guards, mandatory in M2):** break the behavior on a copy, one thing at a time
(`if (cond)` to `if (false)`, invert a condition, drop a parser step), and verify that the suite turns red.
Tool for TypeScript: Stryker (`npx stryker run`), or a custom harness over a copy of the tree.

**Harness integrity** (the mutation result is a measurement and the instrument is code written this hour):

| Rule | Why |
|---|---|
| **First a control run without mutation** through the same path | a harness that cannot produce green cannot produce a survivor either |
| **The mutation anchor hits exactly one place** | a double hit breaks more than the mutant claims |
| **Verify that the mutation was applied** (diff, file length change) | an unapplied mutation looks exactly like "the tests guard it" |
| **Three results, not two:** killed / survived / **invalid** | an unbuildable or hung tree is not a survivor |
| **Canary first:** a mutation that must fail | verifies that the harness can catch anything at all |
| **Every hit names the test that failed** | the whole suite failing in `beforeAll` is not proof; the hit should have the guard's shape |
| **Verdict from the process exit code**, summary line only as context | color codes and pipes distort parsing |
| **A filtered run (`-k`, `-t`) is silent about everything left out** | before claiming, run the whole suite and read the line with problems |
| **A validator that checks the artifact before the test** (migration checksum, schema) | kills every mutant for the wrong reason; reset its state |

**What to do with a survivor:** investigate before believing it. There are four answers:
a test is missing (write it), the mutant is equivalent (record why), the line never executes (prove it
with instrumentation), **the code is unreachable (delete it)**. A survivor in glue code asks whether the glue should
exist: merging an untestable seam is often better than building a harness that reaches it.

- **A mutant's name is a claim about coverage.** The example from the name is run on clean and mutated code;
  they must differ. Otherwise the name is rewritten and you look for what the shape really guards.
- **The habit that found almost everything:** notice a number that should have changed and did not
  (count of passed tests, file length, the test that turned red is the wrong one).

## 9 · Typical traps

| Trap | How to recognize it | Defense |
|---|---|---|
| **One-sided assertion** | the test verifies the correct output is **present**; wrong output appears next to it | assert the wrong thing is **absent**, or compare the whole artifact (exact arguments, whole block) |
| **Mirror assertion** | expected value computed with the same expression as the code | literals (§ 3) |
| **Subset check instead of equality** | "every step of A is in B"; shrinking A breaks nothing | both inclusions and a lower bound on the count (`>= N`) |
| **Skipped test read as passed** | summary "40 passed, 42 skipped"; skip is just as green | verify in the run that the dependency was available; minimum number of executed tests |
| **Green in a better-equipped environment** | tests have a library or tool the deployed image lacks | test the artifact; assertions over the Dockerfile and workflow; a runtime pre-check that fails early and names the missing dependency |
| **Different platform, different result** | CI green, the local machine (different shell, different tools) does not run the test at all | run the suite on the platform that gates merge; one portable implementation instead of branches |
| **A guard that went empty** | the guard encoded an accident of the moment (constraint name), a neighbor changed | the guard targets a property ("the index starts with columns X, Y"), not the implementation |
| **The input does not distinguish the guard from a weaker version** | the test asserts the constraint name, but the input is also rejected by a weakened rule | for each guard find the nearest wrong version and an input between them |
| **Mock swallows arguments** | the stub has fewer parameters than the real function **and returns a value** | type the stub from the real signature; look for the pair short arity + return |
| **Silent result** | "rejected" and "never ran" give the same exit code | make the action observable (call record); stderr as a test failure; also assert the message |
| **The test builds the world for the code** | a helper calls two production steps that production is supposed to chain | a helper may call only **one** production entry point |
| **Default path untested** | every test passes an override; production calls without an argument | at least one test calls the code the way production calls it |
| **Concurrency tested once** | two racers, one round, even a broken implementation passes | many rounds, assertion over the sum, a guard mutation must turn red |
| **Three-valued logic** | a comparison with `NULL` on an empty result passes | after `select ... into` always `if not found then raise` |
| **A file the runner does not collect** | new test outside the `include` pattern | verify that the runner really ran the test (the test count went up) |

**A mock that swallows arguments:**

```ts
// BAD: production takes (tenantId, role); the stub drops role and still returns a principal.
const resolvePrincipal = vi.fn(async (tenantId: string) => ({ tenantId, role: "admin" }));

// GOOD: stub typed from the real signature, so a dropped argument is a type error.
const resolvePrincipalStub: typeof resolvePrincipal = vi.fn(
  async (tenantId: string, role: Role) => ({ tenantId, role }),
);
```

**One-sided assertion:**

```ts
// BAD: passes even if the forbidden flag is appended to the command.
expect(args).toContain("--id=42");

// GOOD: the whole artifact is pinned.
expect(args).toEqual(["run", "--id=42"]);
```

- **A masking pattern does not generalize its own fix.** One found occurrence is proof there are more:
  after the fix, search all siblings in the same change.
- **A guard's message is an instruction.** Read it as a directive that a tired person will carry out at two in the morning;
  if for some input it recommends a destructive action, that is a defect.
- **Defense in depth masks the inner layer.** The outer layer delivers the correct behavior, the inner one is missing
  and a behavioral test does not see it; the inner layer needs a structural assertion.

## 10 · How QA reports

QA is done by a fresh agent against the running change (§ 7 point 8 of the guide). The report has a fixed shape:

| Part | Content |
|---|---|
| **Scope** | commit or branch, environment (local, staging), data state ("fresh DB + seed") |
| **Filter** | exact command and filter (`npx vitest run src/orders`), number run, passed, skipped |
| **Evidence** | for each claim a file:line, command output, test name or browser step |
| **Control run** | which test turned red after reverting the fix |
| **Findings** | defect, or wrong description; with reproduction |
| **Unverified** | what did not run and why (missing service, skipped tests, browser only) |

```text
Scope: branch feat/order-refund @ 3f2a9c1, local, fresh DB + seed
Filter: npx vitest run src/orders -> 24 run, 24 passed, 0 skipped
Control run: after reverting the fix, "refund returns 409 when order is not paid" failed
Click-through check: Order > Refund payment, state "Refunded" after F5 (fetch no-store: 200)
Unverified: e2e of the refund flow on staging (staging is not running)
```

- **The filter is mandatory.** A filtered green looks the same as a full one.
- **Skipped tests are not reported as passed.** The skipped count is always in the report.
- **A claim without evidence is a finding**, not a formality.

## 11 · Checklist

- [ ] Every test can say in one sentence which bug it catches.
- [ ] Tests assert behavior (input, output, state), not calls to internal methods.
- [ ] Every public function with domain logic has a unit test (S16).
- [ ] Every endpoint has an integration test including the error path and permissions (from M1).
- [ ] Critical flows from the ADR have an e2e test (from M2).
- [ ] Shared schemas have a contract test in both directions.
- [ ] Boundary values: empty, `null`, zero, negative, maximum.
- [ ] Expected values are literals; parameters cover sign, zero and boundary.
- [ ] A stateful guard has a test that starts from an empty store.
- [ ] At least one test calls the code without overrides, like production.
- [ ] External dependencies are injected; no `vi.mock` of internal modules.
- [ ] Stubs are typed from the real signature.
- [ ] Tests are independent, without `sleep`, pass in any order.
- [ ] The test from the RED step is named in the "done" report.
- [ ] Untested code got characterization tests before the change; pinned bugs are marked and fixed in the same change.
- [ ] Control run: after reverting the fix, the test turned red.
- [ ] A mutation run was done on guards; the harness passed the control run and the canary.
- [ ] The run proved dependencies were available; the skipped count is in the report.
- [ ] Verified against the running application (`fetch` with `no-store`, DB catalog, deployed artifact).
- [ ] The QA report has scope, filter, evidence, control run and an Unverified section.

## 12 · Anti-patterns

- **Implementation test:** `expect(repo.save).toHaveBeenCalledTimes(1)`; fails on refactor, catches no bug.
- **Monkey-patching:** `vi.mock("../database")`; the design does not support injection.
- **Test per method:** one test for every method regardless of logic; tests getters.
- **`sleep` in a test:** flaky; wait for an event.
- **Shared state:** test B depends on a side effect of test A.
- **100 % coverage target:** leads to `expect(true).toBe(true)`.
- **Snapshot for logic:** a snapshot asserts shape, not correctness.
- **Framework test:** "does the router return 404 for an unknown path?" That is not your bug.
- **Weakening an assertion so it passes** after your own change, instead of pinning the invariant again.
- **Reporting a filtered or skipped run as "all passed".**
- **Manual mutation via `sed`** without verifying it was applied.
- **Fixing a guard "to green"** when it failed after a neighbor changed, without asking which property it guarded.
- **Claims in test text** ("these lines are the only thing guarding X") that nobody verified by deleting the behavior.
  A claim disproved twice is deleted, a third version is not written.
