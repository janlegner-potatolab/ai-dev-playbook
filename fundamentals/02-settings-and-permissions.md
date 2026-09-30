# Settings and Permissions

Settings files control how Claude Code behaves: which tools it may use without asking, which it must never use, which directories it can touch, which environment variables it gets and which hooks run. Unlike CLAUDE.md, settings are enforced by the client regardless of what the model decides.

## At a glance

| What | Where | Loaded when | Shared? |
| :- | :- | :- | :- |
| Managed settings | `managed-settings.json` in a system directory, MDM/OS policy, or server-managed settings from the claude.ai admin console | Every session, highest precedence | Everyone the organization deploys to |
| Command line | `claude --settings <file-or-json>`, `--permission-mode`, `--add-dir`, `--allowedTools`, `--disallowedTools` | That one session | No |
| Project local | `.claude/settings.local.json` | Sessions in this project | No (kept out of git) |
| Shared project | `.claude/settings.json` | Sessions in this project | Yes, via git |
| User | `~/.claude/settings.json` | Every session | No, just you |

## How it works

### Precedence

Highest first:

1. Managed settings
2. Command line arguments
3. Project local (`.claude/settings.local.json`)
4. Shared project (`.claude/settings.json`)
5. User (`~/.claude/settings.json`)

- For a scalar key, the highest level that sets it wins.
- List keys such as `permissions.allow` and `permissions.deny` merge across files instead of replacing each other. A few model-list keys have their own rules (check the current docs).
- Environment variables exported in your shell are not a level in this stack; the pairing between a variable and a settings key is decided per key. An `env` block inside a settings file is an ordinary key and follows the levels above.
- A handful of security-sensitive keys honor a stricter value from a lower level even over managed settings (check the current docs for the list).

### Files are strict JSON

- No comments, no trailing commas. A broken file is reported as a Settings Error at the next start.
- Add `"$schema": "https://json.schemastore.org/claude-code-settings.json"` for editor autocomplete and validation. The schema can lag behind new releases.
- Claude Code writes `.claude/settings.local.json` itself the first time you pick "Yes, and don't ask again", and adds it to your global git excludes. If you create it by hand, gitignore it yourself.
- In a subdirectory of a git repo, standing approvals go to the local file at the repository root. In a worktree, to the main checkout's root.

### Workspace trust

`permissions.allow` rules, `permissions.additionalDirectories` and most `env` values from a project's `.claude/settings.json` apply only after the user accepts the workspace trust dialog for that folder. `deny` and `ask` rules apply immediately, because they only restrict.

### Permission rules

Format: `Tool` or `Tool(specifier)`.

Evaluation order: **deny, then ask, then allow**. The first match wins, and specificity does not change the order.

- A broad deny (`Bash(aws *)`) beats a narrow allow (`Bash(aws s3 ls)`). An allow cannot carve an exception out of a deny.
- A matching ask rule prompts even when a more specific allow also matches.
- A deny at any level cannot be undone by an allow at any other level. A user deny blocks a project allow and vice versa.
- A bare tool name in deny (`Bash`, or `Bash(*)`) removes the tool from Claude's context entirely. A scoped deny (`Bash(rm *)`) leaves the tool available and blocks matching calls.

| Rule | Matches |
| :- | :- |
| `Bash` | Every Bash command |
| `Bash(npm run build)` | Exactly `npm run build` |
| `Bash(npm run *)` | `npm run build`, `npm run test --watch`, bare `npm run` |
| `Bash(ls *)` | `ls`, `ls -la`, not `lsof` (the space matters) |
| `Bash(ls*)` | `ls -la` and `lsof` |
| `Bash(ls:*)` | Same as `Bash(ls *)`; `:*` is recognized only at the end |
| `Read(./.env)` | Reading `.env` in the current directory |
| `Edit(/src/**/*.ts)` | Edits under `src/`, anchored at the settings source |
| `WebFetch(domain:example.com)` | Fetches to `example.com` |
| `WebFetch(domain:*.example.com)` | Any subdomain, not `example.com` itself |
| `mcp__github` or `mcp__github__*` | Every tool from the `github` MCP server |
| `mcp__github__get_issue` | One MCP tool |
| `Agent(isolation:worktree)` | Parameter match (deny and ask rules only) |

