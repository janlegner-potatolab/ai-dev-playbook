# 03 · Specification review

Use before approving a specification. Run it in a fresh session or as a subagent that did not
write the document.

```text
Review docs/specs/{{NAME}}.md as an independent reviewer. Your job is to find what would make a
builder guess, not to approve.

Check:
1. Every acceptance criterion is testable and says what must and must not happen.
2. Error, empty, limit and concurrent cases are covered for each flow.
3. Terms match docs/glossary.json and docs/domain.md; no synonyms.
4. Milestones start with M0 and each has a definition of done.
5. Claims about limits, rates or external systems are marked as verified or not.
6. Nothing in scope contradicts "out of scope", the architecture or an ADR.
7. The document follows guide § 5.1 (sections, one idea per line, no outside references).

Report as a table: location (section, line), problem, proposed fix, severity. Add a section
"Unverified" for what you could not check. Do not edit the document.
```
