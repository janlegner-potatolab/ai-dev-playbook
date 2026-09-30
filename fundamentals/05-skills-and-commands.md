# Skills and Commands

A skill is a folder with a `SKILL.md` file that teaches Claude a procedure, a checklist, or reference knowledge. Only its name and description sit in context all the time; the body and any supporting files load when the skill is used. Custom slash commands have been merged into skills: both create a `/name` command.

## At a glance

| Aspect | Summary |
| :- | :- |
| Definition | `<skill-name>/SKILL.md`: YAML frontmatter plus Markdown instructions |
| Project scope | `.claude/skills/<skill-name>/SKILL.md` (commit it to share) |
| Personal scope | `~/.claude/skills/<skill-name>/SKILL.md` |
| Plugin scope | `skills/` inside a plugin, invoked as `/plugin-name:skill-name` |
| Always in context | Name and description (unless hidden) |
| Loaded on demand | `SKILL.md` body, then supporting files as Claude reads them |
| Invocation | By Claude (matched on description) or by you (`/skill-name args`) |
| Standard | Follows the open Agent Skills format, with Claude Code extensions |

## How it works

### Progressive disclosure

1. **Listing**: at session start Claude Code puts every skill's name and description into context so Claude knows what exists.
2. **Body**: when you or Claude invoke the skill, the rendered `SKILL.md` enters the conversation as one message and stays there for later turns.
3. **Supporting files**: `reference.md`, examples, or scripts in the skill folder load only when Claude reads or runs them.

Long reference material therefore costs almost nothing until it is needed. This is the main difference from CLAUDE.md, which loads in full every session.

### Invocation

- **Model-invoked**: Claude reads the listing and loads a skill when the request matches its description.
- **User-invoked**: you type `/skill-name`, optionally followed by arguments. Plugin skills use `/plugin-name:skill-name`.
- Both are on by default. Frontmatter can restrict either side (see Visibility controls).

### Content lifecycle

- Claude Code does not re-read `SKILL.md` on later turns; the copy from invocation stays in the conversation.
- After auto-compaction, only the start of each invoked skill is re-attached (a limited token budget per skill). Put the most important instructions near the top.
- An `allowed-tools` grant lasts only for the turn that invoked the skill and clears when you send your next message.

### Skills vs custom commands

A file at `.claude/commands/deploy.md` and a skill at `.claude/skills/deploy/SKILL.md` both create `/deploy`. Existing command files keep working. If both exist with the same name, the skill wins. Skills add a folder for supporting files, richer frontmatter, invocation control, and live reload. Prefer skills for anything new.

## Configuration and examples

### Locations and name conflicts

| Location | Path | Loads in |
| :- | :- | :- |
| Enterprise | `.claude/skills/<name>/SKILL.md` in the managed settings directory | All users where the organization deploys it |
| Personal | `~/.claude/skills/<name>/SKILL.md` | All your projects on this machine (not cloud sessions) |
| Project | `.claude/skills/<name>/SKILL.md` | Sessions in this repository |
| Nested | `<subdir>/.claude/skills/<name>/SKILL.md` | Sessions started in or below `<subdir>`, or once Claude works on files there |
| Plugin | `<plugin>/skills/<name>/SKILL.md` | Where the plugin is enabled, namespaced |

Project skills are also found in parent directories up to the repository root. On a name clash between enterprise, personal, and project, enterprise wins over personal and personal wins over project. Plugin skills never clash because they are namespaced. Do not name a skill folder `synced`; that name is reserved.

### Frontmatter fields

All fields are optional; `description` is strongly recommended.

| Field | Purpose |
| :- | :- |
| `name` | Command name. Defaults to the directory name |
| `description` | What the skill does and when to use it. Used for automatic matching. If omitted, the first non-empty body line is used |
| `when_to_use` | Extra trigger context (phrases, example requests), appended to the description |
| `argument-hint` | Autocomplete hint, for example `[issue-number]` |
| `arguments` | Named positional arguments for `$name` substitution |
| `disable-model-invocation` | `true`: only you can invoke it |
| `user-invocable` | `false`: only Claude can invoke it; hidden from the `/` menu |
| `allowed-tools` | Tools pre-approved for the invoking turn |
| `disallowed-tools` | Tools removed while the skill is active |
| `model` | Model for the rest of the current turn, or `inherit` |
| `effort` | `low`, `medium`, `high`, `xhigh`, `max` |
| `context` | `fork` runs the skill in a fresh subagent (no conversation history) |
| `agent` | Subagent type to use with `context: fork` |
| `paths` | Glob patterns; Claude loads the skill automatically only for matching files |
| `hooks` | Hooks registered when the skill is invoked |

### Minimal skill

```markdown
---
name: release-notes
description: Drafts release notes from merged pull requests since the last tag. Use when the user asks for release notes, a changelog entry, or "what shipped".
---

1. Find the last tag with `git describe --tags --abbrev=0`.
2. List merged commits since that tag.
3. Group them under Features, Fixes, and Internal.
4. Write one line per change in plain language. Skip pure refactors.
```

### Manual-only skill with arguments