Bash matching details:

- Put the `*` after the subcommand. `Bash(git log *)` allows only `git log`; `Bash(git *)` allows every git command, including `git -c <option>` forms.
- Compound commands are split on `&&`, `||`, `;`, `|`, `|&`, `&` and newlines. An allow rule must match every subcommand. A deny or ask rule applies if any subcommand matches, including inside subshells and command substitutions.
- A fixed set of wrappers (`timeout`, `time`, `nice`, `nohup`, `stdbuf`, `command`, `builtin`, `noglob`, bare `xargs`) is stripped before matching. Runners such as `npx`, `docker exec`, `devbox run` are not stripped, so `Bash(npx *)` allows anything.
- A Bash rule matches command text, not the program. `Bash(rm *)` in deny does not stop `/bin/rm -rf x` or `bash -c 'rm -rf x'`. Treat Bash deny rules as guardrails against the usual form, not as a security boundary.

Read and Edit path patterns use gitignore syntax:

| Pattern | Meaning |
| :- | :- |
| `//path` | Absolute from filesystem root (`Read(//etc/**)`) |
| `~/path` | From your home directory |
| `/path` | Relative to the settings source: the project root for project and local settings, `~/.claude/` for user settings |
| `path` or `./path` | Relative to the current directory |

- `Edit` rules cover every built-in editing tool. Path rules written for `Write`, `Glob` or `NotebookEdit` are accepted but never consulted; use `Edit(...)` and `Read(...)`.
- A `Read` deny also blocks Edit and Write on that path.
- Read and Edit denies apply to built-in file tools, to recognized file commands in Bash (`cat`, `head`, `tail`, `sed`, `tee`) and to redirection targets. They do not stop a script or subprocess that opens the file itself. For that, use the sandbox.

### Permission modes

| Mode | Behavior |
| :- | :- |
| `default` | Prompts on first use of each tool (labeled Manual in the UI) |
| `acceptEdits` | Auto-accepts file edits and common filesystem commands (`mkdir`, `touch`, `mv`, `cp`) inside working directories |
| `plan` | Reads and runs read-only commands; does not edit source files |
| `auto` | No routine prompts; a background classifier reviews risky actions (availability depends on plan; check the current docs) |
| `dontAsk` | Auto-denies anything that would prompt; only pre-approved tools and no-approval actions run |
| `bypassPermissions` | Skips prompts, including writes to `.git` and `.claude`. Use only in isolated containers or VMs |

- Set the starting mode with `permissions.defaultMode`. `auto` and `bypassPermissions` do not take effect from project or local settings; set them in user or managed settings, or pass `--permission-mode`.
- Shift+Tab cycles modes during a session.
- `permissions.disableBypassPermissionsMode: "disable"` and `permissions.disableAutoMode: "disable"` prevent those modes. They are most useful in managed settings, but work from any scope.

### Working directories

- Claude can read files in the launch directory without prompts. Extend this with `--add-dir <path>` at startup, `/add-dir` during a session, or `permissions.additionalDirectories` in settings.
- Additional directories grant file access, not configuration. Directories from `permissions.additionalDirectories` load no `.claude/` configuration at all; `--add-dir` directories load a few types (check the current docs).
- `permissions.blockReadsOutsideWorkingDirectories` makes file tools refuse paths outside the working directories in every mode.

### Sandbox and isolation

- Permissions decide which tools, files and domains Claude Code may use. The sandbox enforces filesystem and network limits at the OS level for Bash (and a few other shell tools) and their child processes.
- Use both. Sandbox restrictions hold even if a prompt injection talks Claude into a command your text rules did not anticipate.
- With the sandbox on and `autoAllowBashIfSandboxed` at its default `true`, sandboxed Bash commands run without prompting even under a bare `Bash` ask rule. Content-scoped ask rules and explicit deny rules still apply.
- Sandbox keys live under `sandbox` in settings (for example `sandbox.enabled`). Check the current docs for the full key list and platform support.
- For `bypassPermissions` or long unattended runs, isolate at a higher level: a container, VM or separate git worktree.

