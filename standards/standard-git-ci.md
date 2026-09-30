# Standard: git workflow and CI/CD

How the repo branches, commits, reviews and merges, and what must pass on the server before a change
reaches `main` and production. Goal: parallel AI sessions do not collide, and green means actually verified.

Builds on: ../project-structure-design.md (§ 6.3 guards, § 7 change cycle, § 9 parallel work, § 10.1 deployment, § 15.2 three execution levels, § 15.6 required check in CI); standard-releases.md (version, tag, release)

## 1 · Branch model

| Branch | Purpose | Who writes to it | Lifetime |
|---|---|---|---|
| `main` | always deployable state | PR merges only | permanent |
| `feat/<area>-<description>`, `fix/...`, `chore/...`, `docs/...` | one task | one session | hours, at most days |
| `hotfix/<description>` | production fix | one session | hours |

- **Trunk-based:** short branches from `origin/main` straight back into `main` via PR. An integration branch
  `develop` is not introduced; it only adds waiting and a second place where things diverge.
- **Never commit or push directly to `main`.** This is enforced by a guard in the session (§ 6.3 of the guide) and on
  the server by branch protection (§ 8). **Why:** the guard applies only to AI sessions, branch protection also to
  a human at the terminal.
- **No force push to shared history** (`main`, someone else's branch). On your own branch after a rebase
  only `git push --force-with-lease` is allowed, never bare `--force` or `+refspec`.
- **A branch is not created from local `main`,** but from a fresh `origin/main` (`git fetch` first).
  **Why:** local `main` falls behind after a squash merge on the server and nothing advances it on its own.
- **Destructive operations** (`reset --hard`, `clean -fd`, `checkout -- .`, deleting a branch with
  unmerged work) only after a backup (`git stash` or a backup branch) and only on your own branch.
- **Level by milestone:** at M0, commit conventions, `.gitignore` and no secrets are enough; from M1
  a branch per task, PR, protected `main` and required CI.

## 2 · Parallel sessions and worktrees

The rule **1 task = 1 session = 1 worktree = 1 branch = 1 PR** and ownership zones are in § 9
of the guide. Here only the git mechanics.

```bash
git fetch origin
git worktree add ../<repo>-<task> -b feat/<task> origin/main
cd ../<repo>-<task>            # work, commits, push, PR from here
git worktree remove ../<repo>-<task>   # after merge
git branch -D feat/<task>
```

- **A branch without a worktree is not isolation.** Two writing agents in one checkout collide regardless
  of the branch name; the same applies to two sessions over the same directory in a VM.
- **The main checkout is shared:** nobody writes to it; before any git write, verify `pwd` and the branch.
- **Commit right after writing.** **Why:** uncommitted work in a dirty tree is
  invisible to other sessions and is easily overwritten or swept into someone else's commit.
- **In a worktree, `.git` is a file, not a directory.** The test `test -f .git/MERGE_HEAD` is always
  false; ask git for the state: `git rev-parse -q --verify MERGE_HEAD`.
- **Dependencies in a worktree:** a clean install from the lockfile; copying `node_modules` from elsewhere only with an
  identical lockfile, otherwise tests run against different versions than CI.

## 3 · Commits (Conventional Commits)

Format `type(scope): description`, imperative, lowercase, no trailing period, subject up to 72 characters.

Types: `feat` (new capability), `fix`, `refactor` (no behavior change), `perf`, `test`, `docs`,
`chore` (maintenance, release `chore(release): v1.4.0`), `ci`.

- **Breaking change:** `feat(api)!: remove legacy endpoint` and in the body `BREAKING CHANGE: ...`
  with instructions on what to do. The link to the MAJOR version is in standard-releases.md § 2.
- **The body says why, not what;** the diff shows what.
- **Atomic commit:** one logical change that compiles and passes tests on its own.
  "fix stuff" and a commit with twenty unrelated files are defects.
- **Never in git:** `.env*`, `*.pem`, `*.key`, tokens, customer data. A secret in history
  stays even after the file is deleted; the fix is key rotation, not another commit.
- **`.gitignore` from the first commit:** dependencies, build outputs, `.env*`, keys, tool caches.

## 4 · Pull request: size and description

- **Size:** target under ~400 changed lines of code (excluding the lockfile and generated files). Above that
  the task is split. **Why:** review of a large diff turns into checking shape, not behavior.
- **Title = outcome for the user** in commit form: `fix: user stays logged in after reload`.
  Not file names, function names or "refactor X". With a squash merge the title becomes the commit in `main`.
- **Body, required sections:**

| Section | Content |
|---|---|
| What and why | 1 to 2 sentences from the user's perspective |
| Changes | a short list of the main changes, not a diff dump |
| How to test | numbered steps, doable without reading the code |
| Expected result | what the tester sees when it passed |
| Evidence | what was actually run (see table below) |
| Notes | migrations, breaking changes, follow-up tasks (optional) |

| Kind of change | Required evidence |
|---|---|
| UI | a screenshot of every state from acceptance (empty, loading, error) |
| API | a real endpoint call, not a mock from a unit test |
| external service, LLM | a live run against the service, otherwise the label "not verified live" |
| deployment, workflow, secrets | an observed effect (artifact exists, message was sent), not a green run |

- **A PR without a filled-in "How to test" is unfinished** and is not merged. Checking the shape of the title and
  sections can be done by a guard before `gh pr create` and again before merge (level B, § 15.2 of the guide);
  the starter kit does not ship it, it is a recommended extension.
- **A behavior change adds an entry to `CHANGELOG.md`** in the same PR (standard-releases.md § 4).

## 5 · Review threads

The review process (fresh agent, at most two rounds, frozen scope) is in § 7 item 8 of the guide. Here
only working with comments on the hosting platform.

- **Feedback lives in three places and each is a different API call.** Whoever reads only two
  reports the PR as having no comments, while objections sit in the review summary.

```bash
gh api repos/OWNER/REPO/issues/N/comments --jq '.[] | "\(.user.login) \(.created_at)"'     # PR comments
gh api repos/OWNER/REPO/pulls/N/comments  --jq '.[] | "\(.user.login) \(.path)"'           # code threads
gh api repos/OWNER/REPO/pulls/N/reviews   --jq '.[] | "\(.user.login) \(.state)"'          # review bodies
```

- **An unresolved thread does not mean an open question.** After a push the thread is `isOutdated`, but still
  unresolved (GraphQL `reviewThreads`). The answer comes from the current file on the PR branch, not the diff snippet.
- **For a specification or decision, the question is in the document,** in the open items section, not in the list
  of threads. Read the document first, then the comments.
- **Reply to every thread, but with one summary comment.** Silence reads as
  "not read", not as agreement. A separate reply in a thread only where a live question
  remains. Finally, verify mechanically that no thread was left without a reply.

## 6 · When `main` moves

- **Rebase onto `origin/main`,** not merging `main` into the branch, unless the project forbids it:

```bash
git fetch origin
git rebase origin/main
# resolve conflicts, then the full relevant test suite
git push --force-with-lease
```

- **Conflicts are resolved by the branch author,** preserving the intent of both sides; when unsure, ask.
- **After a rebase, run tests again and the pre-PR checks again.** A rebase that changed your own code
  files is a new change for review; a conflict only in documentation is not.
- **After every catch-up, measure the result,** do not trust "no conflict": someone else's revert or move
  can silently delete work. Compare `git diff origin/main...HEAD` with what the PR was supposed to contain.

**Semantic conflicts git does not see:**

| Shape | Remedy |
|---|---|
| two migrations with the same sequence number, or ordering by time | renumber yours after those in `main`; verify the last merged migration has the highest timestamp (§ 14) |
| generated file (DB types, lockfile) | take the version from `main`, add only your own additions, then regenerate from source as a separate step |
| merging a migration stack by regenerating | the tool produces only DDL; hand-written `UPDATE`/`INSERT` disappear; compare statements, not the file |
| accidentally committed local cache | `.gitignore` and `git rm -r --cached`, then a secrets check |


## 7 · Squash merge and after

- **The only merge method is squash.** One PR = one commit in `main`, the PR title is its
  subject. The history of `main` is linear and a revert is one commit.
- **Done means merged** (§ 7 item 9 of the guide), not an open PR.
- **What gets merged is a merge candidate,** i.e. a branch caught up with the current `main` and pushed, with
  green CI on the last commit. Not a locally merged tree.
- **Squash breaks stacked PRs:** the parent's commits do not become ancestors of `main`, the child does not
  close by itself. Retarget the child to `main`, merge it, close the parent manually with a link to the commit.
- **Verify the outcome, not the command output:** `gh pr view N --json state,mergeCommit`. The command
  may end with an error (e.g. because of a worktree) and the merge still went through.
- **Cleanup:** the remote branch is deleted automatically, the worktree manually; the main checkout only
  `git pull --ff-only` and only with a clean tree.

## 8 · Branch protection

**Turn it on when at least two apply:** more than one person or independent agent pushes to the repo;
there is production traffic; a merge to `main` deploys directly; an incident costs real money or
trust. **Skip** it only at M0 for a solo project without users. The CI workflow exists from
day one anyway; branch protection only turns it from an observer into a gate.

| Setting (`main`) | Value |
|---|---|
| Require PR | yes |
| Number of approvals | 1 with multiple people; 0 for solo work with a review agent |
| Required checks | yes, CI job names (§ 10), strict (branch must be up to date) |
| Linear history | yes (matches squash merge) |
| Force push, branch deletion | forbidden |
| Admin bypass | empty or only an emergency account; record every bypass |
| Dismiss stale approvals on push | yes, when a human does the review |

- **Rulesets** are read via `gh api repos/OWNER/REPO/rulesets`; the classic API reports "not
  protected" even when they apply. On a private repo they require a paid plan; without it the rule is only
  written down, and that belongs in the backlog, not in the checklist.
- **A required check must exist as a job.** When the job is renamed or deleted, the merge gets
  stuck on "waiting for check"; a job rename and the protection settings change together.

## 9 · CI pipeline: phases and order

The pipeline is code in the repo (`.github/workflows/`) and is reviewed like code. Ordered from the cheapest
check; a failure stops the run.

| # | Phase | Command (npm) | Blocks |
|---|---|---|---|
| 1 | install from lockfile | `npm ci` | yes; never `npm install` in CI |
| 2 | lint | `npm run lint` | yes |
| 3 | typecheck | `npm run typecheck` | yes |
| 4 | format check | `npm run format:check` | yes |
| 5 | structure checks | `npm run check:structure` (§ 15 of the guide) | yes |
| 6 | unit and integration tests | `npm test` | yes |
| 7 | security audit | `npm audit --audit-level=high`, secrets scan, SAST | critical and high |
| 8 | build | `npm run build` | yes |
| 9 | e2e smoke | `npm run test:e2e:smoke` against the build | yes from M2 |

- **Typecheck does not replace build.** Green `tsc --noEmit` and a red real build is a common
  case (prerender calls the DB without credentials, a variable is missing). The build in CI runs on a clean
  machine without local secrets, and that is exactly its value.
- **Tests in CI without network access** to external services; a flaky test is fixed or deleted, never
  skipped.
- **Coverage:** M0 no gate, M1 warning, M2 gate on new code. An aggregate hides a new file with
  zero coverage; measure per changed file.
- **Deterministic build:** pinned runtime version (`.nvmrc`), pinned tool versions,
  same commit = same artifact. Deployment takes the artifact, it does not rebuild.

## 10 · Required checks and gate integrity

- **Three levels** (§ 15.2 of the guide): session (A, B) saves time, CI on the server (C) is the real
  safeguard. A required check is a job that runs the same commands as level B.
- **A gate that cannot fail is not a gate.** Deliberately break every new check once and
  verify that the job turns red.
- **The exit code of a wrapped CLI is verified once.** Some tools print an error and exit `0`;
  then parse the output for a success signal, and its absence is a failure.
- **`|| true` only where an empty result is legitimate;** otherwise it hides an error. `continue-on-error`
  on a job is forbidden: dependent jobs then read the failure as green.
- **A new deployment pipeline is unverified until it has run against the live platform.** Valid YAML
  and a review of the file prove the shape, not the run. The first few runs are the test; expect a defect
  in each.
- **Pin actions to a SHA** (`uses: owner/action@<40 hex> # v4`), including official ones.
  **Why:** a tag can be moved and some SAST suites block mutable tags outright.

## 11 · Matrices and job conditions

`needs:` applies to the whole job, not to a matrix cell. One failed cell skips the dependent job
for all cells, including the healthy ones.

- **Per-cell gating has three parts and works only together:** `if: ${{ !cancelled() && ... }}`
  (the job runs even after a sibling fails), `fail-fast: false` (rejecting one cell does not cancel
  the others) and a first step that, for its own cell, verifies the result of the preceding cell via the run API
  (`permissions: actions: read`) and otherwise ends with `exit 1`.
- **Do not allowlist states.** `result` also has `abandoned` (the job could not be started); the condition
  `== 'success' || == 'failure'` misses it. Use `!= 'skipped'` and let the cell step decide the rest.
- **Everything fails closed:** missing job, renamed job, API error, two matches, different letter
  case, all end in `!= "success"` → `exit 1`.
- **An aggregated artifact** (one bundle from all cells) stays gated on the whole job; otherwise
  it ships with a defective member.
- **Test conditions by equality, not by substring** (`(!cancelled() || true)` is `always()`), and
  guard steps too: `if: always()` after a gate deploys even after a rejection.

## 12 · Cache and secrets in CI

- **Cache keyed by the lockfile hash** (`actions/setup-node` with `cache: npm`); the package store is cached,
  not `node_modules`. Tool build cache (e.g. `.next/cache`) keyed by the lockfile and
  sources. The cache must not change the result, only the time.
- **`concurrency` with `cancel-in-progress: true`** for PRs; `false` for deployments, a running
  deployment is not interrupted.
- **Secrets only in the hosting platform's secrets,** never in YAML or in the repo; they are entered via CLI
  (`gh secret set NAME --env production`), not as an argument with the value in shell history.
- **Secrets per environment** (`environment: staging`, `environment: production`), not a shared
  repo secret for everything. The production key is visible only to the production job.
- **Least privilege:** `permissions: contents: read` at the top and extend per job.
  For cloud, prefer OIDC federation over a long-lived key.
- **`pull_request_target` with a checkout of foreign code is not used;** mask derived values.

## 13 · CD: environments and approval

| Environment | Trigger | Data | Approval |
|---|---|---|---|
| dev / preview | every PR (preview URL) | test | none |
| staging | merge to `main` | copy of the production structure, no personal data | none, after green CI |
| production | manual trigger or release tag | real | an explicit human "yes" (§ 10.1 of the guide) |

- **The platform's native git integration** (preview on PR, deployment from `main`) takes precedence:
  fewer secrets, less code. **Deployment from a workflow** only when the native one is not enough: atomic
  deployment of multiple targets from one commit, migrations before deployment, smoke after deployment.
- **When a merge deploys, a human merges**, or the task brief explicitly allows the AI to merge including
  deployment to staging. Otherwise the AI would be deploying, and deployment is always a human's call.
- **When a workflow deploys, the checks run in the same workflow before deployment.** Removing
  them would let a manual push without tests into production.
- **Production is an `environment` with required reviewers** and restricted to the `main` branch or tags.
  A merge is not approval for production.
- **Pre-deployment checks:** correct account and project (the platform's `whoami`), an artifact from
  a tested commit, a known rollback path.
- **Verify health as far as the deployment allows:** a public service via an HTTP smoke test, a private
  service via the platform's control plane; write down what the verification does not cover.
- **After deployment** verify that the running application reports the new version (standard-releases.md § 6).
- **Rollback:** redeploy the previous artifact, then `git revert` the squash commit via a PR; the tag is
  not rewritten. The schema is not rolled back: expand/contract makes reverting code safe, a destructive step
  has a snapshot. Failed verification after deployment = roll back first, investigate later.

## 14 · Migrations under automatic deployment

When a merge deploys, the database and the code never change at the same moment. The question is not "migration
or merge first", but **which single statement the currently running application will not survive**.

| Step | Content | Safe for the old application |
|---|---|---|
| 1 expand | new columns, tables, functions; change existing ones only additively | yes |
| 2 merge and deployment | the application starts using the new ones | |
| 3 verify the fleet | the deployed revision contains step 2 | |
| 4 contract | removal of what only the old application used | yes, the old one no longer runs |

- **It is done when expand runs in production,** not when it is merged. Verify the deployed revision and
  `git merge-base --is-ancestor <step-2-commit> <deployed-commit>`.
- **A contract migration refuses itself** until explicitly allowed (a settings check inside the
  transaction). Otherwise an "apply everything pending" tool runs both halves a few seconds apart.
  Once the transition is complete, the safeguard is removed, otherwise it breaks every fresh database.
- **Every migration file in a transaction** (`begin; ... commit;`). `psql -f` without `ON_ERROR_STOP`
  prints the error and keeps going; a safeguard outside a transaction is just advice.
- **`DROP` bare, never `CASCADE`,** and hand-written, not by a generator. A bare `DROP` on an unknown
  dependency fails loudly; `CASCADE` destroys it silently. But even a bare `DROP` does not protect everything (indexes,
  constraints go away silently).
- **Destructive migrations:** replay from zero to N-1 and to N on two fresh databases,
  compare the catalogs and verify that a similarly named object survived.
- **Migration order:** some tools order by the timestamp in the journal, not by the number
  in the name; a migration merged later with a lower timestamp is **silently skipped**. The last merged
  migration must have the highest timestamp; after a rebase, verify the journal with a script. Tests do not catch this,
  because they build the database from zero.
- **An applied migration is immutable,** including comments and whitespace (§ 15.4 S15 of the guide).

## 15 · Reference workflow (GitHub Actions)

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}-${{ github.event_name }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      # In production, pin actions to the full SHA with a version comment.
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run format:check
      - run: npm run check:structure
      - run: npm test
      - run: npm run build
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e:smoke
      - run: npm audit --audit-level=high
      - uses: actions/upload-artifact@v4
        with:
          name: build-${{ github.sha }}
          path: dist/
          retention-days: 7

  deploy:
    needs: verify
    if: github.ref == 'refs/heads/main' && github.event_name != 'pull_request'
    runs-on: ubuntu-latest
    environment: ${{ github.event_name == 'workflow_dispatch' && 'production' || 'staging' }}
    concurrency:
      group: deploy-${{ github.event_name }}
      cancel-in-progress: false
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - uses: actions/download-artifact@v4
        with:
          name: build-${{ github.sha }}
          path: dist/
      - name: Apply expand migrations
        run: npm run db:migrate
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
      - name: Deploy
        run: npm run deploy
        env:
          DEPLOY_TOKEN: ${{ secrets.DEPLOY_TOKEN }}
      - name: Smoke test
        run: curl -fsS --retry 5 --retry-delay 5 "${{ vars.APP_URL }}/api/health"
```

- **Required check** in branch protection: `verify`. A push to `main` deploys staging, a manual
  trigger deploys production; the `production` environment has required reviewers and only the `main` branch.
- **Secrets and `APP_URL` are per environment;** `db:migrate` and `deploy` are project scripts.
  Add a secrets scan of the history as another step when the session guard does not run it.

## Checklist

- [ ] work runs in its own worktree on a branch from a fresh `origin/main`
- [ ] no commit or push to `main`, no force push to shared history
- [ ] commits in Conventional Commits form, atomic, no secrets
- [ ] PR under ~400 lines, the title is the outcome, the body has all sections from § 4 including evidence
- [ ] `CHANGELOG.md` updated in the same PR when behavior changes
- [ ] comments, threads and review bodies read; all threads answered with one comment
- [ ] branch caught up by rebase onto the current `main`, result measured, tests green again
- [ ] migrations: number and timestamp follow on from `main`, expand and contract separated
- [ ] CI green on the last commit, squash merged, PR state verified by query
- [ ] branch protection matches § 8, required checks match job names
- [ ] pipeline: install from lockfile, ordered from the cheapest phase, build not just typecheck
- [ ] actions on SHA, minimal `permissions`, secrets per environment, new check broken once
- [ ] production only via an environment with approval, rollback path known before deployment
- [ ] after deployment, smoke test and verified version of the running application

## Anti-patterns

- **Two writing agents in one checkout** and long-lived branches.
- **"No conflict" as proof.** Git does not report migration collisions and silently deleted work.
- **A secret deleted by another commit.** It stays in history; the only remedy is rotation.
- **A PR titled after a file** ("update schema + tsconfig") and without testing steps.
- **A green run as evidence of deployment.** Evidence is an observed effect.
- **A pipeline configured in the UI** instead of a file in the repo; typecheck instead of build.
- **`continue-on-error`, `|| true` and trusting the exit code** of a wrapped tool.
- **Automatic deployment to production without approval.** An accident goes straight to users.
- **A migration the running application will not survive** in the same step as the code; `DROP ... CASCADE`.
- **"Merge means done" for expand/contract.** It is done when the new revision is running.
