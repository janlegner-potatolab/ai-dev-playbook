# Discovery: {{INITIATIVE}}

**Mode:** full | trimmed | explicit skip
**Date:** {{YYYY-MM-DD}}

- **Full:** value depends on unvalidated demand, or the product lacks this capability today.
- **Trimmed:** large feature on an approved product. Keep: Premise, chosen shape + strongest rejected shape, Pre-mortem, Decision.
- **Explicit skip:** one line with the human's own words (for example a contractually fixed scope). A missing record is a failed gate, not silent approval.

> Skip record: "{{HUMAN_WORDS_VERBATIM}}" ({{YYYY-MM-DD}})

## 1. Premise

- Real goal behind the request:
- Is this the right problem, and why:
- Cheaper alternatives (including "do nothing" and "a spreadsheet"):
- Buy vs build:

## 2. Demand

| Signal | Number | Source | Date |
| ------ | ------ | ------ | ---- |
|        |        |        |      |

- Internal tool: named users and how often they would use it.
- Unavailable data is written as a gap, never as verified.

## 3. Shapes

At least three genuinely different shapes (different architecture or different product).

| Shape | Strongest argument for | Weighted score |
| ----- | ---------------------- | -------------- |
| A     |                        |                |
| B     |                        |                |
| C     |                        |                |

- Weights and why:
- Recommendation:

### Adversarial verdict

Fresh-context attack on the shapes: are any of them strawmen, do the weights smuggle in a preselected answer?

- Verdict:
- Changes made after the attack:

## 4. Pre-mortem

"We shipped it and it failed. Why?"

| Risk | Type (real / paper / unspoken) | Action |
| ---- | ------------------------------ | ------ |
|      |                                |        |

- Real: handle now. Paper: consciously deferred. Unspoken: the most valuable output.

## 5. Decision

**Decision:** go | kill | redirect
**Human's words (verbatim):** "{{VERBATIM}}"
**Date:** {{YYYY-MM-DD}}

A kill keeps this record as evidence of work saved.
