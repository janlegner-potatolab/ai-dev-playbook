# Architecture

One page. Decisions and their reasons live in `docs/adr/`.

## Layers

| Layer  | File                                    | Classic name  | May call                                |
| ------ | --------------------------------------- | ------------- | --------------------------------------- |
| Input  | `server/src/http/<area>Router.ts`       | controller    | actions, read models                    |
| Action | `server/src/<area>/<area>Actions.ts`    | service       | domain rules, SQL, other areas' actions |
| Read   | `server/src/<area>/<area>ReadModels.ts` | query service | SQL                                     |
| Rules  | `server/src/domain/*.ts`                | domain model  | nothing outside itself                  |
| Data   | `server/src/<area>/<area>Sql.ts`        | repository    | DB                                      |

Client: `modules/<area>/pages` -> `components/ui`; server calls only via `modules/<area>/api.ts`.

## Dependency direction

router -> actions -> domain rules and SQL. Domain rules never touch DB or network. An area never reads another area's tables.

## Server decides

{{What the server owns: prices, states, permissions, anything affecting stored data. The client only displays.}}

## Error handling

- API errors: RFC 9457 problem details, no stack traces to users.
- Business logic: typed results or domain errors, never swallowed.
- Background jobs: catch, log with context, continue where safe; critical failures alert via {{ALERT_CHANNEL}}.

## Logging

- Every caught error logged with operation and id. Never secrets or request bodies.
- Tool: {{LOGGER}}. Destination: {{LOG_DESTINATION}}.

## Permissions

- Roles: {{ROLES}}. Checked on the server in {{WHERE}}.

## Tenant isolation

- Tenant key: {{TENANT_KEY}}. Enforced in {{WHERE}} on every query.

## Integrations

| System     | Adapter                               | Timeout | Retry      | On failure   |
| ---------- | ------------------------------------- | ------- | ---------- | ------------ |
| {{SYSTEM}} | `server/src/integrations/{{file}}.ts` | {{ms}}  | {{policy}} | {{behavior}} |

## Environments

| Environment | Purpose                         | Data          | URL     |
| ----------- | ------------------------------- | ------------- | ------- |
| dev         | local and shared development    | synthetic     | {{URL}} |
| staging     | click-through before production | separate copy | {{URL}} |
| production  | users                           | real          | {{URL}} |
