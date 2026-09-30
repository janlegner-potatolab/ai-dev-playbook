# Project starter kit

Ready-made files for the guide `../project-structure-design.md`: document templates, `CLAUDE.md`,
AI role definitions, guards (hooks), lint configuration, structure checks and CI. The folder
corresponds to the root of a new repository.

This README is for whoever sets up the project. Do not copy it into the new repo, or replace it with
the project's README.

## 1 · What is inside

| Path                                      | Contents                                                                                                                                                                | Guide                 |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `CLAUDE.md`                               | project identity, structure rules, commands, security, deployment, task protocol                                                                                        | § 6.1                 |
| `.claude/settings.json`                   | command deny list, no reading or writing of sensitive files, hook wiring                                                                                                | § 6.2                 |
| `.claude/hooks/`                          | guards for git, destructive SQL, branch freshness, uncommitted work and structure                                                                                       | § 6.3, § 15.6         |
| `.claude/agents/`                         | roles: analyst, architect, backend, frontend, data, QA, security, performance, mechanical helper                                                                        | § 4.1, § 16.2         |
| `eslint.config.js`                        | S1, S2, S6, S10, S12, S13, S17, S19                                                                                                                                     | § 15.4                |
| `.dependency-cruiser.cjs`                 | S3, S4, S5, S8, S9                                                                                                                                                      | § 15.4                |
| `knip.json`                               | S11 dead code                                                                                                                                                           | § 15.4                |
| `scripts/structure/`                      | S10 size ratchet, S14 names, S15 migrations, S16 tests, S18 exceptions, S20 report                                                                                      | § 15.4                |
| `structure-baseline/`                     | exception lists (baseline) for the ratchet (new project: empty)                                                                                                         | § 15.5                |
| `.github/workflows/ci.yml`                | CI: install from lockfile, typecheck, lint, format, structure checks, tests, build                                                                                      | § 15.6                |
| `.github/CODEOWNERS`                      | protection of guard configuration                                                                                                                                       | § 15.4 S18            |
| `docs/discovery/`                         | discovery template                                                                                                                                                      | § 4.2                 |
| `docs/spec-template.md`                   | specification template                                                                                                                                                  | § 5.1                 |
| `docs/domain.md`, `docs/glossary.json`    | domain model and glossary                                                                                                                                               | § 3, § 15.4 S14       |
| `docs/architecture.md`, `docs/adr/`       | one-page architecture, ADR template                                                                                                                                     | § 3                   |
| `docs/design/`                            | design tokens and component specifications                                                                                                                              | § 3.1                 |
| `docs/security/VULNERABILITIES.md`        | security register                                                                                                                                                       | § 6.4                 |
| `docs/work/`                              | task brief and task status template, parallel work runbook                                                                                                              | § 5.2, § 8.3, § 9     |
| `FEATURES.md`, `CHANGELOG.md`             | what the application does, release notes                                                                                                                                | § 6.4                 |
| `server/`, `client/`, `packages/`, `e2e/` | folder skeleton according to § 1 with a reference area (see next row)                                                                                                   | § 1                   |
| reference area `orders`                   | code to copy: contract, `defineRoute`, action with Idempotency-Key, cursor pagination, SQL with tenant, migration with RLS, UI components, page with four states, tests | § 1, § 2, § 15 S6, S7 |

## 2 · Prerequisites

- Node.js 22 (CI is pinned to it), npm.
- `jq` on the machine (the hooks use it; without it they let everything through, so they guard nothing).
- `gh` CLI for working with PRs.

## 3 · Project setup

1. **Discovery and specification first** (§ 3 steps 1 to 6). The kit is copied only after the "go"
   decision and after the architecture design.
2. **Copy the folder contents** into the new repo (including the hidden `.claude/`, `.github/`,
   `.prettierrc`, `.dependency-cruiser.cjs`); replace this README with the project's README.
3. **Fill in the `{{...}}` placeholders.** Find them with
   `grep -rn '{{' --exclude-dir=node_modules .`. Mainly `CLAUDE.md` (project, stack, commands,
   accounts and environments), `.github/CODEOWNERS` (`{{OWNER}}`) and the models in `.claude/agents/`
   (uncomment and fill in the `# model:` line).
4. **Complete `package.json`:** the `build` and `test` scripts deliberately fail until you
   define them. Add workspaces according to the stack.
5. **`npm install`**, then `npm run lint`, `npm run typecheck`, `npm run check:structure`
   and `npx prettier --check .`. On a clean copy of the kit everything passes.