## Configuration and examples

Team file, `.claude/settings.json`:

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "permissions": {
    "allow": [
      "Bash(npm run lint)",
      "Bash(npm run test *)",
      "Bash(git status)",
      "Bash(git diff *)",
      "Bash(git log *)"
    ],
    "ask": [
      "Bash(git push *)"
    ],
    "deny": [
      "Read(./.env)",
      "Read(./.env.*)",
      "Read(./secrets/**)"
    ],
    "defaultMode": "default"
  },
  "env": {
    "NODE_ENV": "development"
  }
}
```

Personal override, `.claude/settings.local.json`:

```json
{
  "permissions": {
    "additionalDirectories": ["../shared-lib"]
  }
}
```

### Recommended baseline deny list

Put this in `~/.claude/settings.json` so it applies to every project. Deny rules merge, so project files can add more but cannot remove these.

```json
{
  "permissions": {
    "deny": [
      "Read(**/.env)",
      "Read(**/.env.*)",
      "Read(**/*.pem)",
      "Read(**/*.key)",
      "Read(**/id_rsa*)",
      "Read(**/id_ed25519*)",
      "Read(~/.ssh/**)",
      "Read(~/.aws/**)",
      "Read(~/.config/gcloud/**)",
      "Bash(rm -rf *)",
      "Bash(sudo *)",
      "Bash(git push --force *)",
      "Bash(git push -f *)",
      "Bash(git reset --hard *)",
      "Bash(curl * | sh)",
      "Bash(curl * | bash)"
    ]
  }
}
```

- `**/.env.*` also matches `.env.example`. If you want Claude to read the example file, rename it (for example `env.example`) rather than weakening the rule.
- These Bash denies catch the common spelling only. Pair them with a PreToolUse hook, the sandbox, and server-side branch protection.

## Commands

| Command | Purpose |
| :- | :- |
| `/permissions` | View all rules and the file each comes from; add or remove rules |
| `/config` | Settings panel for UI-level options |
| `/add-dir <path>` | Add a working directory for this session |
| `/status` | Show active account, settings sources and warnings |
| `claude --permission-mode <mode>` | Start in a given mode |
| `claude --settings <file-or-json>` | Layer an extra settings file for one session |
| `claude --allowedTools` / `--disallowedTools` | Add session-level allow or deny rules |

## Limits and gotchas

- Strict JSON: one trailing comma disables the whole file.
- "Yes, and don't ask again" writes an allow rule to your local file. It does not beat an `ask` rule from a project or managed file, so you may keep being prompted.
- Allow rules from a cloned repo do nothing until you trust the folder. Deny rules apply immediately.
- A single leading slash is not absolute. `/Users/me/file` is relative to the settings source; write `//Users/me/file`.
- `Bash(git * main)` style rules (wildcard before the subcommand) match far more than intended, including `git -c` tricks. Claude Code warns at startup.
- A path rule on `Write(...)` is silently useless. Use `Edit(...)`.
- Read denies do not stop a Python or Node script from opening the file.
- Tool names in rules must be canonical names, not transcript labels.

## Good practice

- Start from deny: write the baseline deny list at user level before adding any allow rules.
- Keep allow rules narrow and put `*` after the subcommand.
- Commit `.claude/settings.json` so the team shares the same allow, ask and deny rules and hooks. Keep personal exceptions in `.claude/settings.local.json`.
- Use `ask` for irreversible but legitimate actions (push, deploy, migrations) rather than deny.
- Never put secrets in the `env` block of a committed file. Use the platform's secret store or your shell.
- Review `/permissions` periodically and remove standing approvals you no longer need.
- Reserve `bypassPermissions` for disposable containers or VMs.

## In this playbook

- `../project-structure-design.md § 6` (Repository setup for AI): the committed `.claude/settings.json` a repository ships with.
- `../project-structure-design.md § 13` (Communication, security and memory): the security floor the deny list implements.
- `../project-structure-design.md § 19` (My Claude Code setup): the concrete user-level settings file.

## Sources

- https://code.claude.com/docs/en/settings
- https://code.claude.com/docs/en/permissions
- https://code.claude.com/docs/en/memory