```markdown
---
name: fix-issue
description: Fix a GitHub issue by number
argument-hint: "[issue-number]"
disable-model-invocation: true
---

Fix GitHub issue $ARGUMENTS following our coding standards.

1. Read the issue.
2. Implement the fix with a test.
3. Run the relevant test suite.
```

### Arguments and substitutions

| Placeholder | Expands to |
| :- | :- |
| `$ARGUMENTS` | Everything after the command name |
| `$ARGUMENTS[N]` or `$N` | Argument by 0-based index |
| `$name` | Named argument declared in `arguments` |
| `${CLAUDE_SKILL_DIR}` | The folder containing `SKILL.md` (use it to reference bundled scripts) |
| `${CLAUDE_PROJECT_DIR}` | The project root |
| `${CLAUDE_SESSION_ID}` | The current session ID |

If the skill body contains no placeholder and arguments are passed, Claude Code appends them as `ARGUMENTS: <value>`.

### Supporting files and scripts

```text
my-skill/
├── SKILL.md          overview and navigation (required)
├── reference.md      detailed docs, loaded when needed
├── examples.md       worked examples, loaded when needed
└── scripts/
    └── helper.py     executed, not loaded into context
```

Link every supporting file from `SKILL.md` and say what it contains and when to read it. Keep `SKILL.md` under about 500 lines. Scripts are cheaper than instructions for deterministic steps: Claude runs them and reads only the output.

### Dynamic context

A line starting with `` !`command` `` runs the command when the skill loads and inserts its output, for example the current `git diff --stat`. These commands follow your permission rules, and a failing command aborts the invocation. Use sparingly and only with commands that are safe to run automatically.

### Visibility controls

| Frontmatter | You can invoke | Claude can invoke | Description in context |
| :- | :- | :- | :- |
| (default) | Yes | Yes | Yes |
| `disable-model-invocation: true` | Yes | No | No |
| `user-invocable: false` | No | Yes | Yes |

To change visibility without editing the file, use `skillOverrides` in settings:

```json
{
  "skillOverrides": {
    "legacy-context": "name-only",
    "deploy": "off"
  }
}
```

Values: `"on"` (default), `"name-only"` (listed without description), `"user-invocable-only"` (hidden from Claude, still in the `/` menu), `"off"` (hidden everywhere). Plugin skills are not affected; manage them through `/plugin`.

## Commands

| Command | Effect |
| :- | :- |
| `/skill-name [args]` | Invoke a skill (or legacy command) |
| `/plugin-name:skill-name [args]` | Invoke a plugin skill |
| `/skills` | List skills and cycle their visibility state |
| `/context` | Show how much context the skill listing uses |
| `/skill-doctor` | Report per-skill context cost and usage, to find unused skills |
| `claude plugin validate .claude/skills` | Find `SKILL.md` files whose frontmatter does not parse |

## Limits and gotchas

- **Description cap**: `description` plus `when_to_use` is truncated at 1,536 characters in the listing. Put the key use case first.
- **Listing budget**: the whole listing is capped at about 1% of the model's context window (`skillListingBudgetFraction`). When it overflows, descriptions of the least-used skills are dropped, and without a description Claude cannot match them.
- **Malformed YAML**: the skill still loads with empty metadata, so `/name` works but automatic matching does not. Run with `--debug` to see the parse error.
- **Every listed skill costs context on every turn**, used or not.
- **Nested skills** below the start directory do not load until Claude touches files there.
- **Cloud sessions** do not read `~/.claude/skills/`. Commit the skill to the repository if it must work there.
- **Skills are guidance, not enforcement**. A rule that must hold every time belongs in a hook.
- **`disable-model-invocation: true`** also prevents preloading the skill into subagents.

## Good practice

### Writing a description that triggers correctly

- Lead with the action and object: "Drafts release notes from merged PRs".
- Follow with trigger conditions in the user's own words: "Use when the user asks for release notes, a changelog entry, or what shipped."
- Name the inputs or file types involved ("`.sql` migrations", "Terraform plans").
- State exclusions when a neighbor skill exists: "Not for hotfix notes; use `hotfix-notes`."
- If it triggers too often, make it more specific or set `disable-model-invocation: true`. If it never triggers, add the keywords people actually type.

### When to turn a procedure into a skill

- You have pasted the same instructions, checklist, or multi-step procedure into chat more than twice.
- A section of CLAUDE.md has grown from a fact into a procedure.
- A task needs bundled scripts or long reference material that should not load every session.
- A side-effecting workflow (deploy, release, send a message) should run only on an explicit `/name`: add `disable-model-invocation: true`.

Keep facts that apply to every task in CLAUDE.md. Keep procedures in skills. Move hard rules to hooks.

## In this playbook

- `../project-structure-design.md § 19` for where skills sit in the overall AI configuration.
- `../project-structure-design.md § 16` (configuring the AI), especially § 16.1 on where each kind of knowledge belongs and § 16.3 on skills.

## Sources

- https://code.claude.com/docs/en/skills
- https://code.claude.com/docs/en/slash-commands
- https://code.claude.com/docs/en/sub-agents
