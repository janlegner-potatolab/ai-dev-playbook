# Spec: {{NAME}}

<!--
Writing rules:
1. No paragraphs; short lines, mostly bullets.
2. One idea per line.
3. Each idea carries its explanation (reason, consequence, example) on the same line.
4. Each idea gets its own bullet.
5. Nothing outside the document: no links to issues, PRs or documents the reader may not have.
6. Plain language for someone who never saw the code (no CSS, no function names).
Target around 200 lines. Mark unverified claims with (unverified). When sources conflict, say so and choose.
-->

## 1. Problem

- What is wrong today in the user's world (not in the code):

## 2. Goal

- What is true when this is done:

## 3. How to build

- Inputs this is built from:
- What in those inputs does NOT apply literally:

## 4. Scope

- M0 {{MILESTONE_NAME}} (proof of concept: validate the hardest assumption)
- M1 {{MILESTONE_NAME}}
- M2 {{MILESTONE_NAME}}

## 5. Out of scope

- {{ITEM}}: not built here; owned by {{OWNER}}

## 6. Milestones

### M0 {{MILESTONE_NAME}}

**Goal:** {{ONE_SENTENCE}} (the hardest assumption this milestone proves or kills)

**Acceptance criteria:**

- [ ] {{CRITERION}}

### M1 {{MILESTONE_NAME}}

**Goal:** {{ONE_SENTENCE}}

**Acceptance criteria** (what must and must not happen):

- [ ] {{CRITERION}}
- [ ] {{CRITERION_ON_FAILURE}}: when {{EXTERNAL_SYSTEM}} does not respond, {{EXPECTED}}
- [ ] {{ABSENCE}}: the screen does NOT show {{X}}

**Use cases** (what a person came to do):

- As {{ROLE}}, I {{ACTION}} so that {{OUTCOME}}.

**Wireframes:** every state (empty, filled, error, at limit), real texts, one drawing per flow.

## 7. Definition of done

- [ ] All milestone criteria checked
- [ ] Tests written first, at the level that proves each rule
- [ ] `FEATURES.md` and `CHANGELOG.md` updated
- [ ] Security register reviewed
- [ ] Human accepted
