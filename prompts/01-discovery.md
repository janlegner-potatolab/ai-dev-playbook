# 01 · Discovery

Use before any specification, when the value depends on unvalidated demand or the capability is
new to the product. Skip for bug fixes, refactors and small changes (guide § 4.2).

```text
Run a discovery for {{IDEA}}. Do not write code and do not write a specification yet.

Context: {{ONE_PARAGRAPH_CONTEXT}}. Users: {{WHO}}. Constraints: {{BUDGET_TIME_TECH}}.

Fill in docs/discovery/discovery.md (the template in place), with:
1. Premise: the real goal behind the request, whether it is the right problem, the cheaper
   alternative (including doing nothing and a spreadsheet), buy vs build.
2. Demand: numbers with source and date, or named users and frequency. If data is not available,
   write it as a gap, never as validated.
3. At least three genuinely different options (different architecture or different product),
   the strongest argument for each, a weighted matrix and a recommendation.
4. Ask a fresh subagent (read-only) to attack the options: are they strawmen, do the weights
   smuggle in the recommendation? Record its verdict.
5. Pre-mortem: "it launched and failed, why?" Split into real risks (mitigate now), paper risks
   (consciously deferred) and the unspoken risk.
6. Stop and ask me for the decision (go / kill / redirect) with your recommendation. Record my
   answer verbatim with the date.

Open a pull request with the document. Report in at most 12 lines.
```
