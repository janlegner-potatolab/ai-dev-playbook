# Context, Models and Cost

Every request Claude Code sends carries the whole working context: system prompt, tool definitions, memory files, skill descriptions and the conversation so far. What you put in that context decides both answer quality and cost. This file explains what fills the window, how to inspect and reset it, how to pick a model and effort level, and the habits that keep spend under control.

## At a glance

| Topic | Summary |
| --- | --- |
| Context window | Model-dependent; several current models run with a 1M token window, others with 200K. Check `/context` for your session |
| What fills it | System prompt, tool definitions, CLAUDE.md and rules, auto memory, skill descriptions, conversation and tool results |
| Inspect | `/context` (breakdown by category), `/usage` (tokens, cache, plan usage) |
| Reset | `/clear` (fresh conversation, costs nothing), `/compact [focus]` (summarize), `/rewind` (partial summarize or undo) |
| Model | `/model`, `--model`, `ANTHROPIC_MODEL`, `model` in settings; aliases `sonnet`, `opus`, `haiku`, `opusplan` |
| Effort | `/effort`, `--effort`, `CLAUDE_CODE_EFFORT_LEVEL`; levels depend on the model |
| Caching | Automatic prompt caching of the stable prefix; long idle gaps cause cache misses |
| Biggest lever | Keep always-loaded content short and clear the conversation between unrelated tasks |

## How it works

### What fills the context window

| Layer | Loaded | Notes |
| --- | --- | --- |
| System prompt and output style | Always | Fixed by Claude Code |
| Built-in tool definitions | Always | |
| MCP tools | Names and server instructions only, by default | Full definitions load on demand (tool search) |
| CLAUDE.md (user, project root) and unscoped rules | Always, at session start | Imports via `@path` add to this |
| Nested CLAUDE.md and path-scoped rules | When Claude reads a matching file | |
| Auto memory index | At session start | Limits apply; see the memory docs |
| Skill descriptions | Always | Full skill body loads only when invoked |
| Conversation | Grows every turn | Your prompts, Claude's replies, every tool call and tool result |

Claude Code resends the full context with every request, and every tool call adds another request carrying the tool results. A one-line question late in a long session still pays for the entire history (at the cached rate when the cache is warm).

### Compaction

When the conversation approaches the auto-compact threshold, Claude Code summarizes the history so the session can continue. The threshold depends on the model and configuration (check the current docs for per-model defaults). You can also run `/compact` yourself, optionally with a focus.

What survives compaction:

| Content | After compaction |
| --- | --- |
| System prompt and output style | Still apply |
| Project-root CLAUDE.md and unscoped rules | Re-injected from disk |
| Auto memory | Re-injected from disk |
| Plan written in plan mode | Re-injected from disk |
| Git status | Fresh snapshot |
| Nested CLAUDE.md and path-scoped rules | Summarized away; reloaded when Claude reads matching files again |
| Files Claude read or edited | Up to five most recently modified are re-read; files over 5,000 tokens come back as a path reference |
| Invoked skill bodies | Re-injected, capped at 5,000 tokens per skill and 25,000 in total; oldest dropped first |
| Conversation details and hook-added context | Only what the summary kept |
| Background commands and subagents | Keep running |

Consequences:
- A rule that must survive compaction belongs in the project-root CLAUDE.md, not in a path-scoped rule.
- Put the most important instructions at the top of a `SKILL.md`; truncation keeps the start.
- Compacting a large context is itself a large request. `/clear` is free.

### Prompt caching

Claude Code caches the stable prefix of each request (system prompt, tools, memory, earlier conversation) automatically. Cached reads are much cheaper than reprocessing. Practical rules:
- The cache has a limited lifetime. After a long break, the first message reprocesses the full context. The lifetime differs by plan and provider (check the current docs).
- Changing things that sit in the prefix (tool definitions, model, effort level) can invalidate the cache. Claude Code may warn before such a switch.
- `/usage` shows cache hits and misses for the session, and sometimes the likely cause of the last miss.

## Configuration and examples

### Choosing a model

| Alias | Use for |
| --- | --- |
| `sonnet` | Most day-to-day coding |
| `opus` | Complex architecture, hard debugging, multi-step reasoning |
| `haiku` | Simple, fast, cheap tasks; good for simple subagents |
| `opusplan` | Opus while in plan mode, Sonnet for execution |
| `sonnet[1m]`, `opus[1m]` | 1M context variant where the model needs it and your plan allows |
| `default` | Clears your override and returns to the account default |

