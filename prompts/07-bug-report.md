# 07 · Bug report to ready issue

Use when a defect is found during work or reported by a user.

```text
Turn this defect into a ready GitHub issue: {{WHAT_HAPPENED}}.

1. Reproduce it or say exactly why you could not. Record the steps, expected and actual result,
   environment and data used.
2. Find the binding document or ADR the correct behaviour comes from and name it on the
   "Assignment:" line; if there is none, say so and ask me.
3. Fill the task form: acceptance criteria (what must be true after the fix, including a test
   that fails today), area and layer, must not change, verification, size.
4. File it as a sub-issue of {{PARENT_ISSUE}} with state:ready if it is shaped, state:inbox with
   the open question if not.

Do not fix it in this session unless it moves the criterion of the task you are working on.
```
