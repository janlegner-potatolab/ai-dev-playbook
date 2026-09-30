# Plugins and Marketplaces

A plugin is a directory of skills, agents, hooks, MCP servers, and other components that Claude Code installs and loads as one unit. A marketplace is a catalog, usually a git repository with a `.claude-plugin/marketplace.json` file, that lists plugins and where to fetch each one. Use plugins to share one tested setup across many projects and people, with versioned updates.

## At a glance

| Aspect | Summary |
| :- | :- |
| Plugin manifest | `.claude-plugin/plugin.json` (optional; `name` is the only required key) |
| Components | Skills, commands, agents, hooks, MCP servers, LSP servers, output styles, themes, monitors, workflows, executables (`bin/`), default settings |
| Marketplace file | `.claude-plugin/marketplace.json` with `name`, `owner`, `plugins` |
| Install id | `<plugin-name>@<marketplace-name>` |
| Install scopes | `user` (default), `project` (committed settings), `local` |
| Team setup | `extraKnownMarketplaces` plus `enabledPlugins` in settings |
| Private access | Whatever git credentials the user's machine already has |
| Trust | A plugin runs code with your user privileges. Review before installing |

## How it works

### Plugin vs standalone components

Skills, subagents, hooks, and MCP servers all work without a plugin. Package them as a plugin when you want several of them to travel together, install in many projects with one command, or ship versioned updates to a team.

### What an enabled plugin adds

An enabled plugin is part of every session, not only the ones where you use it:

- **Context**: the name and description of each model-invocable skill, agent, and command sit in context every turn.
- **Processes**: its MCP servers run alongside the session and its hooks fire on their events.
- **Permissions**: everything it runs, it runs as you.

### Namespacing

Plugin components are namespaced by the plugin name: skills run as `/my-plugin:skill-name`, agents appear as `my-plugin:agent-name`. This prevents clashes with project and personal components.

### Loading layers

A plugin is usable only when it is present at three layers: **settings** (marketplace added, plugin enabled), **disk** (fetched into `~/.claude/plugins/`), and **session** (loaded at startup or after `/reload-plugins`).

### Marketplaces

A marketplace is a catalog, not a hosted store. You add it once, then install plugins from it by name. Claude Code adds Anthropic's official marketplace (`claude-plugins-official`) on the first interactive session. Every marketplace not published from Anthropic's repositories is third-party, including your own team's.

### Versioning and updates

- Users get a new copy only when the plugin's computed version changes.
- **With `version`** (in `plugin.json`, or in the marketplace entry): users stay on their cached copy until you change the string. Pushing commits without bumping it delivers nothing.
- **Without `version`** (omitted in both places): updates follow the source's commits.
- Avoid setting `version` in both `plugin.json` and the marketplace entry: `plugin.json` takes precedence without a warning at load time. Run `claude plugin validate` to find such conflicts.
- Plugins loaded from a marketplace added as a local directory load the current files at every session start, whatever the version says.
- Background auto-update is off by default. A user enables it per marketplace in `/plugin`, or an admin sets `"autoUpdate": true` on the `extraKnownMarketplaces` entry. Otherwise users run an update command.

## Configuration and examples

### Plugin directory structure

Everything except the manifest lives at the plugin root, not inside `.claude-plugin/`.

```text
my-plugin/
├── .claude-plugin/
│   └── plugin.json       manifest (optional but recommended)
├── skills/               one <name>/SKILL.md per skill
├── commands/             flat Markdown commands (prefer skills/)
├── agents/               subagent Markdown files
├── hooks/
│   └── hooks.json        hook configuration
├── .mcp.json             MCP server definitions
├── .lsp.json             LSP server configurations
├── output-styles/        output style Markdown files
├── bin/                  executables added to PATH while enabled
└── settings.json         default "agent" and "subagentStatusLine"
```

### Manifest (`plugin.json`)

| Field | Purpose |
| :- | :- |
| `name` | Required. Kebab-case identifier; every component is namespaced under it |
| `displayName` | Name shown in the UI |
| `version` | Pins what users receive (see Versioning) |
| `description` | Short explanation |
| `author` | Object with `name` (required), optional `email`, `url` |
| `homepage`, `repository`, `license`, `keywords` | Metadata |
| `userConfig` | Values Claude Code prompts the user for when the plugin is enabled |
| `skills`, `commands`, `agents`, `hooks`, `mcpServers`, `lspServers`, `outputStyles` | Custom component paths (check the current docs for which keys replace and which add to the default folder) |

