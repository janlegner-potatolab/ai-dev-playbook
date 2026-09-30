# Hooks

Hooks are handlers (usually shell commands) that Claude Code runs automatically at fixed points in its lifecycle: before a tool runs, after it runs, when a prompt is submitted, when Claude tries to stop, and more. They give deterministic control: the action always happens, instead of relying on the model to remember an instruction.

## At a glance

| What | Where | Loaded when | Shared? |
| :- | :- | :- | :- |
| User hooks | `hooks` key in `~/.claude/settings.json` | Every session | No |
| Project hooks | `hooks` key in `.claude/settings.json` | Sessions in this project (after workspace trust) | Yes, via git |
| Local hooks | `hooks` key in `.claude/settings.local.json` | Sessions in this project | No |
| Managed hooks | Managed policy settings | Every session; cannot be disabled by users | Organization |
| Plugin hooks | `hooks/hooks.json` in a plugin | While the plugin is enabled | Yes, with the plugin |
| Skill / subagent hooks | Frontmatter of the skill or subagent | While that skill or subagent is active | Yes, with the file |

Hooks from all sources run together; they do not replace each other.

## How it works

### Main events

| Event | Fires | Matcher filters on | Can block? |
| :- | :- | :- | :- |
| `SessionStart` | Session starts, resumes, clears or compacts | Source (`startup`, `resume`, `clear`, `compact`) | No; stdout is added to Claude's context |
| `UserPromptSubmit` | You submit a prompt, before Claude sees it | (no matcher) | Yes, the prompt never reaches Claude |
| `PreToolUse` | Before a tool call executes | Tool name | Yes, blocks the call |
| `PermissionRequest` | A permission dialog is about to be shown | Tool name | Via JSON `decision` only, not exit 2 |
| `PostToolUse` | After a tool call succeeds | Tool name | No (the tool already ran); stderr on exit 2 is shown to Claude |
| `PostToolUseFailure` | After a tool call fails | Tool name | No |
| `Notification` | Claude Code sends a notification | Notification type (check the current docs) | No |
| `Stop` | Claude is about to finish its turn | (no matcher) | Yes, Claude continues working |
| `SubagentStart` / `SubagentStop` | A subagent starts / finishes | Agent type | `SubagentStop` can block |
| `PreCompact` / `PostCompact` | Around context compaction | Trigger | `PreCompact` can block |
| `InstructionsLoaded` | A CLAUDE.md or rules file is loaded | Load reason | No; useful for debugging |
| `SessionEnd` | Session ends | End reason | No; very short time budget |

More events exist (file watching, working-directory changes, model switches, setup). Check the current docs for the full list and each event's exact input schema.

### Matchers

- `"*"`, `""` or an omitted `matcher` matches everything.
- A string of only letters, digits, `_`, `-`, spaces, `|` and `,` is an exact match or a list: `"Bash"`, `"Edit|Write"`.
- Anything else is a JavaScript regular expression, unanchored: `"^Notebook"`, `"mcp__github__.*"`.
- MCP tools are named `mcp__<server>__<tool>`. Match all tools of a server with `"mcp__<server>__.*"`.
- Matchers are case-sensitive and match canonical tool names.
- A handler can add an `if` field with permission-rule syntax (for example `"Bash(git *)"`) to run only for matching tool calls.

### Handler types

| `type` | What it does |
| :- | :- |
| `command` | Runs a shell command (or an executable with `args`, no shell). Receives JSON on stdin |
| `http` | POSTs the JSON to a URL |
| `mcp_tool` | Calls a tool on a configured MCP server |
| `prompt` | Asks a Claude model to evaluate the event and return a decision |
| `agent` | Spawns a subagent to evaluate the event (check the current docs; may be experimental) |

Useful `command` fields: `command` (required), `args` (exec form, no shell quoting), `if`, `timeout` (seconds), `async` (run in background), `statusMessage` (spinner text), `shell` (`bash` or `powershell`).

### Input (stdin JSON)

Every event sends a JSON object on stdin. Common fields:

```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/path/to/project",
  "permission_mode": "default",
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": { "command": "npm test" }
}
```

