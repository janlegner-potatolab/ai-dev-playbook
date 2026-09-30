# Subagents

A subagent is a separate Claude instance that the main conversation hands a self-contained task to. It runs in its own context window with its own system prompt, tool set, and model, then returns one result to the caller. Use subagents to keep noisy work (searches, log reading, broad reviews) out of the main context and to run independent tasks in parallel.

## At a glance

| Aspect | Summary |
| :- | :- |
| Definition file | Markdown with YAML frontmatter, one file per agent |
| Required fields | `name`, `description` |
| Project location | `.claude/agents/<name>.md` (commit it to share) |
| Personal location | `~/.claude/agents/<name>.md` |
| Context | Fresh window: own system prompt, task message, CLAUDE.md files. No conversation history |
| Returns | One final message (a summary) to the caller |
| Built-ins | Explore, Plan, general-purpose, plus helpers such as `claude`, `statusline-setup`, `claude-code-guide` |
| Nesting | Allowed, up to three layers below the main conversation by default |

## How it works

### Delegation

Claude delegates in one of two ways:

- **Automatic**: Claude matches the task against each subagent's `description` and the current context. Phrases such as "use proactively" in the description encourage delegation.
- **Explicit**: you ask for it.
  - Natural language: "Use the code-reviewer subagent to look at my changes." Claude still decides.
  - @-mention: type `@` and pick the agent, for example `@"code-reviewer (agent)" look at the auth changes`. This guarantees that agent runs. Your full message still goes to Claude, which writes the subagent's task prompt.
  - Session-wide: `claude --agent <name>` or the `agent` key in settings makes the whole session run as that agent.

### What a subagent sees

A non-fork subagent starts with a fresh, isolated context window containing:

1. **System prompt**: the body of the agent file plus environment details. Not the main Claude Code system prompt.
2. **Task message**: the delegation prompt Claude writes when handing off the work.
3. **CLAUDE.md files**: the same hierarchy the main conversation loads (user, project, local, managed, and AGENTS.md loaded as project instructions). Explore and Plan skip these. `omitClaudeMd: true` skips user, project, and local files.
4. **Git status snapshot** (inside a git repository). Explore and Plan skip it.
5. **Preloaded skills**: full content of skills listed in the `skills` field.

### What a subagent does not see

- The main conversation history.
- Files Claude has already read in the main conversation.
- Skills already invoked in the main conversation.
- The main session's auto memory (use the `memory` field for a subagent's own memory).
- Your output style.

Consequence: everything the subagent needs that is not in CLAUDE.md or its own prompt must be in the task message. If a rule must reach the subagent (for example "ignore `vendor/`"), restate it in the delegation.

### What it returns

The subagent's final message returns to the caller as the result. Intermediate tool calls and output stay in the subagent's context. A subagent that hits `maxTurns` returns output marked as partial. Each invocation creates a new instance; to continue an earlier one, Claude resumes it with `SendMessage` using the agent's ID or name. Explore and Plan are one-shot and cannot be resumed.

### Foreground and background

