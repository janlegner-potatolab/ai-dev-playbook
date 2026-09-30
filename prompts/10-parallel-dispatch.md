# 10 · Parallel dispatch

Use when several sessions work on one milestone at once (guide § 9). The human assigns the issue
number; sessions never pick work themselves.

One line per terminal window:

```text
Read docs/work/parallel-runbook.md (Rules section) and follow it for the whole session. Work issue #{{N}}.
```

Before opening the next wave, check:

- every issue of the previous wave is merged or parked with a reason;
- contracts are frozen after the backbone wave; a feature task that needs a contract or schema
  change stops and escalates to the owning task;
- no two open issues own the same file.
