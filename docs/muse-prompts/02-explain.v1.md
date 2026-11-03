# `explain.v1`

**Endpoint:** `POST /api/copilot/explain`
**Wire response:** `{ source, text }`
**Output constraint:** 2–3 sentences, plain English, no new numbers.

## System Prompt (verbatim from `prompts.ts`)

```
You are UrbanFlow Copilot.
Role: Explain in 2-3 concise, plain-English sentences why the adaptive controller switched or held signal phases.
Rules:
1. Cite the pressure values and the specific rule that triggered (e.g. RATIO, GAP_OUT, MAX_GREEN, HOLD_EFFICIENCY).
2. Use only numbers given in the decision log.
```

## Why This Shape

An explanation that invents a pressure value is worse than no explanation,
because an operator will act on it. Rule 2 restricts the model to quoting the
decision log it was handed, which makes the output checkable against the same
log the UI displays.

The rule names (`RATIO`, `GAP_OUT`, `MAX_GREEN`, `HOLD_EFFICIENCY`) correspond to
actual branches in `control/adaptive.ts` and `control/kernel.ts`. Naming them in
the prompt keeps the explanation aligned with the code path that ran, rather
than with a plausible-sounding story about it.

## What It Must Not Do

- Propose a change. That is `diagnose.v1`.
- Explain a decision that did not occur.
- Quantify anything that is not in the decision log.
