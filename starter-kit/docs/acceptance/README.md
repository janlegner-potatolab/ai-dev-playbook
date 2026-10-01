# Acceptance files

One file per task issue: `docs/acceptance/<issue-number>.md`. It states what must be true for
the task to be done, and for every statement the command that decides it. The file is written
and merged through its own pull request **before** work on the task starts; the acceptance
runner then decides "done", not the agent.

## Format

```markdown
# Order confirmation

Item: #42

- [ ] Confirming a submitted order sets its state to confirmed
      `npm test -- server/src/orders/orderActions.test.ts`
- [ ] Confirming an already confirmed order is rejected with 409
      `npm test -- -t "rejects double confirm"`
- [ ] No new structure violations
      `npm run check:structure`
```

- The `Item:` line names the issue; it must match the file name.
- Every entry is a checklist line followed by an indented line holding exactly one command in
  backticks. The box state is ignored; every entry runs.
- A line that looks like a checklist item but does not parse, an entry without a command, or a
  file without entries rejects the **whole file** (fail closed). Nothing runs.

## Rules

- **Criteria come from the binding document** (the specification or ADR named on the issue's
  `Assignment:` line), not invented for the task.
- **Each command proves one statement** and fails when the statement is false. Prefer a test that
  is red today and turns green with the work.
- **The file is merged before the work.** The `acceptance` check fails a pull request that adds
  or changes the acceptance file of the issue it closes.
- **Changing criteria later** is a separate pull request with a reason, reviewed like any other
  change to the contract.

## Running it

```bash
npm run acceptance -- docs/acceptance/42.md   # locally
npm run acceptance:ci                          # in CI, for the issues a PR closes
```

Exit codes: `0` all passed, `1` at least one failed, `2` a file is invalid (nothing ran).
