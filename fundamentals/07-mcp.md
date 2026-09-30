# MCP Servers in Claude Code

The Model Context Protocol (MCP) is an open standard that lets Claude Code call tools, read resources and run prompts exposed by external servers: issue trackers, databases, browsers, SaaS APIs. This file covers how servers are connected, where their configuration lives, how their tools are named and permissioned, and when an MCP server is the wrong choice.

## At a glance

| Topic | Summary |
| --- | --- |
| What it is | A server process or endpoint that exposes tools, resources and prompts to Claude |
| Transports | `http` (recommended for remote), `stdio` (local process), `sse` (deprecated), `ws` (WebSocket, JSON config only) |
| Scopes | local (default), project (`.mcp.json`), user, plugin-provided, claude.ai connectors |
| Precedence | local > project > user > plugin > claude.ai connectors; whole entry wins, no field merging |
| Tool name | `mcp__<server>__<tool>`; plugin servers: `mcp__plugin_<plugin>_<server>__<tool>` |
| Main commands | `claude mcp add / add-json / list / get / remove`, `/mcp` inside a session |
| Context cost | Tool search is on by default: only tool names and server instructions load up front |
| Biggest risk | Servers that fetch external content can carry prompt injection into the session |

## How it works

1. You register a server (CLI or JSON). Claude Code stores the entry in the file that belongs to the chosen scope.
2. At session start Claude Code connects to every enabled server. Project-scoped servers from `.mcp.json` need your approval first in interactive sessions.
3. With tool search (the default), only tool names and server instructions enter the context. Full tool definitions load when Claude searches for and uses a tool. This keeps many servers cheap in context.
4. Claude calls a tool by its full name, for example `mcp__github__create_issue`. The normal permission system decides whether the call runs, prompts, or is denied.
5. Remote servers that need sign-in are flagged in `/mcp`, where you complete an OAuth flow.

### Transports

| Transport | Use when | Notes |
| --- | --- | --- |
| `http` | Remote/cloud service | Recommended. JSON configs also accept `streamable-http` as an alias. Supports OAuth |
| `stdio` | Local process (`npx`, `uvx`, a binary) | Runs on your machine with your user's rights |
| `sse` | Legacy remote servers that only expose SSE | Deprecated; prefer `http` where available |
| `ws` | Remote server that pushes events | Configured via JSON `"type": "ws"`; `--transport` does not accept it; header-only auth |

### Scopes and where they are stored

| Scope | Stored in | Visible in | Shared via git |
| --- | --- | --- | --- |
| Local (default) | `~/.claude.json`, under the current project's path | This project only | No |
| Project | `.mcp.json` at the project root | This project, for everyone | Yes |
| User | `~/.claude.json`, top level | All your projects | No |
| Plugin | The plugin's MCP config | While the plugin is enabled | Via the plugin |
| claude.ai connectors | Your claude.ai account | Sessions logged in with that account | No |

Note: MCP "local scope" lives in `~/.claude.json`, not in `.claude/settings.local.json`. The word "local" means something different for general settings.

### Precedence

When the same server is defined in several places, Claude Code connects once, using the highest-precedence definition:

1. Local
2. Project
3. User
4. Plugin-provided
5. claude.ai connectors

The entire entry from the winning source is used; fields are never merged. Local, project and user duplicates are matched by name; plugins and connectors are matched by endpoint (URL or command). A server your organization provides through managed settings ranks above all of these.

## Configuration and examples

### Add servers from the CLI

```bash
# Remote HTTP server (local scope by default)
claude mcp add --transport http notion https://mcp.notion.com/mcp

# Remote server with a static header
claude mcp add --transport http secure-api https://api.example.com/mcp \
  --header "Authorization: Bearer ${API_TOKEN}"

# Local stdio server; everything after -- is the server command
claude mcp add --transport stdio --env AIRTABLE_API_KEY=YOUR_KEY airtable \
  -- npx -y airtable-mcp-server

# Share with the team (writes .mcp.json)
claude mcp add --transport http shared-server --scope project https://example.com/mcp

# Available in all your projects
claude mcp add --transport http tracker --scope user https://mcp.example.com/mcp
```

Rules for `claude mcp add`:
- `--scope` (`-s`) takes `local`, `project` or `user`.
- `--transport` and `--header` have short forms `-t` and `-H`.
- For stdio, `--` separates Claude Code options from the server command.
- Put another option between `--env KEY=value` and the server name, otherwise the name is parsed as another pair.

### `.mcp.json` format (project scope)

```json
{
  "mcpServers": {
    "shared-server": {
      "type": "http",
      "url": "${API_BASE_URL:-https://api.example.com}/mcp",
      "headers": { "Authorization": "Bearer ${TEAM_API_KEY}" }
    },
    "local-tool": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "some-mcp-server"],
      "env": { "TOOL_TOKEN": "${TOOL_TOKEN}" }
    }
  }
}
```

### Environment variable expansion

- Syntax: `${VAR}` and `${VAR:-default}`.
- Expanded in: `command`, `args`, `env`, `url`, `headers`.
- An unset variable with no default loads with the literal `${VAR}` text and a warning in `claude mcp list` and `/mcp`.
- Credential variables read as empty in a remote server's `url` and `headers`: Claude Code's own credentials (such as `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`), cloud provider credentials (such as `AWS_BEARER_TOKEN_BEDROCK`) and others such as `HTTPS_PROXY` and `NPM_TOKEN`. A `:-default` on them is ignored. To pass such a value deliberately, copy it into a variable with your own name.

### Permissions for MCP tools

