# Parallel runbook

Every parallel session reads this file first and follows it for the whole session.

**Dispatch one-liner:** `Read docs/work/parallel-runbook.md and follow it for the whole session. Work issue #{{N}}.`

## Unit of work

1 task = 1 session = 1 worktree = 1 branch = 1 PR. Tasks are assigned by a human, never picked by a session.

## Waves

| Wave         | What                                                                                          | Concurrency                                                 |
| ------------ | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 1 Foundation | one task owns all shared files (config, DB schema, lockfile, container setup)                 | nothing alongside                                           |
| 2 Backbone   | contracts and core API, UI skeleton                                                           | small parallel set; contracts freeze at the end of the wave |
| 3 Features   | each task owns its area (router, server module, screens) plus one line in the module registry | wide parallel                                               |

## Ownership zones

| Path                                                                                  | Owner                                           |
| ------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `package.json`, lockfile, CI, shared config                                           | orchestrator only                               |
| DB schema outside own area, `packages/contracts/`                                     | frozen after wave 2; change = stop and escalate |
| `server/src/<area>/`, `server/src/http/<area>Router.ts`, `client/src/modules/<area>/` | the task assigned that area                     |
| Module registry                                                                       | one line per feature task                       |

## Session rules

1. Write only in your own worktree and branch. A branch without a worktree is not isolation.
2. Never touch a file owned by another zone. Need a schema or contract change: stop and escalate.
3. The same file is never given to two sessions; sequence them or split the file first.
4. Namespace runtime resources: own port, own DB or schema, own browser tab. Kill processes by PID, never by name pattern.
5. Read-only work (exploration, review) may run in parallel without a branch.
6. Before opening a PR: `git fetch origin && git rebase origin/main`, push with `--force-with-lease`, re-run checks, re-read migration and version numbers (they collide outside git).
7. Follow the task protocol in `CLAUDE.md`: read-back first, "Where it stands" rewritten at the end.
8. Mocks with frozen contracts replace anything external, so no task waits on a human. A mocked deploy is not permission to deploy.
9. Unclear question: park the task with a written reason and report; never invent a default.
