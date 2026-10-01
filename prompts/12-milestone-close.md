# 12 · Milestone close

Use when every issue of a milestone is closed or parked. The milestone is reconciled against the
signed text, not against the list of merged pull requests (guide § 20).

```text
Close milestone {{MILESTONE}} of {{SPEC_PATH}}. Do not change code.

1. Read the governing ADR's acceptance criteria and the milestone section of the specification.
2. Fill docs/work/milestone-close.md (copy it to docs/work/milestone-close-{{MILESTONE}}.md): one
   row per criterion with outcome (met / not met / deferred) and evidence: a merged pull request
   whose `acceptance` check was green, a durable committed output, or a recorded reason with a
   new issue.
3. List every issue of the milestone with its final state and a note for anything parked or not
   started.
4. Copy the decisions taken during the milestone, verbatim, with dates.
5. Check the specification's definition of done item by item.
6. Update the specification status line, open a pull request with the close record, and ask me
   for acceptance. Record my answer verbatim.
```