6. **Glossary:** replace the examples in `docs/glossary.json` with the project's terms. Make sure the
   forbidden words (`forbidden`) do not collide with common technical names (`client`,
   `request`, `response`); the check would flag them across the whole codebase.
7. **Design deliverables** (`docs/design/`): fill them in before the component library is built.
8. **Protection of the `main` branch on GitHub:** required check from `ci.yml`, no direct push.
   CODEOWNERS applies only with "Require review from Code Owners" enabled.
9. **First commit on a branch, PR, CI green.** Then the reference area (§ 3 step 12).

## 4 · Guards and their escape hatches

A block always states the reason. Escape hatches are for emergencies and are visible in the transcript.

| Guard                          | What it blocks                                                                                                     | Escape hatch                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `git-guardrails.sh`            | commit or push directly to `main`, force push, work on a branch behind origin, PR with an incomplete specification | `ALLOW_PROTECTED_BRANCH=1`, `ALLOW_STALE_BRANCH=1`, `ALLOW_SPEC_FORMAT=1` |
| `db-guardrails.sh`             | `DROP`, `TRUNCATE`, `DELETE` without `WHERE` in SQL about to be run                                                | `ALLOW_DESTRUCTIVE_DB=1`                                                  |
| `guard-structure-before-pr.sh` | `gh pr create` when `npm run check:structure` fails                                                                | `ALLOW_STRUCTURE_SKIP=1` (in the environment or in the command text)      |
| `guard-structure-config.sh`    | edits to guard configuration and exception lists                                                                   | `ALLOW_GUARD_EDIT=1` (environment only)                                   |
| `structure-lint-file.sh`       | blocks nothing, after a file edit returns lint errors to the AI to fix                                             |                                                                           |
| `check-freshness.sh`           | blocks nothing, warns at startup about a branch that is behind                                                     |                                                                           |
| `uncommitted-reminder.py`      | blocks nothing, at the end reminds about uncommitted work                                                          |                                                                           |

## 5 · What is verified and what is not

**Verified on the reference project:**

- `bash -n` on all hooks; 26 hook test cases (block, pass, empty
  and malformed input, both forms of escape hatch), including a deliberately broken hook that the tests caught;
- every ESLint rule (S1, S2, S6, S12, S13, S17, S19) fired on a bad sample
  and stayed silent on a good one;
- all seven dependency-cruiser rules fired;
- the structure check scripts caught violations of S10, S14, S15, S16 and S18;
- a clean copy of the kit passes lint, typecheck, format, dependency check and structure
  checks.
- the reference area `orders` in a clean copy with installed dependencies passes `tsc --noEmit`
  (server, client, `packages`), `npm run lint`, `npm run check:deps`, `knip` (exit 0, only
  configuration hints), `scripts/structure/run-all.ts` against the kit baseline, `prettier --check`
  and `npm test` (30 tests, vitest); control run: after disabling the body fingerprint comparison for
  Idempotency-Key, the test "rejects the same key with a different body" failed.

**Not verified:**

- `ci.yml` has not yet run on GitHub;
- `knip` has not run against real entry points (on an empty repo it only suggests refining patterns,
  exit 0);
- tests ran on Node 25, CI is on Node 22.
- the reference area has not run against a real PostgreSQL or HTTP server: migrations, RLS, SQL
  and `defineRoute` were verified only by typecheck and lint, action tests run against a fake store;
- `index.ts` wires in authentication that rejects everyone; before the first deployment it is replaced
  with a real identity provider;
- idempotency is simplified to a unique key in the orders table (without the
  `PROCESSING` states and TTL from the API standard);
- `npm run build` is still a placeholder, the client has no bundler or `index.html`.

**Known limitations:**

- S14 does not report words outside the English dictionary (there is nothing to check against); it guards diacritics
  and the forbidden words from the glossary;
- S19 (hard-coded colors and sizes) is a small local ESLint rule so it can remain a warning
  while S1 and S12 block;
- hooks guard the AI session; a human at the terminal is guarded only by branch protection and CI on the server.
- process guards that the guide lists as recommended (PR without a review stamp, code change
  without a release note, size cap on a document read at startup) are not shipped in the kit;
- `npm audit` in CI blocks from severity high; the first run may report findings
  in dependencies that need to be resolved or recorded in the security register.

## 6 · Changing the kit

Always test a guard change first on bad input (it must block) and on good input (it must
pass), and verify that it lets things through when it errors itself (§ 6.3 of the guide). Reflect any change to a document template
in the guide too, so they do not contradict each other.