- **Background** subagents run concurrently while you keep working. Permission prompts surface in the main session, naming the subagent that asks. Results arrive as a completion notification in a later turn.
- **Foreground** subagents block until they finish.
- In an interactive session, subagents Claude spawns usually run in the background. `background: true` in frontmatter keeps an agent in the background even when Claude wants the result right away. Setting `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` forces the foreground.
- Background subagents get a reduced built-in tool set (for example `Read`, `Grep`, `Glob`, `Bash`, `Edit`, `Write`, `WebFetch`, `WebSearch`, `Skill`) (the exact list can change; check the current docs) and keep every MCP tool. The same definition can therefore resolve to different tools in foreground and background.
- By default up to 20 subagents can run at once (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`). There is no limit on the total over a session.

### Worktree isolation

`isolation: worktree` runs the subagent in a temporary git worktree, an isolated copy of the repository. By default it branches from the default branch, not the parent session's `HEAD`. The worktree is cleaned up automatically if the subagent makes no changes. Without this field, a subagent works in the main conversation's current directory, and parallel writers can collide.

### Nesting

A subagent can spawn its own subagents, up to three layers below the main conversation by default. At the depth limit the `Agent` tool is withheld. Change the limit with `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` (set `1` to turn nesting off). To stop one specific agent from spawning, omit `Agent` from its `tools` or add it to `disallowedTools`.

### Forks

A fork is a special subagent that inherits the whole conversation instead of starting fresh (start one with `/subtask <task>`). It trades isolation for zero re-explaining. Do not confuse it with a skill's `context: fork`, which starts a fresh subagent.

## Configuration and examples

### Locations and precedence

When two definitions share a `name`, the higher priority wins:

| Priority | Location | Scope |
| :- | :- | :- |
| 1 (highest) | Managed settings directory | Organization-wide |
| 2 | `--agents` CLI flag (JSON) | Current session |
| 3 | `.claude/agents/` | Current project (walks up to the repository root; closest wins) |
| 4 | `~/.claude/agents/` | All your projects |
| 5 (lowest) | Plugin `agents/` directory | Where the plugin is enabled |

Plugin agents appear under a namespaced name such as `my-plugin:code-reviewer`. Keep `name` values unique: two files with the same name in the same directory load only one, chosen by filesystem order.

### Frontmatter fields

| Field | Required | Purpose |
| :- | :- | :- |
| `name` | Yes | Unique identifier. Must not contain `:` (reserved for plugin namespacing). The filename does not have to match |
| `description` | Yes | When Claude should delegate to this agent. Drives automatic delegation |
| `tools` | No | Allowlist, comma-separated or YAML list. Omitted means inherit every tool available to subagents |
| `disallowedTools` | No | Denylist removed from the inherited or listed tools |
| `model` | No | `sonnet`, `opus`, `haiku`, a full model ID, or `inherit` |
| `permissionMode` | No | `default`, `acceptEdits`, `auto`, `dontAsk`, `bypassPermissions`, `plan` |
| `maxTurns` | No | Maximum agentic turns before the agent stops |
| `skills` | No | Skills whose full content is preloaded at startup |
| `mcpServers` | No | MCP servers available to this agent (by name or inline definition) |
| `hooks` | No | Lifecycle hooks scoped to this agent |
| `memory` | No | Persistent memory scope: `user`, `project`, or `local` |
| `background` | No | `true` keeps the agent in the background |
| `isolation` | No | `worktree` for an isolated repository copy |
| `effort` | No | `low`, `medium`, `high`, `xhigh`, `max` (depends on the model) |
| `omitClaudeMd` | No | `true` skips user, project, and local CLAUDE.md files |
| `color` | No | Display color in the task list |

`permissionMode`, `mcpServers`, and `hooks` are ignored for agents shipped in plugins.

### Minimal example

```markdown
---
name: code-reviewer
description: Reviews a diff for correctness bugs and risky changes. Use proactively after any non-trivial code change.
tools: Read, Grep, Glob, Bash
model: sonnet
---

You are a senior code reviewer. Review only the files or diff named in the task.

For each finding, report: file and line, the problem, why it matters, and a suggested fix.
Rank findings by severity. Do not edit files. If you find nothing, say so explicitly.
End with a one-line verdict: "ship", "ship after fixes", or "do not ship".
```

### Read-only researcher

```markdown
---
name: repo-scout
description: Finds where a feature, symbol, or config lives across the repository and reports file paths with one-line explanations. Use for broad searches that would flood the main context.
tools: Read, Grep, Glob
disallowedTools: Agent
---

Search broadly, then narrow. Return at most 15 paths, each with a one-line reason.
Never paste whole files. Say which search strategies you tried if nothing matched.
```

## Commands

| Command or flag | Effect |
| :- | :- |
| `/agents` | Currently prints a reminder to ask Claude or edit `.claude/agents/` directly (no interactive wizard) |
| `@"<name> (agent)" <task>` | Run that agent for one task |
| `claude --agent <name>` | Run the whole session as that agent |
| `claude --agents '<json>'` | Define session-only agents from JSON |
| `/subtask <task>` | Fork the current conversation into a background subagent |

## Limits and gotchas

- **No shared memory of the conversation**: a vague task message produces a vague result. The subagent cannot ask what you meant earlier.
- **Combined descriptions**: Claude Code warns at startup when all subagent descriptions together pass 15,000 tokens. Keep descriptions short.
- **New directories**: a running session may not detect a newly created `agents` directory. Restart if a new agent does not appear.
- **Parallel writers**: several subagents editing the same checkout can overwrite each other. Use `isolation: worktree` or split work by file.
- **Tool filtering**: a `tools` list that resolves to nothing fails to launch. Background runs silently drop some built-in tools.
- **Model and cost**: each subagent pays for its own context from zero (system prompt, CLAUDE.md, task, then its own reads). Many small subagents can cost more than doing the work inline.
- **Permission grants**: answering a background subagent's prompt with a session-long grant applies to the whole session, main conversation included.
- **Explore and Plan** skip CLAUDE.md, so project rules do not reach them unless you restate them.

## Good practice

### Writing a good description

- Say **what** the agent does and **when** to use it, in that order, in one or two sentences.
- Use the words a user or Claude would naturally use for the task ("review", "diff", "failing tests").
- Add "Use proactively after ..." only when you want automatic delegation.
- Avoid overlap with other agents. Two agents with similar descriptions make delegation unpredictable.

### Writing a good task brief (the delegation message)

A subagent knows only its prompt, CLAUDE.md, and your brief. A good brief contains:

1. **Goal**: one sentence on the outcome.
2. **Scope**: exact files, directories, branch, or diff. What is out of scope.
3. **Context**: decisions already made and facts the agent cannot discover itself.
4. **Constraints**: read-only or allowed to edit, time or size budget, rules to respect.
5. **Output format**: what to return and how long (for example "at most 8 lines, absolute paths").
6. **Done criteria**: how the agent knows it is finished.

### Subagent vs inline vs skill

| Situation | Use |
| :- | :- |
| Quick, targeted change or tight back-and-forth | Inline (main conversation) |
| Phases that share a lot of context (plan, implement, test) | Inline |
| Verbose output you only need summarized (search, logs, test runs) | Subagent |
| Independent tasks that can run at the same time | Several subagents in parallel |
| Enforce tool restrictions or a different model | Subagent |
| Reusable instructions or procedure that should run in the main context | Skill |
| Reusable procedure that should run isolated | Skill with `context: fork`, or a subagent with `skills` preloaded |

### Cost

- Pick the cheapest model that does the job well (`haiku` or `sonnet` for search and summaries).
- Restrict `tools` to what the job needs. Fewer tools means a smaller prompt and fewer wrong turns.
- Ask for a short, structured return. The caller pays again to read a long one.
- Do not delegate a two-line lookup. The fixed startup cost of a subagent is larger than the lookup.

## In this playbook

- `../project-structure-design.md § 19` for how subagents fit the overall AI configuration.
- `../project-structure-design.md § 4.1` (roles) and `§ 9.3` (subagents) for the role catalog and when each role is used.
- `../project-structure-design.md § 16` (configuring the AI), especially § 16.2 on role definitions.

## Sources

- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/skills
