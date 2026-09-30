# CLAUDE.md and Memory

Every Claude Code session starts with an empty context window. Two mechanisms carry knowledge across sessions: CLAUDE.md files, which you write, and auto memory, which Claude writes for itself. Both are context, not enforced configuration: to block an action regardless of what Claude decides, use permissions or a hook.

## At a glance

| What | Where | Loaded when | Shared? |
| :- | :- | :- | :- |
| Managed CLAUDE.md | macOS `/Library/Application Support/ClaudeCode/CLAUDE.md`, Linux/WSL `/etc/claude-code/CLAUDE.md`, Windows `C:\Program Files\ClaudeCode\CLAUDE.md` | Every session, first | All users on the machine (IT-deployed) |
| User CLAUDE.md | `~/.claude/CLAUDE.md` | Every session | Just you, all projects |
| Project CLAUDE.md | `./CLAUDE.md` or `./.claude/CLAUDE.md` | Launch (cwd and every ancestor) | Team, via git |
| Local CLAUDE.md | `./CLAUDE.local.md` | Launch, after `CLAUDE.md` in the same directory | Just you (gitignore it) |
| Nested CLAUDE.md | `<subdir>/CLAUDE.md` below cwd | On demand, when Claude reads files there | Team, via git |
| User rules | `~/.claude/rules/*.md` | Launch, before project rules | Just you |
| Project rules | `.claude/rules/**/*.md` | Launch (no `paths`) or on matching file read (with `paths`) | Team, via git |
| Auto memory | `~/.claude/projects/<project>/memory/` | `MEMORY.md` head at launch, topic files on demand | Just you, this machine |

## How it works

### Load order and directory walking

1. Claude Code loads `CLAUDE.md` and `CLAUDE.local.md` from the current working directory and every directory above it.
2. Files are concatenated, never overridden. Order runs from the filesystem root down to the working directory, so the instructions closest to where you launched are read last.
3. Within one directory, `CLAUDE.local.md` is appended after `CLAUDE.md`.
4. Across scopes the order is managed, then user, then project, then local. A project instruction appears in context after a user instruction.
5. `CLAUDE.md` files in subdirectories below the working directory are not loaded at launch. They are included when Claude reads a file in that subdirectory.
6. Block-level HTML comments (`<!-- note -->`) are stripped before injection, so you can leave maintainer notes at zero context cost. Comments inside code blocks are kept.
7. CLAUDE.md content is delivered as a user message after the system prompt, not as part of the system prompt.

Conflicting instructions are not resolved by precedence. If two files disagree, Claude may follow either one. Keep them consistent.

### Imports with `@path`

- Any CLAUDE.md can import another file with `@path/to/file`. The imported file is expanded into context at launch.
- Relative paths resolve against the file containing the import, not the working directory. Absolute and `~/` paths work.
- Imports can nest, up to four hops deep.
- Paths with spaces need a backslash before each space (`@Design\ Docs/api.md`). A quoted path is not imported.
- Imports inside code spans and fenced code blocks are ignored. Write `` `@README` `` to mention a path without importing it.
- An import in a project file that resolves outside the working directory is "external". Claude Code shows a one-time approval dialog. If declined, those imports stay disabled.
- Imports organize a file; they do not reduce its context cost, because imported files load at launch too.

### Path-scoped rules in `.claude/rules/`

- Every `.md` file under `.claude/rules/` is discovered recursively (subfolders such as `frontend/` are fine).
- A rule without frontmatter loads at launch with the same priority as `.claude/CLAUDE.md`.
- A rule with a `paths` frontmatter field loads only when Claude reads a file matching one of its globs. It does not fire on every tool use.
- `paths` is the only frontmatter field Claude Code reads from a rule. Other fields are ignored silently. Invalid YAML makes the rule load as if it had no `paths` (run `claude --debug` to see the error).
- User rules in `~/.claude/rules/` load before project rules and apply to every project.
- `.claude/rules/` supports symlinks. A symlink whose target is outside the working directory is treated like an external import and needs approval.

### AGENTS.md

By default (setting value `claude-md-or-agents-md`):