- Tool events add `tool_name` and `tool_input`; `PostToolUse` also carries the tool's response.
- `Stop` carries `stop_hook_active`, which is `true` when Claude is already continuing because of a Stop hook. Check it to avoid loops.
- Read stdin once (`INPUT=$(cat)`) and parse with `jq` or a real JSON parser.

### Exit codes

| Exit code | Meaning | stdout | stderr |
| :- | :- | :- | :- |
| `0` | Success | Parsed as JSON if it is a JSON object; otherwise plain text, shown to Claude only for `UserPromptSubmit` and `SessionStart` (and a few others), debug log otherwise | Debug log |
| `2` | Blocking error | JSON fields still honored | Used as the block reason (fed to Claude or shown to the user, per event) |
| Any other | Non-blocking error; the action proceeds | Parsed as JSON if valid | First line shown as a hook error notice |

Exit 2 per event:

| Event | Effect of exit 2 |
| :- | :- |
| `PreToolUse` | Blocks the tool call; stderr goes to Claude |
| `PermissionRequest` | Ignored; use the JSON `decision` instead |
| `PostToolUse` | Shows stderr to Claude; the tool already ran |
| `UserPromptSubmit` | Blocks the prompt |
| `Stop` / `SubagentStop` | Prevents stopping; Claude keeps working |
| `PreCompact` | Blocks compaction |
| `SessionStart` / `SessionEnd` | Shows stderr to the user only |
| `Notification` | Ignored |

Note: exit `1` does **not** block. A guard that fails with exit 1 lets the action through.

### JSON output

For richer control, print one JSON object to stdout and exit 0.

Universal fields: `continue` (`false` stops Claude entirely), `stopReason` (message shown when `continue` is false), `systemMessage` (warning shown to the user).

`PreToolUse` decision:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Direct pushes to main are not allowed"
  }
}
```

- `permissionDecision` is `allow`, `deny` or `ask`. `updatedInput` can rewrite the tool input; `additionalContext` adds text for Claude.
- Hook decisions do not bypass permission rules: a matching deny rule still blocks and a matching ask rule still prompts even if the hook returns `allow`.
- A hook that exits 2 blocks before permission rules are evaluated, so it wins over allow rules.

`PostToolUse`, `Stop`, `UserPromptSubmit` use top-level `{"decision": "block", "reason": "..."}`. `additionalContext` under `hookSpecificOutput` feeds non-blocking context to Claude.

### Timeouts and execution

- Default timeout for `command` handlers is 600 seconds; `prompt` handlers default to 30 seconds. Some events have shorter budgets (`SessionEnd` is very short). Override per handler with `timeout`.
- A timed-out hook is discarded and the action proceeds.
- All matching hooks for an event run in parallel. An identical handler defined in several settings files runs once.
- Hooks run in the current directory and inherit Claude Code's environment.
- `$CLAUDE_PROJECT_DIR` points at the project root where the session started. Use it to reference scripts so they work from any subdirectory.

## Configuration and examples

Structure:

```json
{
  "hooks": {
    "<EventName>": [
      {
        "matcher": "<tool or pattern>",
        "hooks": [
          { "type": "command", "command": "<command>", "timeout": 30 }
        ]
      }
    ]
  }
}
```

### Worked example: guard plus lint feedback

Goal: block `git push` to `main`/`master` before it runs, and after every file edit run the linter and feed failures back to Claude.

`.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/guard-push.sh",
            "timeout": 10
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/lint-feedback.sh",
            "timeout": 60
          }
        ]
      }
    ]
  }
}
```

`.claude/hooks/guard-push.sh`:

```bash
#!/usr/bin/env bash
# PreToolUse guard: block git push to main or master.
# Fails open on internal errors: only an explicit match exits 2.
set -uf  # -f: no glob expansion when splitting words

INPUT=$(cat) || exit 0
COMMAND=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null) || exit 0
[ -z "$COMMAND" ] && exit 0

# Escape hatch, visible in the command text and the transcript.
case "$COMMAND" in
  *ALLOW_PUSH_MAIN=1*) exit 0 ;;
esac

# Decide by command position: split on shell separators and inspect
# each segment's leading words, so "echo git push main" does not match.
while IFS= read -r segment; do
  set -- $segment
  [ "${1:-}" = "git" ] && [ "${2:-}" = "push" ] || continue
  for arg in "$@"; do
    case "$arg" in
      main|master|*:main|*:master)
        echo "Blocked: direct push to $arg. Open a pull request instead." >&2
        exit 2 ;;
    esac
  done
