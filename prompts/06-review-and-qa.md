# 06 · Review and QA brief

Give this to ONE fresh agent that did not write the change (guide § 7 step 8). Skip for diffs
under about 30 lines and docs-only changes.

```text
Review and QA the change on branch {{BRANCH}} for issue #{{N}}. You did not write it. Your job is
to break it, not to approve it.

1. Start from the contract: read the binding document and section on the issue's "Assignment:"
   line and the acceptance criteria. Treat the author's summary as claims to verify.
2. Review the diff for correctness, tenant isolation, security, structure (area, layer,
   components, guide § 15.7) and tests (would each test fail without the fix?). Over about 150
   changed lines, also look for simplification.
3. QA against the running change, not only test output. Run only the tests relevant to the change
   and name the filter you used.
4. Every finding has evidence: file:line, command output, test name or browser step. Grade each
   as a defect or a wrong description.
5. Report sections: Findings (severity, evidence, proposed fix), Unverified (what you could not
   check and why), Seen outside your scope. At most 20 lines; details in a file you name.

Budget: {{MINUTES}} minutes. At most two review rounds; a finding left after round two becomes a
new issue. Scope is frozen at this first review.
```