Aliases resolve to the recommended version for your provider and change over time. Pin a full model ID when you need reproducibility.

Priority of model settings (highest first): `/model` in the session, `claude --model`, `ANTHROPIC_MODEL`, the `model` field in settings, `ANTHROPIC_DEFAULT_MODEL` for new sessions.

```json
{
  "model": "sonnet"
}
```

Subagents inherit the session's model unless their frontmatter sets `model:`. Switching the main session to Opus also makes inheriting subagents run on Opus.

```markdown
---
name: log-scanner
description: Scans large logs and returns only the relevant errors
model: haiku
---
```

### Effort and thinking

- Effort controls how much the model reasons per step. Lower is faster and cheaper; higher tests more edge cases and verifies more.
- Levels are `low`, `medium`, `high`, `xhigh`, `max`, but which ones exist and which is the default depend on the model. An unsupported level falls back to the highest supported one below it.
- Set it with `/effort` (slider or level name), `--effort`, `CLAUDE_CODE_EFFORT_LEVEL`, per-model settings, or `effort` in skill and subagent frontmatter.
- `max` applies to the current session only unless set by environment variable; it can overthink, so test before using broadly.
- Including `ultrathink` in a prompt requests deeper reasoning for that one turn without changing the session setting.
- Thinking tokens are billed as output tokens. On some models thinking cannot be turned off; lower the effort instead.

### Compaction instructions in CLAUDE.md

```markdown
# Compact instructions
When compacting, always preserve the full list of modified files and the test commands used.
```

## Commands

| Command | What it does |
| --- | --- |
| `/context` | Live breakdown of context usage by category, including which memory files loaded |
| `/usage` | Token usage, prompt cache statistics, plan usage |
| `/clear` | Start a fresh conversation (memory files and settings still load) |
| `/compact [instructions]` | Summarize the conversation, keeping what you name |
| `/rewind` or `Esc Esc` | Restore an earlier checkpoint, or summarize from or up to a message |
| `/autocompact <size>` | Set how full the window gets before automatic compaction |
| `/model [alias or id]` | Switch model; `Enter` saves as default, `s` applies to this session only |
| `/effort [level]` | Set effort level |
| `/memory` | Open and edit CLAUDE.md and auto memory files |
| `/rename`, `/resume` | Name a session before clearing, return to it later |
| `/btw` | Ask a side question whose answer does not enter the history |

## Limits and gotchas

- Context window size is per model and per provider. Do not assume a single number; read `/context`.
- A long, cluttered context degrades quality before it hits the limit: Claude can get distracted by stale files and failed attempts.
- Idle sessions can still spend: scheduled tasks, background work check-ins and messages from other sessions each resend the full context.
- Subagents and agent teams run their own requests; their tokens count against the same usage.
- Cost figures reported by `claude -p --output-format json` are client-side estimates.
- Path-scoped rules and nested CLAUDE.md vanish from context at compaction until a matching file is read again.

## Good practice

1. **Pick the model per task.** Sonnet by default, Opus for hard reasoning, Haiku for simple subagents. Consider `opusplan` for plan-heavy work.
2. **Lower effort for routine work**, raise it where correctness matters.
3. **Keep always-loaded files short.** CLAUDE.md under about 200 lines, only what applies to every task. Move workflow-specific instructions into skills, which load on demand.
4. **Disable unused MCP servers** and prefer CLIs where they exist.
5. **Isolate verbose work in subagents.** Test runs, log processing and documentation research stay in the subagent's context; only a summary comes back.
6. **Filter output before Claude sees it**, for example with a hook that returns only failing tests.
7. **Write specific prompts.** Name files, functions and the expected result; vague requests trigger broad scanning.
8. **Plan before large changes** so you do not pay for implementing the wrong approach.
9. **Start a new session (or `/clear`) when:** you switch to an unrelated task; you have corrected the same mistake twice; the context is full of failed approaches; you are about to implement a spec written in an earlier session.
10. **Compact deliberately** with a focus before a long new phase, instead of waiting for the automatic pass to guess.

## In this playbook

- Session and context management rules: `../project-structure-design.md` § 8.
- Model choice per task: `../project-structure-design.md` § 12; cost tracking: § 16.8.
- Personal setup reference: `../project-structure-design.md` § 19.

## Sources

- https://code.claude.com/docs/en/costs
- https://code.claude.com/docs/en/model-config
- https://code.claude.com/docs/en/context-window
- https://code.claude.com/docs/en/best-practices