done < <(printf '%s\n' "$COMMAND" | awk '{ gsub(/&&|\|\||;|\|/, "\n"); print }')

exit 0
```

`.claude/hooks/lint-feedback.sh`:

```bash
#!/usr/bin/env bash
# PostToolUse: lint the edited file and show failures to Claude.
set -u

INPUT=$(cat) || exit 0
FILE=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null) || exit 0
case "$FILE" in
  *.ts|*.tsx|*.js|*.jsx) ;;
  *) exit 0 ;;
esac

if ! OUTPUT=$(npx --no-install eslint "$FILE" 2>&1); then
  echo "Lint failed for $FILE. Fix these before continuing:" >&2
  echo "$OUTPUT" >&2
  exit 2
fi
exit 0
```

Make both executable (`chmod +x .claude/hooks/*.sh`), then test with known input before relying on them:

```bash
echo '{"tool_name":"Bash","tool_input":{"command":"git push origin main"}}' \
  | .claude/hooks/guard-push.sh; echo "exit=$?"    # expect exit=2
echo '{"tool_name":"Bash","tool_input":{"command":"echo git push main"}}' \
  | .claude/hooks/guard-push.sh; echo "exit=$?"    # expect exit=0
```

## Commands

| Command | Purpose |
| :- | :- |
| `/hooks` | Browse configured hooks by event, matcher and source file (edit the JSON to change them) |
| `claude --debug` | See hook execution details and JSON parse errors |
| `"disableAllHooks": true` | Settings key that turns off all non-managed hooks; individual hooks cannot be toggled |

## Limits and gotchas

- Exit 1 is not a block. Only exit 2 (or a JSON deny) blocks.
- `PostToolUse` cannot undo the tool call. Use `PreToolUse` to prevent, `PostToolUse` to react.
- A shell profile that `echo`es unconditionally prepends text to stdout, so JSON output is no longer parsed. Guard profile output to interactive shells.
- JSON built by string concatenation breaks on quotes. Build it with `jq -n`.
- A `Stop` hook that always blocks loops; Claude Code overrides it after repeated blocks. Check `stop_hook_active`.
- Matchers are case-sensitive and use canonical tool names.
- Project hooks run arbitrary code from the repository. Review them before trusting a cloned folder.
- `jq` must be installed wherever the hook runs, including CI images and teammates' machines.
- Hooks see command text. `bash -c '...'`, aliases, or scripts that call git internally can evade a text-based guard.

## Good practice

Writing reliable hooks:

- **Fail open on internal error.** A guard that crashes (missing `jq`, bad JSON) should exit 0, not 2, so a broken hook does not freeze all work. Block only on an explicit, positive match.
- **Test with known-bad and known-good input.** Pipe sample JSON into the script and check the exit code before committing. Keep those samples as a small test file.
- **Put the message on stderr.** On exit 2, stderr is what Claude reads to understand the block and adjust. Say what was blocked and what to do instead.
- **Decide by command position.** Split on shell separators and check the leading words of each segment. Substring matching (`*git push*main*`) produces false positives on `echo`, commit messages and file names.
- **Keep escape hatches visible.** If an override exists, make it an explicit token in the command (as above) or an environment variable, so it shows up in the transcript and review, never a silent file or flag.
- **Keep hooks fast.** Set a `timeout`. Lint one file, not the whole repo.
- **Reference scripts via `$CLAUDE_PROJECT_DIR`** and commit them under `.claude/hooks/`.
- **Never rely on hooks as the only safety net.** Hooks run on one machine, can be disabled, and inspect text. Back every critical rule with server-side enforcement: branch protection on the default branch, required CI checks, and required reviews.

## In this playbook

- `../project-structure-design.md § 15` (Structure guards): the guards this repository enforces and how they are tested.
- `../project-structure-design.md § 6` (Repository setup for AI): where hook scripts and settings live in a repo.
- `../project-structure-design.md § 19` (My Claude Code setup): the concrete hooks used day to day.

## Sources

- https://code.claude.com/docs/en/hooks
- https://code.claude.com/docs/en/hooks-guide
- https://code.claude.com/docs/en/permissions