Agents shipped in a plugin ignore `permissionMode`, `mcpServers`, and `hooks` in their frontmatter.

### User configuration and sensitive values

```json
{
  "name": "deploy-helper",
  "userConfig": {
    "api_endpoint": {
      "type": "string",
      "title": "API endpoint",
      "description": "Your team's API endpoint"
    },
    "api_token": {
      "type": "string",
      "title": "API token",
      "description": "API authentication token",
      "sensitive": true
    }
  }
}
```

- `type` is one of `string`, `number`, `boolean`, `directory`, `file`. `title` and `description` are required. Optional: `required`, `default`, `options`, `multiple`, `sensitive`, `min`, `max`. Unknown keys fail validation.
- Non-sensitive values are saved under `pluginConfigs` in the user's settings. Sensitive values are masked on input and stored in the platform's secure credential store, not in `settings.json`.
- Reference values as `${user_config.KEY}` in MCP and LSP server config, exec-form hook args, and skill and agent content. Sensitive values are not substituted into skill or agent content.
- Never hard-code tokens in `.mcp.json`, hooks, or skills. Declare them as sensitive `userConfig`.

### Marketplace file

`marketplace.json` requires `name`, `owner`, and `plugins`. Each plugin entry needs `name` and `source`. Relative sources are written from the marketplace root (the directory containing `.claude-plugin/`) and must not contain `..`.

| Source | Example `source` value |
| :- | :- |
| Relative path | `"./plugins/my-plugin"` |
| GitHub repository | `{ "source": "github", "repo": "your-org/my-plugin" }` |
| Subdirectory of another repo | `{ "source": "git-subdir", "url": "your-org/monorepo", "path": "tools/my-plugin" }` |

Other source types exist (a git URL on any host, a zip download over HTTPS, an npm package, a command); check the current docs for their fields and for pinning to a `ref` or `sha`. Keep the entry `name` identical to the `name` in the plugin's `plugin.json`.

### Minimal complete example

```text
team-marketplace/
├── .claude-plugin/
│   └── marketplace.json
└── plugins/
    └── review-kit/
        ├── .claude-plugin/
        │   └── plugin.json
        └── skills/
            └── pr-checklist/
                └── SKILL.md
```

`team-marketplace/.claude-plugin/marketplace.json`:

```json
{
  "name": "team-marketplace",
  "description": "Shared Claude Code plugins for our team",
  "owner": {
    "name": "Platform Team"
  },
  "plugins": [
    {
      "name": "review-kit",
      "source": "./plugins/review-kit",
      "description": "Pull request review checklist"
    }
  ]
}
```

`plugins/review-kit/.claude-plugin/plugin.json`:

```json
{
  "name": "review-kit",
  "version": "1.0.0",
  "description": "Pull request review checklist",
  "author": {
    "name": "Platform Team"
  }
}
```

`plugins/review-kit/skills/pr-checklist/SKILL.md`:

```markdown
---
name: pr-checklist
description: Runs the team pull request checklist on the current branch. Use before opening or approving a pull request.
---

1. Confirm tests, typecheck, and lint pass.
2. Check that no secrets or `.env` files are staged.
3. Confirm the description states what changed and how it was verified.
4. Report each item as pass or fail with one line of evidence.
```

Validate, add, and install:

```bash
claude plugin validate ./team-marketplace
claude plugin marketplace add ./team-marketplace
claude plugin install review-kit@team-marketplace
```

In a session the skill runs as `/review-kit:pr-checklist`. After pushing the directory to a git host, teammates run `claude plugin marketplace add <owner>/<repo>`.

### Team setup via settings

Commit this to the repository's `.claude/settings.json` (applies after each contributor trusts the folder), or deliver it through managed settings for a whole organization:

```json
{
  "extraKnownMarketplaces": {
    "team-marketplace": {
      "source": { "source": "github", "repo": "your-org/team-marketplace" },
      "autoUpdate": true
    }
  },
  "enabledPlugins": {
    "review-kit@team-marketplace": true
  }
}
```

