# 05 · Work an issue

The standard prompt that starts a session on one task. The issue carries the details; the prompt
only points.

```text
Work issue #{{N}}.

Before any edit, in this order: size the task; read the parent issue (purpose, rules, who
merges); read the binding document and section named on
its "Assignment:" line; read the whole issue; read its "Where it stands" section and the comments
people wrote since; check the branch, worktree and open pull requests. Build on that state, never
start over.

Write a read-back paragraph. Its first line is the acceptance criterion this task must move; then
the binding file and section, who merges, where it stands, the next step. Then continue without
waiting, unless two sources contradict: then ask.

Rules: follow CLAUDE.md. Assign yourself and move the issue to state:doing. Work in your own
worktree and branch. Test first (RED, GREEN, two refactor passes). Scope rule: what moves the
criterion, do; a real defect outside it becomes a new state:ready sub-issue; anything else, drop.
When a guard fails, fix the code, never the guard. Decisions come to me as choices with a
recommendation.

Done means: checks green, review and QA by a fresh agent (role `.claude/agents/qa.md`), pull request with
"Closes #{{N}}", "Where it stands" rewritten. Report in at most 12 lines, first line: which
criterion moved.
```

Short form, once the project runs this way every day:

```text
Work issue #{{N}}. Follow CLAUDE.md, task protocol.
```
