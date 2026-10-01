# AI Dev Playbook

A practical playbook for building web applications with AI coding agents (Claude Code), in two
layers:

1. **Fundamentals:** how Claude Code works, explained from the official documentation (memory,
   settings, hooks, subagents, skills, plugins and marketplaces, MCP, context and models,
   worktrees, prompting).
2. **Playbook:** how I use it to build software: the method, the engineering standards, ready-made
   prompts and a starter kit you copy into a new repository.

The core idea: **an AI agent follows everything that is checked automatically and improvises
everything else.** So both the *process* and the *structure of the code* are enforced by
mechanisms (guards, gates, templates), not by sentences in a document.

## What is inside

| Path | What it is | When to read |
| --- | --- | --- |
| [`fundamentals/`](fundamentals/) | General knowledge about Claude Code, one topic per file, with links to the official docs | When a building block is new to you, or to look up how it works |
| [`project-structure-design.md`](project-structure-design.md) | The main guide: project structure, structure rules, build process, how AI development is organized, session management, deployment, typical AI failure modes, structure guards, the flow from specification to issues (§ 18), my Claude Code setup (§ 19) and specification-driven development with an acceptance runner (§ 20) | Always; § 0 is a one-page summary |
| [`standards/`](standards/) | Engineering standards: API design, database, domain design, frontend, testing, security, git and CI/CD, performance, data, stack selection, releases | When working on that area; index in § 17 of the guide |
| [`prompts/`](prompts/) | Ready-to-copy prompts for each step: discovery, specification, spec review, splitting a milestone into GitHub issues, working an issue, review and QA, bug report, session end, overnight run, parallel dispatch | Every time you start a step; the flow is in § 18 of the guide |
| [`starter-kit/`](starter-kit/) | Files to copy into a new repo: `CLAUDE.md`, agent roles, document templates, guard hooks, ESLint and dependency rules, CI, GitHub issue and PR templates, structure checks and a tested reference area | When starting a project; see [`starter-kit/README.md`](starter-kit/README.md) |

## How to read it

- **New to Claude Code:** start with [`fundamentals/README.md`](fundamentals/README.md), then
  § 0 and § 19 of the guide.
- **Starting a project:** § 0, § 3 (build process), § 14 (checklist), § 18 (specification to
  issues), then the starter kit.
- **Looking for my setup of a specific block** (memory, hooks, agents, skills, marketplace):
  § 19 of the guide; every subsection links to the matching fundamentals file.
- **AI agents reading this repo:** fundamentals files state facts and link to the official docs;
  the guide and standards state rules. When a fundamentals fact and the current official docs
  disagree, the official docs win.

## Ten principles

1. **Validate that it is worth building** (discovery), then specify, then code.
2. **Domain model, areas and architecture come before the first line of code.**
3. **The UI component library comes before the first screen**, built from design deliverables.
4. **One reference area built carefully**; AI copies what it sees in the repo.
5. **Work in milestones** (M0 proof of concept, M1 MVP, M2 v1.0); advance only after human approval.
6. **Every change:** task brief with criteria → test first → code → verify against the running
   system → review by a fresh agent → merge.
7. **Guards of three kinds:** security, process **and code structure**. The third is the one most
   often missing.
8. **Work state lives in the repo or the task, not in the session's head**; every session starts
   by reading the state and ends by writing it.
9. **A claim without evidence is a defect.** "Done" means verified and merged.
10. **A human deploys:** mechanical gates, staging first, production only on an explicit "yes".

## How to start a new project

1. Read § 0 of the guide.
2. Go through § 3 (build process) and § 14 (new project checklist).
3. Run discovery and write the specification (§ 4.2, § 5; prompts 01 to 03).
4. After a "go" decision and an architecture draft, copy `starter-kit/` into the new repository
   and follow its README.
5. Split the first milestone into GitHub issues (§ 18, prompt 04), merge each task's acceptance
   file (prompt 11), then start sessions per issue (prompt 05). "Done" is decided by the
   `acceptance` check, not by the agent (§ 20).

## Structure guards at a glance

The starter kit enforces the structure rules at three levels:

- **After each file edit** (Claude Code `PostToolUse` hook): lint errors go straight back to the
  agent.
- **Before a pull request** (`PreToolUse` hook on `gh pr create`): the full structure check
  must pass.
- **In CI** (required status check on `main`): the real safety net, also for humans.

Running projects adopt the guards with a **ratchet**: today's violations go on an exception
list, CI fails only on new ones, and the list may only shrink.

## Status

- The fundamentals are written from the official Claude Code documentation (see the sources in
  each file). Claude Code changes quickly: check the linked docs for the current details.
- The guide and standards are based on the principles of a mature AI development framework and
  on established standards (RFC 9457, Semantic Versioning, Keep a Changelog, WCAG 2.1 AA).
- The starter kit is verified on a clean copy: typecheck, lint, formatting, dependency rules,
  dead-code check, structure checks and 30 tests of the reference area pass; the guard hooks
  have 26 test cases.
- Not yet verified: the reference area against a real PostgreSQL and HTTP server, the CI
  workflow on GitHub, and the method end to end on a real project. Details in
  [`starter-kit/README.md`](starter-kit/README.md) § 5.
