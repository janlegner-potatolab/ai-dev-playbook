# Domain model

Terms and code names: `docs/glossary.json` is the single source. Add a term there before using it.

## Entities

| Entity     | Purpose | Key fields | Owning area |
| ---------- | ------- | ---------- | ----------- |
| {{Entity}} |         |            | {{area}}    |

## Relationships

| From        | To          | Cardinality | Rule |
| ----------- | ----------- | ----------- | ---- |
| {{EntityA}} | {{EntityB}} | 1:N         |      |

## States and transitions

| Entity     | From  | To       | Trigger | Who may trigger | Side effects |
| ---------- | ----- | -------- | ------- | --------------- | ------------ |
| {{Entity}} | draft | approved | approve | {{ROLE}}        |              |

States not listed here cannot be reached. A transition not listed here is forbidden.

## Invariants

| Invariant                         | Lives in             | Why there                          |
| --------------------------------- | -------------------- | ---------------------------------- |
| {{e.g. unique number per tenant}} | DB constraint        | structural, never changes          |
| {{e.g. discount limit}}           | `domain/{{file}}.ts` | business policy, changes over time |

Each invariant has exactly one home: DB constraint for structural rules, one code layer for changing policy. Never both.
