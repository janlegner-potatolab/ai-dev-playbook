# 11 · Acceptance criteria for a task

Use before a task issue becomes `state:ready`. The criteria are written and merged first; the
acceptance runner later decides "done" from them (guide § 20).

```text
Write the acceptance file for issue #{{N}}. Do not implement anything.

1. Read the issue, its "Assignment:" line and that section of the binding document (the
   specification or ADR). Copy the criteria this task moves; do not invent new ones.
2. Create docs/acceptance/{{N}}.md in the format of docs/acceptance/README.md: a title, the line
   "Item: #{{N}}", then one checklist entry per criterion, each followed by an indented line with
   exactly one command in backticks that decides it.
3. Every command must fail while the criterion is false. Prefer a focused test (it may not exist
   yet: name the test file and test name the work will add, and say so in the pull request) or a
   check script. Avoid commands that pass on an empty repository.
4. Run `npm run acceptance -- docs/acceptance/{{N}}.md` and confirm it parses and is red now.
   Paste the output.
5. Open a pull request with only this file, titled "test(acceptance): criteria for #{{N}}".
   After review and merge, the issue may move to state:ready.
```
