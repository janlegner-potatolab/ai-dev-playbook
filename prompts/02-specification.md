# 02 · Specification

Use after a recorded "go". The output is a document someone builds from (guide § 5.1).

```text
Write the specification for {{FEATURE_OR_PRODUCT}} in {{SPEC_PATH}} (e.g. docs/spec.md), using the template
docs/spec-template.md and the rules in guide § 5.1.

Inputs: docs/discovery/discovery.md (chosen option and risks), wireframes in {{WIREFRAMES_PATH}},
docs/domain.md and docs/glossary.json (use glossary terms only; add a missing term first).

Requirements:
- Header: the governing document line (the ADR and its acceptance criteria section this spec
  restates) and the status line, starting at "specified".
- Seven sections in order: problem, goal, how to build, scope, out of scope, milestones,
  definition of done. Around 200 lines, bullets, one idea per line, plain language.
- M0 first: the milestone that proves or kills the hardest assumption.
- Every milestone's first criterion: its acceptance suite runs, is red, and is approved before
  building. Map every criterion of the ADR to the milestone that closes it.
- Every milestone: one-sentence goal, acceptance criteria as a checklist (what must and must not
  happen), use cases (what a person came to do), including error and empty states.
- Mark every claim you did not verify. Where inputs disagree, say so and pick.
- Draw a wireframe for every changed screen state before writing its criteria.

Do not write code. Open a pull request with the document and list open questions for me as
choices with a recommendation.
```
