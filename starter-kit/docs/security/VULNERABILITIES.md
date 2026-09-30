# Security register: {{PROJECT_NAME}}

Living record of what is security-open in this repo. Id prefix: `APP-`. Rules: the security
standard, section "Security register". Whoever ships a finding or a fix updates this file in
the same change.

Rules in short:

- Four sections, in this order, nothing more. An empty section keeps its heading and `*(none)*`.
- Severity: Critical, High, Medium, Low / Info.
- The cells "Where" and "Attack path" hold only: the real thing (who, from where, gains what),
  `HARDENING: none constructible`, or `UNKNOWN: needs verification` plus what decides it.
- Ids are permanent: never renumber, never reuse, no temporary prefixes. A partial fix splits the
  finding: the closed part keeps the id, the rest gets the next free id.
- Accepting a risk requires an observable revisit trigger (an event or a date).
- Merge is not the effect: close on what actually changed (deploy, infrastructure apply, a
  measured console setting: what, who, when).
- A finding fixed in another repo or in a console stays in Open, marked `[owned by ...]`.

## Open

| Id  | Sev | What | Where (file:line) | Found | Attack path |
| --- | --- | ---- | ----------------- | ----- | ----------- |

_(none)_

## Accepted

| Id  | Sev | What | Why accepted | Who / when | Revisit when |
| --- | --- | ---- | ------------ | ---------- | ------------ |

_(none)_

## Closed

| Id  | Sev | What | Closed by | When |
| --- | --- | ---- | --------- | ---- |

_(none)_

## Disproved

| Hypothesis | Why it does not hold | Verified by / when |
| ---------- | -------------------- | ------------------ |

_(none)_