Both keys are objects, not arrays. `extraKnownMarketplaces` is keyed by the marketplace's own `name`; `enabledPlugins` is keyed by `plugin@marketplace`. In managed settings, `false` blocks a plugin at every scope.

### Private marketplaces

Access equals repository permissions. Claude Code runs `git` on the user's machine with prompts turned off and uses the credentials already stored there (SSH keys, credential helpers such as the `gh` helper). It has no git token of its own, and `marketplace.json` has no field for one. A `GITHUB_TOKEN` variable alone does not authenticate background checks; it works through a credential helper.

## Commands

| In a session | Shell equivalent | Effect |
| :- | :- | :- |
| `/plugin` | none | Open the plugin manager (Discover, Installed, Marketplaces) |
| `/plugin marketplace add <owner/repo, url, or path>` | `claude plugin marketplace add <source>` | Register a marketplace |
| `/plugin install <plugin>@<marketplace>` | `claude plugin install <plugin>@<marketplace> [--scope user\|project\|local]` | Install a plugin |
| `/plugin marketplace update <name>` | `claude plugin marketplace update <name>` | Refresh a marketplace catalog |
| (via `/plugin`) | `claude plugin update <plugin>@<marketplace>` | Update one plugin |
| (via `/plugin`) | `claude plugin enable` / `disable` / `uninstall <plugin>` | Manage an installed plugin |
| none | `claude plugin marketplace list` / `remove <name>` | List or remove marketplaces |
| none | `claude plugin list` / `details <plugin>` | Show installed plugins and their component inventory |
| none | `claude plugin validate <dir>` | Check a plugin or marketplace |
| `/reload-plugins` | none | Load plugin changes into the running session |
| none | `claude --plugin-dir <dir>` | Load a plugin from a folder for one session (development) |

## Limits and gotchas

- **Entry name vs manifest name**: if they differ, installs by the manifest name fail with "not found in marketplace". Keep them the same.
- **Relative paths**: a path with `..` fails validation; a path to a missing directory passes validation and fails at install.
- **Remote sources** are only fetched at install, so a wrong `repo` or `path` shows up then, not in `validate`.
- **Forgotten version bump**: with `version` set, new commits reach nobody until the string changes.
- **Cloud sessions** do not load plugins from your local settings.
- **Reserved names**: official Anthropic marketplace names are refused for marketplaces not sourced from Anthropic's repositories.
- **Context cost**: every enabled plugin adds its listings to every turn. Disable plugins you do not use.

## Good practice

### Vetting third-party plugins

1. Run `claude plugin marketplace list` to see where each marketplace comes from.
2. In `/plugin`, open the plugin and read the **Will install** section (commands, agents, skills, hooks, MCP and LSP servers).
3. Read the source itself: `hooks/hooks.json` (what each hook runs), `.mcp.json` (each server's command or URL), and every file in `bin/`.
4. Clone it and run `claude --plugin-dir <dir> plugin details <name>` to list components without starting a session.
5. Prefer pinned versions from sources you trust. Remove a plugin as soon as you stop trusting it.

### Authoring

- One plugin, one purpose. Split unrelated tools into separate plugins so people enable only what they need.
- Run `claude plugin validate` after every edit and install from your own marketplace before sharing.
- Decide on a versioning policy up front: bump `version` on every release, or omit it and let commits flow.
- Keep secrets out of the repository; use sensitive `userConfig`.

## In this playbook

- `../project-structure-design.md § 19` for how plugins package the AI configuration for reuse.
- `../project-structure-design.md § 16` (configuring the AI), including § 16.6 on environment isolation and § 16.8 on costs.

## Sources

- https://code.claude.com/docs/en/plugins
- https://code.claude.com/docs/en/plugin-marketplaces
- https://code.claude.com/docs/en/plugins-reference
- https://code.claude.com/docs/en/plugins/create-marketplace
- https://code.claude.com/docs/en/plugins/host-marketplace
- https://code.claude.com/docs/en/plugins/manifest-reference
- https://code.claude.com/docs/en/plugins/org
- https://code.claude.com/docs/en/plugins/security
- https://code.claude.com/docs/en/plugins/cli-reference
