# Spec: {{NAME}}

> Governing document: `docs/adr/{{NNNN}}-{{SLUG}}.md` § Acceptance criteria. This document
> restates those criteria test-shaped; where the two disagree, the governing document wins.
>
> Status: specified | suite red | building | done. Updated in the same change that moves it.

<!--
Writing rules:
1. No paragraphs; short lines, mostly bullets.
2. One idea per line.
3. Each idea carries its explanation (reason, consequence, example) on the same line.
4. Each idea gets its own bullet.
5. Nothing outside the document: no links to issues, PRs or documents the reader may not have.
6. Plain language for someone who never saw the code (no CSS, no function names).
Target around 200 lines. Mark unverified claims with (unverified). When sources conflict, say so and choose.
The governing-document line in the header is the one allowed reference outside this document.
Every milestone starts with its acceptance suite: written first, red, approved, then built.
-->

## 1. Problem Statement

- What is wrong today in the user's world (not in the code):

## 2. Goal

- What is true when this is done:

## 3. How to Build

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

- [ ] The acceptance suite for this milestone runs, is red, and is approved before building
- [ ] {{CRITERION}}

### M1 {{MILESTONE_NAME}}

**Goal:** {{ONE_SENTENCE}}

**Acceptance criteria** (what must and must not happen):

- [ ] The acceptance suite for this milestone runs, is red, and is approved before building
- [ ] {{CRITERION}}
- [ ] {{CRITERION_ON_FAILURE}}: when {{EXTERNAL_SYSTEM}} does not respond, {{EXPECTED}}
- [ ] {{ABSENCE}}: the screen does NOT show {{X}}

**Use cases** (what a person came to do):

- As {{ROLE}}, I {{ACTION}} so that {{OUTCOME}}.

**Wireframes:** every state (empty, filled, error, at limit), real texts, one drawing per flow.

## 7. Definition of Done

- [ ] All milestone criteria checked, each with evidence in the milestone close record
      (`docs/work/milestone-close.md`)
- [ ] Tests written first, at the level that proves each rule
- [ ] `FEATURES.md` and `CHANGELOG.md` updated
- [ ] Security register reviewed
- [ ] Human accepted
