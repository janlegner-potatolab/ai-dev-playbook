# Prompt library

Ready-to-copy prompts for each step of the flow in § 18 of the guide. Replace every
`{{PLACEHOLDER}}`. The prompts point to documents in the repository instead of pasting rules;
they assume the project was set up from the starter kit (`CLAUDE.md`, `docs/`, roles in
`.claude/agents/`).

| File | Use it when |
| --- | --- |
| [`01-discovery.md`](01-discovery.md) | an idea or a large new capability needs a premise check |
| [`02-specification.md`](02-specification.md) | discovery said "go" and the specification must be written |
| [`03-spec-review.md`](03-spec-review.md) | a specification needs an independent review before approval |
| [`04-decompose-into-issues.md`](04-decompose-into-issues.md) | an approved milestone must become GitHub issues |
| [`05-work-an-issue.md`](05-work-an-issue.md) | a session starts on one issue |
| [`06-review-and-qa.md`](06-review-and-qa.md) | a change needs review and QA by a fresh agent |
| [`07-bug-report.md`](07-bug-report.md) | a defect was found and must become a ready issue |
| [`08-session-end.md`](08-session-end.md) | a session must close cleanly |
| [`09-overnight-run.md`](09-overnight-run.md) | work will run without a human watching |
| [`10-parallel-dispatch.md`](10-parallel-dispatch.md) | several sessions run in parallel |
| [`11-acceptance-criteria.md`](11-acceptance-criteria.md) | a task needs its acceptance file before it becomes ready |
| [`12-milestone-close.md`](12-milestone-close.md) | every issue of a milestone is closed or parked |

Rules that apply to every prompt (guide § 18.6): point to documents, name the acceptance
criterion, ask for a read-back, state limits and verification, decisions come back as questions.