| Repository has | Claude reads |
| :- | :- |
| `AGENTS.md`, no `CLAUDE.md` / `.claude/CLAUDE.md` / `CLAUDE.local.md` in cwd or above | `AGENTS.md` |
| `AGENTS.md` and a `CLAUDE.md` or `CLAUDE.local.md` in cwd or above | `CLAUDE.md` files only |
| `CLAUDE.md` containing `@AGENTS.md` | `CLAUDE.md`, with `AGENTS.md` pulled in by the import |

- `~/.claude/CLAUDE.md`, the managed CLAUDE.md and `.claude/rules/` do not count for this check; they load alongside `AGENTS.md`.
- Direct `AGENTS.md` loading is a recent addition. On an older Claude Code, or to be explicit, create a `CLAUDE.md` that imports it with `@AGENTS.md` (check the current docs).
- Adding a personal `CLAUDE.local.md` in an AGENTS.md-only repo silently switches Claude away from `AGENTS.md`.
- The "Project instructions" option in `/config` changes this: `claude-md-or-agents-md` (default), `claude-md-and-agents-md`, `claude-md`, `managed-only`.
- `AGENTS.local.md`, `AGENTS.override.md` and `.agents/` are not read.
- The most portable setup, which works in every session type: keep `AGENTS.md` as the shared file and add a `CLAUDE.md` whose first line is `@AGENTS.md`, followed by Claude-specific notes.

### Auto memory

- Claude saves notes for itself as it works. Four kinds, recorded as a `type` frontmatter field: `user` (role, preferences), `feedback` (corrections and confirmed approaches), `project` (ongoing work and decisions not derivable from code or git), `reference` (where to find external information).
- Claude skips what it can derive from the codebase and what CLAUDE.md already says. It does not save something every session.
- Storage: `~/.claude/projects/<project>/memory/`. The `<project>` key is derived from the git repository, so all worktrees and subdirectories of one repo share one memory directory. Outside git, the project root is used.
- Layout: a `MEMORY.md` index (one line per memory) plus one topic file per memory.
- At session start only the first 200 lines or first 25 KB of `MEMORY.md` (whichever comes first) are loaded. Topic files are read on demand with normal file tools.
- Auto memory is machine-local. It is not synced across machines or to cloud sessions.
- Memory files are excluded from the transcript cleanup sweep; they persist until edited or deleted.
- Subagents do not get the main conversation's auto memory (a fork does, because it inherits the conversation). A subagent can have its own memory via its `memory` field.

## Configuration and examples

Minimal project CLAUDE.md:

```markdown
# Project instructions

@README.md

## Commands
- Install: `npm ci`
- Test: `npm test` (run from the repo root)
- Typecheck: `npx tsc --noEmit`

## Conventions
- API handlers live in `src/api/handlers/`
- Use 2-space indentation and named exports

<!-- Maintainer note: stripped before Claude sees it -->
```

Path-scoped rule, `.claude/rules/api.md`:

```markdown
---
paths:
  - "src/api/**/*.{ts,tsx}"
  - "tests/api/**/*.test.ts"
---

# API rules
- Validate every request body at the handler boundary
- Return the standard error shape from `src/api/errors.ts`
```

Share one instruction file across worktrees (a gitignored `CLAUDE.local.md` exists only in the worktree where you created it):

```markdown
# Personal preferences
- @~/.claude/my-project-instructions.md
```

Skip other teams' CLAUDE.md files in a monorepo (put it in `.claude/settings.local.json`; patterns match absolute paths; arrays merge across settings layers):

```json
{
  "claudeMdExcludes": [
    "**/monorepo/CLAUDE.md",
    "/home/user/monorepo/other-team/.claude/rules/**"
  ]
}
```

Auto memory switches:

```json
{
  "autoMemoryEnabled": false,
  "autoMemoryDirectory": "~/my-custom-memory-dir"
}
```

- `autoMemoryEnabled` in a project's settings turns it off for that project only. The environment variable `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` also disables it.
- `autoMemoryDirectory` must be absolute or start with `~/`.
- Load CLAUDE.md from `--add-dir` directories too: set `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1`. Without it, additional directories give file access only.

## Commands

