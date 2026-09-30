# Prompting Basics for Agentic Coding

Claude follows instructions precisely, but it cannot read your mind or see the context in your head. Most bad results come from vague requests, missing context, or no way for Claude to check its own work. This file condenses Anthropic's official prompting guidance and Claude Code best practices into rules you can apply to every task.

## At a glance

| Principle | One-line rule |
| --- | --- |
| Be clear and direct | Say exactly what you want, including format, scope and constraints |
| Give the why | Explain the reason behind a rule; Claude generalizes from it |
| Show examples | 3 to 5 relevant, diverse examples steer format and tone reliably |
| Structure | Separate instructions, context, examples and input with XML tags or headed sections |
| Think and plan first | Explore, then plan, then code, then commit |
| Verification | Give Claude a check it can run: tests, build, linter, screenshot |
| Course-correct early | Stop and redirect as soon as it drifts; `/clear` after two failed corrections |
| Persistent rules | Put stable, specific rules in CLAUDE.md; keep it short |
| Read-back | Ask Claude to restate the task before it starts on anything large |

## How it works

### 1. Be clear and direct

Treat Claude as a brilliant new colleague with no knowledge of your norms. The golden rule: if a colleague with minimal context would be confused by your prompt, Claude will be too.
- State the desired output, its format and its limits.
- Use numbered steps when order or completeness matters.
- If you want more than the minimum ("go beyond the basics"), ask for it explicitly.

### 2. Give context and the why

A bare rule ("never use ellipses") is followed literally. A rule with a reason ("output is read by a text-to-speech engine, which cannot pronounce ellipses") is followed intelligently in cases you did not list. In code: reference the specific files, the constraints, the existing pattern to follow, and what "done" looks like.

| Vague | Specific |
| --- | --- |
| "add tests for foo.py" | "write a test for foo.py covering the case where the user is logged out; avoid mocks" |
| "fix the login bug" | "login fails after session timeout; check token refresh in src/auth/; write a failing test that reproduces it, then fix it" |
| "add a calendar widget" | "look at how existing widgets on the home page are built and follow that pattern for a calendar widget with month selection" |

### 3. Use examples

Examples are one of the most reliable ways to control output. Make them relevant (mirror the real case), diverse (cover edge cases, avoid accidental patterns) and clearly marked (`<example>` tags inside `<examples>`).

### 4. Structure the prompt

When a prompt mixes instructions, background, examples and input data, wrap each in its own tag (`<instructions>`, `<context>`, `<input>`) or its own headed section. Use consistent tag names and nest them when content is hierarchical (`<documents>` containing `<document index="1">`).

### 5. Let Claude think and plan first

The recommended Claude Code workflow has four phases:
1. **Explore**: in plan mode (`Shift+Tab` or `claude --permission-mode plan`), Claude reads files and answers questions without changing anything.
2. **Plan**: ask for a concrete implementation plan: files to change, flow, risks. Edit it before approving (`Ctrl+G` opens it in your editor).
3. **Implement**: leave plan mode and let Claude code against the plan, running tests as it goes.
4. **Commit**: ask for a descriptive commit and a PR.

Skip the plan when the change fits in one sentence (a typo, a rename, a log line). Use it when the approach is uncertain, the change spans several files, or the code is unfamiliar. For one-off deep reasoning, include `ultrathink` in the prompt; for larger features, ask Claude to interview you about requirements and write a spec, then implement it in a fresh session.

### 6. Test-first

Ask for a failing test that reproduces the bug or specifies the behavior, confirm it fails, then implement until it passes. Also tell Claude that tests verify correctness rather than define the solution: no hard-coded values, no special-casing test inputs, and report a test that looks wrong instead of working around it.

### 7. Give Claude a way to check its work

Without a check, "looks done" is the only stop signal and you become the verification loop. With one, Claude works, runs the check, reads the result and iterates.
- Checks: test suite, build exit code, typecheck, linter, a script diffing output against a fixture, a screenshot compared to a design.
- Ask for evidence, not assertions: the command run and its output, or the screenshot.
- Stronger gates for unattended work: a Stop hook that runs the check, or a separate verification subagent that tries to refute the result.