| Rule | Matches |
| --- | --- |
| `mcp__github` | Every tool from the `github` server |
| `mcp__github__*` | Every tool from the `github` server (wildcard form) |
| `mcp__github__get_*` | Only `get_` tools from that server |
| `mcp__github__create_issue` | One tool |
| `mcp__*` (deny/ask only) | Every MCP tool from every server |

- Allow rules accept globs only after a literal `mcp__<server>__` prefix; an unanchored allow such as `mcp__*` is skipped with a warning.
- Settings-file `mcp__` rules with parentheses (parameter matching) are skipped; use `--disallowedTools` for that.
- Use the same full names in a skill's `allowed-tools`, a subagent's `tools` field and hook matchers. For plugin servers use the `mcp__plugin_...` form; a matcher on the bare server key never fires.
- A server author can mark a tool with `_meta["anthropic/requiresUserInteraction"]: true`; it then prompts on every call, even under allow rules and permissive modes.

### Authentication

- Remote servers answering `401` or `403` are flagged in `/mcp`; select the server there to run the OAuth flow. `claude mcp login <name>` does the same from the command line.
- OAuth tokens are refreshed automatically; if a refresh is rejected, re-authenticate from `/mcp`.
- If you configured an `Authorization` header yourself, a `401` is reported as a failed connection, not as an OAuth prompt.
- Headless runs (`claude -p`, Agent SDK) cannot run OAuth. Sign in interactively first.
- For dynamic tokens, `headersHelper` runs a script that returns headers at connect time; it requires a trusted workspace.
- Removing a remote server also deletes its stored OAuth tokens.

## Commands

| Command | Purpose |
| --- | --- |
| `claude mcp add [options] <name> <url or -- command>` | Register a server |
| `claude mcp add-json <name> '<json>'` | Register from a JSON entry |
| `claude mcp list` | List servers, status and configuration warnings |
| `claude mcp get <name>` | Show one server's details |
| `claude mcp remove <name> [--scope <scope>]` | Remove a server |
| `claude mcp reset-project-choices` | Reset your `.mcp.json` approval choices |
| `/mcp` (in a session) | Status, enable/disable toggle, OAuth sign-in, re-authenticate |
| `/mcp__<server>__<prompt>` | Run a prompt the server exposes as a command |

## Limits and gotchas

- Tool output: a warning above 10,000 tokens, a default cap of 25,000 tokens. Raise the cap with `MAX_MCP_OUTPUT_TOKENS`.
- Startup timeout: `MCP_TIMEOUT` (milliseconds). Per-call timeout: the server's `timeout` field or `MCP_TOOL_TIMEOUT`.
- Tool descriptions and server instructions are truncated at 2,048 characters by default; put critical details first.
- Tool search can be disabled or put into threshold mode with `ENABLE_TOOL_SEARCH` (`true`, `false`, `auto`, `auto:N`). It turns off automatically when `ANTHROPIC_BASE_URL` points at a non-first-party host.
- `claude -p`, Agent SDK and cloud sessions load project `.mcp.json` servers without asking. To keep one out, use `disabledMcpjsonServers`, `--strict-mcp-config` with `--mcp-config`, or exclude project settings.
- A freshly cloned repository cannot approve its own servers: committed `enableAllProjectMcpServers` or `enabledMcpjsonServers` is ignored until you trust the workspace.
- The same server name in two scopes with different endpoints triggers a conflict warning; OAuth sign-ins are stored per endpoint.
- Toggling a server off in `/mcp` keeps its configuration; the choice is stored per project in `~/.claude.json` (`disabledMcpServers`).

## Good practice

### Security

- **Trust before connecting.** Treat every server like a dependency you install: know who publishes it and what it can reach. A stdio server runs with your user's permissions.
- **Assume prompt injection.** Any server that fetches web pages, emails, tickets or documents can return text written by an attacker. Treat tool output as data, never as instructions. Keep write-capable tools behind prompts when a session also reads untrusted content.
- **Least privilege.** Use read-only tokens where possible, narrow OAuth scopes, allow only the specific tools you need (`mcp__server__get_*` rather than the whole server), deny destructive tools explicitly.
- **Secrets stay out of git.** In `.mcp.json` reference secrets as `${VAR}`; never hard-code tokens. Put personal credentials in local or user scope.
- **Review `.mcp.json` changes in pull requests** like code: a new server is new executable surface for everyone who pulls.
- **Pin versions** for stdio servers where the package manager allows it, instead of always pulling `@latest`.

### MCP server vs CLI vs skill

| Choose | When |
| --- | --- |
| A CLI (`gh`, `aws`, `gcloud`, `psql`) | A mature CLI exists. It is the most context-efficient option because it adds no per-tool listing, and Claude already knows common CLIs |
| An MCP server | No good CLI exists; the service needs OAuth or per-user auth; you want typed tools, resources or prompts; the capability must work the same across CLI, IDE, desktop and CI; you want per-tool permission rules |
| A skill | The need is know-how, a procedure or conventions rather than a new capability; a skill can also teach Claude how to use a CLI well |
| Neither | A one-off task: just let Claude run the command |

Other habits:
- Disable servers you are not using in this project (`/mcp`), and check their weight with `/context`.
- Prefer project scope only for servers every contributor needs; keep experiments in local scope.
- In CI, run with `--strict-mcp-config --mcp-config <file>` so only the servers you list load.

## In this playbook

- Tooling layout and where MCP config belongs: `../project-structure-design.md` § 19.
- Cost impact of tools in context: `../project-structure-design.md` § 16.8.
- How to instruct agents that use external tools safely: `../project-structure-design.md` § 18.6.

## Sources

- https://code.claude.com/docs/en/mcp
- https://code.claude.com/docs/en/permissions
- https://code.claude.com/docs/en/costs
- https://code.claude.com/docs/en/best-practices