| Command | Purpose |
| :- | :- |
| `/init` | Generate a starter CLAUDE.md from the codebase. If one exists, it suggests improvements instead of overwriting. Also reads Cursor and Copilot rule files. |
| `/memory` | List CLAUDE.md, CLAUDE.local.md and memory locations across scopes, open them in your editor (creates missing files), toggle auto memory, open the auto memory folder. |
| `/context` | Show what is in the current context window. Check the "Memory files" list to confirm which CLAUDE.md and rules files actually loaded. |
| `/compact` | Compact the conversation. The project-root CLAUDE.md is re-read from disk afterwards; nested files and path-scoped rules reload when matching files are read again. |
| `/config` | Settings panel, including the "Project instructions" (AGENTS.md) option. |

Asking "remember that X" saves to auto memory. Asking "add this to CLAUDE.md" edits CLAUDE.md.

## Limits and gotchas

- Target under 200 lines per CLAUDE.md. Longer files cost context and reduce adherence. A file over 4 MiB is skipped entirely.
- The `MEMORY.md` limit (200 lines / 25 KB) applies only to the index. Anything past it is dropped on the next load, silently from the user's point of view.
- Imports do not save context. Path-scoped rules and skills do.
- Instructions given only in chat do not survive compaction. Put persistent instructions in a file.
- Instructions in a nested CLAUDE.md are invisible until Claude touches a file in that directory. Do not put launch-critical rules there.
- A path-scoped rule does not load until a matching file is read. It will not guide Claude's first action in an area it has not opened yet.
- CLAUDE.md is not a security boundary. "Never read .env" in CLAUDE.md is a request; `Read(./.env)` in `permissions.deny` is enforcement.
- Auto memory is written by the model and can go stale or be wrong. Treat recalled memories as hints and verify before acting.
- Auto memory does not follow you to another machine or a cloud session.
- Built-in guidance can compete with yours (for example git commit rules). Check the current docs for settings that turn the built-in version off.

## Good practice

- Write what you would otherwise re-explain: build and test commands, conventions that differ from tool defaults, known pitfalls, project layout that is not obvious.
- Add a line when Claude makes the same mistake twice or a review catches something the codebase should have told it.
- Make instructions verifiable: "Run `npm test` before committing", not "test your changes".
- Group under headings and bullets. Remove contradictions across root, nested and rules files on a schedule.
- Move multi-step procedures into skills and area-specific rules into `.claude/rules/` with `paths`.
- Keep personal, machine-specific notes in `CLAUDE.local.md` or `~/.claude/CLAUDE.md`, never in the committed file.
- Periodically open the auto memory folder via `/memory` and prune stale or wrong entries.
- After any change, run `/context` in a new session and confirm the file is listed under "Memory files".

### What to put where

| Content | Put it in | Why |
| :- | :- | :- |
| Build, test, lint commands; repo-wide conventions; architecture pointers | Project `CLAUDE.md` | Needed every session by everyone |
| Personal style and tooling preferences for all projects | `~/.claude/CLAUDE.md` or `~/.claude/rules/` | Yours, not the team's |
| Your sandbox URLs, local test data, machine quirks | `CLAUDE.local.md` (gitignored) | Personal and project-specific |
| Rules for one area or file type (API, migrations, tests) | `.claude/rules/<topic>.md` with `paths` | Loads only when relevant, saves context |
| Multi-step procedures (release, deploy, review) | A skill | Loads only when invoked or relevant |
| Hard constraints (never read secrets, never push to main) | `permissions.deny`, hooks, branch protection | Enforced by the client or server, not by the model |
| Learned preferences, corrections, facts not in the code | Auto memory | Claude maintains it; you prune it |
| Long design rationale, ADRs, specs, onboarding | `docs/` (referenced from CLAUDE.md by path) | Read on demand; do not import large docs |

## In this playbook

- `../project-structure-design.md § 6` (Repository setup for AI): which instruction files a repository ships with.
- `../project-structure-design.md § 13` (Communication, security and memory): how memory is used and pruned.
- `../project-structure-design.md § 19` (My Claude Code setup): the concrete user-level CLAUDE.md and memory layout.

## Sources

- https://code.claude.com/docs/en/memory
- https://code.claude.com/docs/en/settings