### 8. Verify against the running system

Passing unit tests are not proof that the feature works. Where possible, have Claude start the app, call the endpoint, or open the page and confirm the behavior end to end, and show what it observed.

## Configuration and examples

### A structured task prompt

```text
<context>
Service: invoice API in src/invoices/. Money amounts are integers in cents.
Existing pattern to follow: src/orders/validate.ts.
</context>

<task>
Add validation to createInvoice so negative or zero line totals are rejected
with a 400 and a field-level error. Reason: downstream accounting import
crashes on non-positive lines.
</task>

<constraints>
- Do not change the public response shape for valid requests.
- No new dependencies.
</constraints>

<done_when>
- A failing test reproduces the problem first, then passes.
- Full test suite and typecheck pass; show the output.
</done_when>

Before you start, restate the task in three bullets and list the files you expect to touch.
```

### A read-back request

```text
Before changing anything: summarize what you think I am asking for, what is
out of scope, and how you will verify it. Wait for my confirmation.
```

### CLAUDE.md: specific, not generic

```markdown
# Workflow
- Run `npm run typecheck` after a series of code changes.
- Prefer running single test files, not the whole suite, while iterating.
- IMPORTANT: never edit files under db/migrations/ that are already merged.
```

Include commands Claude cannot guess, style rules that differ from defaults, test instructions, repository etiquette, architectural decisions and known gotchas. Exclude what Claude can read from the code, standard conventions, long tutorials and anything that changes often. For each line ask: "would removing this cause a mistake?" If not, cut it.

## Commands

| Command or key | Use |
| --- | --- |
| `Shift+Tab` | Cycle permission modes, including plan mode |
| `Ctrl+G` | Open the plan in your editor |
| `Esc` | Stop Claude mid-action, keep context, redirect |
| `Esc Esc` or `/rewind` | Restore an earlier checkpoint or summarize part of the conversation |
| `/clear` | Reset context between unrelated tasks |
| `/compact <focus>` | Summarize while keeping what you name |
| `/init` | Generate a starter CLAUDE.md |
| `/context` | Confirm which memory files loaded |

## Limits and gotchas

- A long CLAUDE.md gets partially ignored: important rules drown in noise. Emphasis ("IMPORTANT") works only when used sparingly.
- Claude may optimize for passing tests over a general solution unless you say otherwise.
- Vague investigation requests ("look into this") can read hundreds of files and fill the context.
- Claude stops when the work looks done; without a check, "looks done" is all it has.
- Corrections pile up in context. After two failed corrections on the same issue, the history works against you.

## Good practice

- Name files, functions, symptoms and the definition of done in every non-trivial prompt.
- Point Claude to sources that can answer the question (git history, a specific module, the docs) instead of asking it to guess.
- Ask Claude to read relevant files before answering questions about code.
- Run `/clear` between unrelated tasks; rename the session first if you want to return to it.
- Use a fresh session to review code another session wrote.
- Turn repeated corrections into CLAUDE.md lines, hooks or skills, so you stop repeating them.

### Anti-patterns

| Anti-pattern | Fix |
| --- | --- |
| Kitchen-sink session: unrelated tasks in one conversation | `/clear` between tasks |
| Correcting over and over | After two misses, `/clear` and write a better first prompt with what you learned |
| Over-specified CLAUDE.md | Prune; convert must-always rules to hooks |
| Trust-then-verify gap: plausible code, unhandled edge cases | Always provide tests, scripts or screenshots; if you cannot verify it, do not ship it |
| Unscoped exploration | Scope narrowly or delegate to a subagent |
| Bare rules without reasons | Add the why |
| "Make it better" with no target | State the concrete outcome and how it will be checked |
| Letting Claude code before it understands | Explore and plan first for anything non-trivial |

## In this playbook

- Principles for instructing AI: `../project-structure-design.md` § 18.6.
- Session hygiene: `../project-structure-design.md` § 8; setup reference: § 19.
- Reusable prompt templates: `../prompts/`.

## Sources

- https://code.claude.com/docs/en/best-practices
- https://code.claude.com/docs/en/costs
- https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview
- https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
