# Worktrees, Parallel Sessions and Headless Mode

Claude Code can run several sessions at once without their edits colliding, and it can run without a human at the keyboard in scripts and CI. Git worktrees give each session its own files and branch; headless mode (`claude -p`) and the Agent SDK turn Claude Code into a building block for automation. This file covers both and the rules that keep parallel work safe.

## At a glance

| Topic | Summary |
| --- | --- |
| Worktree | A separate working directory and branch sharing one repository history |
| Built-in support | `claude --worktree <name>` (or `-w`) creates `.claude/worktrees/<name>/` on branch `worktree-<name>` |
| Manual | `git worktree add ../dir -b branch`, then run `claude` in that directory |
| Isolation | Inside a worktree session, edits and git commands aimed at the main checkout are blocked |
| Cleanup | Interactive exit prompts or auto-removes; `-p` runs never clean up |
| Subagents | `isolation: worktree` in subagent frontmatter gives each run its own temporary worktree |
| Headless | `claude -p "<prompt>"`, output `text`, `json` or `stream-json` |
| CI | Claude Code GitHub Action (`anthropics/claude-code-action`), setup via `/install-github-app` |
| SDK | Agent SDK for Python and TypeScript: the Claude Code agent loop as a library |

## How it works

### Worktrees

A git worktree is a second checkout of the same repository: its own files and branch, shared `.git` history and remotes. One session per worktree means one session can build a feature while another fixes a bug, and neither sees the other's uncommitted files.

With `claude --worktree feature-auth`:
1. Claude Code creates `.claude/worktrees/feature-auth/` on a new branch `worktree-feature-auth`.
2. The branch starts from the repository's default branch by default. Set `worktree.baseRef` to `"head"` to branch from the current HEAD, or pass a PR number or URL (`--worktree "#1234"`) to branch from a pull request.
3. The session starts inside the worktree. Omit the name and Claude Code generates one.
4. Interactive runs require workspace trust in that repository; `-p` runs skip the trust check.

You can also ask Claude to "work in a worktree" mid-session (it uses the `EnterWorktree` tool).

### Isolation enforcement

While a session is isolated in a worktree, Claude Code blocks:
- `Edit`, `Write` and `NotebookEdit` targeting the main checkout.
- Shell commands whose working directory resolves to the main checkout, or cannot be verified to stay outside it.
- Git redirected into the main checkout (`git -C`, `--git-dir`, `GIT_DIR`, `GIT_WORK_TREE`, `cd` then git).
- Commands whose git usage cannot be verified from the command text.

The same rules apply to subagents spawned from the isolated session. Claude sees each refusal as a tool error naming the worktree.

### What worktrees share

- The repository's `.git` directory (commits from a worktree land in the shared history).
- Plugins installed at project scope in the main checkout.
- Permission approvals: "don't ask again" in a worktree is saved to the main checkout's `.claude/settings.local.json` and applies to all worktrees.
- Untracked project skills, agents and commands, when the worktree has none of its own.

A worktree does not share gitignored files such as `.env` or `node_modules`. It is a fresh checkout: install dependencies there, or list files to copy in `.worktreeinclude` (gitignore syntax).

### Headless mode

`claude -p "<prompt>"` runs one non-interactive request and prints the result. It loads the same context an interactive session would (CLAUDE.md, hooks, MCP servers, skills) unless you pass `--bare`, which skips auto-discovery and is the recommended mode for scripts and CI. A `-p` run shows no trust dialog and no MCP approval prompt, so it will run a repository's project hooks and `.mcp.json` servers.

## Configuration and examples

### Built-in worktrees

```bash
# Two isolated sessions in two terminals
claude --worktree feature-auth
claude --worktree fix-login

# Resume a kept worktree session (command is printed on exit)
claude --worktree feature-auth --resume
```

Add `.claude/worktrees/` to `.gitignore`. Copy needed gitignored files automatically:

```text
# .worktreeinclude
.env.local
config/dev-secrets.json
```

### Manual worktrees

```bash
git worktree add ../project-feature-a -b feature-a   # new branch
git worktree add ../project-bugfix fix-issue-456     # existing branch
cd ../project-feature-a && claude
git worktree list
git worktree remove ../project-feature-a
```

### Subagent in its own worktree

```markdown
---
name: refactorer
description: Applies mechanical refactors across many files
isolation: worktree
---
Apply the requested refactor across every affected file, then run the tests and report the results.
```

### Headless examples

