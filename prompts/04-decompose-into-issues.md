# 04 · Decompose a milestone into issues

Use when a milestone of an approved specification is ready to build (guide § 9.1, § 18).

```text
Decompose milestone {{MILESTONE}} of {{SPEC_PATH}} into GitHub issues. Do not write code.

1. Read the specification section, docs/architecture.md, docs/work/parallel-runbook.md.
2. Split the work into tasks of the size 1 task = 1 session = 1 worktree = 1 pull request.
   Acceptance criteria come from the specification, not invented.
3. Order the tasks into waves by what they own: wave 1 foundation (the one task that owns shared
   files: schema, config, lockfile), wave 2 backbone (contracts and API core, UI skeleton;
   contracts freeze after it), wave 3 features (each task owns its area).
4. Write the ownership zones: every shared file has exactly one owning task.
5. Show me the plan as a table (task, wave, area, owns, blocked by, size) and wait for approval.

After I approve:
6. Create one parent issue for the milestone with the line
   "Assignment: {{SPEC_PATH}} §{{MILESTONE}}" and no state label.
7. Create one sub-issue per task with the task form (.github/ISSUE_TEMPLATE/task.yml): assignment,
   acceptance criteria, area and layer, must not change, verification, size, who merges.
   Label shaped tasks state:ready and tasks that wait on my answer state:inbox with the question
   in the body. Add "blocked by" links for dependencies.
8. Report the issue numbers per wave.
```
