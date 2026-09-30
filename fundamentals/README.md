# Claude Code Fundamentals

General knowledge about how Claude Code works, one building block per file, written from the
official documentation. These files explain **what a feature is and how it behaves**. How I use
each feature in practice is in the playbook: [`../project-structure-design.md`](../project-structure-design.md)
§ 19 ("My Claude Code setup").

> Claude Code changes quickly. Every file lists its sources; when a detail here and the current
> official documentation disagree, the documentation wins. Details that could not be confirmed
> are marked "(check the current docs)".

## Files

| # | File | Covers |
| --- | --- | --- |
| 01 | [`01-claude-md-and-memory.md`](01-claude-md-and-memory.md) | `CLAUDE.md` scopes and load order, imports, path-scoped rules, `AGENTS.md`, auto memory (`MEMORY.md` index and topic files), what to put where |
| 02 | [`02-settings-and-permissions.md`](02-settings-and-permissions.md) | settings files and precedence, permission rules (allow, ask, deny), permission modes, environment, additional directories, a baseline deny list |
| 03 | [`03-hooks.md`](03-hooks.md) | hook events, matchers, handler types, input JSON, exit codes, JSON output, a worked guard example, writing reliable hooks |
| 04 | [`04-subagents.md`](04-subagents.md) | subagent files and fields, delegation, what a subagent sees and returns, background and parallel runs, worktree isolation, good briefs |
| 05 | [`05-skills-and-commands.md`](05-skills-and-commands.md) | `SKILL.md` format, scopes, progressive disclosure, invocation and arguments, relation to slash commands, writing descriptions that trigger |
| 06 | [`06-plugins-and-marketplaces.md`](06-plugins-and-marketplaces.md) | plugin structure and manifest, marketplaces, `/plugin` commands, team setup, private marketplaces, versioning, vetting |
| 07 | [`07-mcp.md`](07-mcp.md) | MCP servers, transports, scopes, `claude mcp` commands, tool naming and permissions, authentication, security |
| 08 | [`08-context-models-and-cost.md`](08-context-models-and-cost.md) | the context window, `/context`, `/clear`, `/compact`, models and effort, caching, cost control |
| 09 | [`09-worktrees-parallel-and-headless.md`](09-worktrees-parallel-and-headless.md) | git worktrees, parallel sessions, headless `claude -p`, CI and GitHub Actions, the Agent SDK |
| 10 | [`10-prompting-basics.md`](10-prompting-basics.md) | prompting and agentic-coding practice: clarity, context, structure, plan first, test first, verification, anti-patterns |

## How the blocks fit together

```
Always in context (paid on every request)
  CLAUDE.md files ........ rules and pointers                      (01)
  auto memory index ...... working-set facts                       (01)
  skill descriptions ..... triggers only, bodies load on demand    (05)
  tool and MCP schemas ... what Claude can call                    (07)

Loaded or run when needed
  skill bodies ........... procedures, scripts                     (05)
  subagents .............. isolated context for a delegated task   (04)
  hooks .................. deterministic checks around events      (03)

Configuration and distribution
  settings ............... permissions, modes, hook wiring         (02)
  plugins/marketplaces ... package and share skills, agents,
                           hooks, MCP servers                      (06)

Ways to run
  interactive, worktrees, parallel sessions, headless, CI          (09)
  context and model choice, cost                                   (08)
```

## Suggested reading order

1. `01` and `02`: what Claude reads and what it may do.
2. `10`: how to ask for work.
3. `04` and `05`: delegating and packaging procedures.
4. `03`: turning rules into guarantees.
5. `06`, `07`, `08`, `09`: sharing, integrating, scaling and running at scale.

Then read § 19 of the playbook for one concrete setup built from these blocks.