```bash
# Allow specific tools without prompts
claude -p "Run the test suite and fix any failures" --allowedTools "Bash,Read,Edit"

# Fast, reproducible scripted call
claude --bare -p "Summarize README.md" --allowedTools "Read"

# JSON result with session ID and metadata; text is in .result
claude -p "Summarize this project" --output-format json | jq -r '.result'

# Structured output validated against a schema (lands in .structured_output)
claude -p "List the exported functions in src/" --output-format json \
  --json-schema '{"type":"object","properties":{"functions":{"type":"array","items":{"type":"string"}}},"required":["functions"]}'

# Streaming events
claude -p "Explain recursion" --output-format stream-json --verbose --include-partial-messages

# Multi-step conversation
session_id=$(claude -p "Start a review" --output-format json | jq -r '.session_id')
claude -p "Continue that review" --resume "$session_id"

# Pipe data in
cat build-error.txt | claude -p "Explain the root cause of this build error"
```

Permission baselines for unattended runs: `--permission-mode dontAsk` (deny anything that would prompt; good for locked-down CI), `acceptEdits` (file writes allowed), `auto` (a classifier reviews actions). The default for `-p` is Manual, so pass the mode you want.

### GitHub Actions

Quick setup: run `/install-github-app` in the repository (requires admin access and an authenticated `gh`). It installs the GitHub App, stores `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN` as a repository secret and opens a PR with the workflow.

```yaml
name: Claude Code
on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]
jobs:
  claude:
    if: contains(github.event.comment.body, '@claude')
    runs-on: ubuntu-latest
    timeout-minutes: 30
    permissions:
      contents: write
      pull-requests: write
      issues: write
      id-token: write
      actions: read
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 1
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          claude_args: "--max-turns 10"
```

### Agent SDK in brief

The Agent SDK exposes the same tools, agent loop and context management as Claude Code, as a CLI (`claude -p`) and as Python and TypeScript packages. Use the packages when you need tool approval callbacks (`canUseTool`), native message objects, streaming callbacks or your own hosting. You run and deploy it yourself.

## Commands

| Command | Purpose |
| --- | --- |
| `claude --worktree <name>` / `-w` | Start in a new or existing named worktree |
| `claude --worktree "#<pr>"` | Worktree branched from a pull request |
| `git worktree add / list / remove / unlock` | Manual worktree management |
| `claude -p "<prompt>"` | Headless run |
| `--output-format text / json / stream-json` | Output shape |
| `--json-schema '<schema>'` | Structured output (with `json`) |
| `--continue`, `--resume <id>` | Continue the latest or a specific conversation |
| `--allowedTools`, `--permission-mode` | Pre-approve tools or set a baseline mode |
| `--bare` | Skip auto-discovery of hooks, skills, plugins, MCP, memory, CLAUDE.md |
| `--max-turns <n>` | Cap iterations (useful in CI) |
| `/install-github-app` | Set up the GitHub Action |

## Limits and gotchas

- Worktrees need git. Other version control systems need `WorktreeCreate` and `WorktreeRemove` hooks.
- `-p` runs never clean up their worktrees; remove them with `git worktree remove` (and `git worktree unlock` first if git refuses).
- Removing a worktree with uncommitted work deletes that work and its branch. Claude Code prompts, but read the prompt.
- Hook scripts referenced via `${CLAUDE_PROJECT_DIR}` still run from the main checkout; the `cwd` field in hook input is the worktree.
- Approvals saved in one worktree apply to all of them, so a permissive "don't ask again" spreads.
- Without `--bare`, a headless run in an untrusted repository runs its project hooks and the MCP servers defined in `.mcp.json`.
- OAuth sign-in for MCP servers cannot happen in `-p`; authenticate interactively first.
- GitHub Actions runs consume both Actions minutes and tokens.

## Good practice

1. **One writer per worktree.** Never let two sessions edit the same checkout.
2. **Shared files have one owner.** Lockfiles, migration numbering, version files, changelogs and shared docs are edited by one designated session; others propose changes in their PR description or wait.
3. **Merge through git, not through the filesystem.** Each session commits on its own branch; integration happens via PR or merge, after rebasing on the latest main.
4. **Re-check after integrating main.** A merge can silently bring in someone else's revert or reorder; run tests again.
5. **Clean up** finished worktrees and branches; list them with `git worktree list` regularly.
6. **Use a fresh session to review.** A writer session and a separate reviewer session catch more than self-review.
7. **In CI:** use `--bare`, an explicit `--allowedTools` list or `dontAsk`, `--max-turns`, job timeouts and concurrency limits. Keep secrets in the CI secret store, never in the repository.
8. **Parse JSON, not text,** when a script consumes the output.

## In this playbook

- Parallel work rules: `../project-structure-design.md` § 9.
- Session handling: `../project-structure-design.md` § 8; personal setup: § 19.
- Ready prompts for parallel and CI tasks: `../prompts/`.

## Sources

- https://code.claude.com/docs/en/worktrees
- https://code.claude.com/docs/en/headless
- https://code.claude.com/docs/en/github-actions
- https://code.claude.com/docs/en/best-practices
