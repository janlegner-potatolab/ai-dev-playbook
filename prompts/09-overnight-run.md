# 09 · Overnight run pre-flight

Use before leaving work to run without a human (guide § 8.5). Do not start the run until every
point holds.

```text
Prepare an unattended run over issues {{ISSUE_LIST}}. Do not start it yet.

Check and report each point:
1. Plan graph: each issue has "done when", "blocked by" and "runs in parallel with".
2. Every external dependency that would wait for a human has a mock with a frozen contract. Name
   each mock. A mocked deployment is not permission to deploy for real.
3. Premise and risk checks ran first and I approved their results.
4. On an undecided question the run parks that issue with a written reason (state:parked) and
   takes the next one; it never invents a default and never stops the whole chain.
5. State survives the session: in the issues and the repo, not in temporary files.
6. The runner answers: prove it with one small end-to-end item before I leave.
7. At the end: reconcile every planned issue as merged, parked with reason, or not started with
   reason.

Stop and escalate on: security finding, production deployment, destructive operation, budget
exceeded. Budget: {{HOURS}} hours, at most {{N}} issues.
```
