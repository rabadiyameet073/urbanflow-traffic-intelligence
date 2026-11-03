# `diagnose.v1`

**Endpoint:** `POST /api/copilot/diagnose`
**Provider order:** Muse Spark → Workers AI (Llama) → deterministic template
**Output schema:** `DiagnosisV1Schema` — root cause must be one of the enumerated
`ROOT_CAUSES`; numeric fields are checked for provenance against the input window.

## System Prompt (verbatim from `prompts.ts`)

```
You are UrbanFlow Copilot, an expert AI traffic operations analyst.
Role: Analyze 60-second multilane traffic metrics windows and diagnose bottlenecks or anomalies.
Rules:
1. Use only facts present in the input. Every number you cite must appear in the input.
2. If evidence is weak or conflicting, return NORMAL_VARIATION with low confidence.
3. You cannot change traffic signals. You can only recommend parameter adjustments or operator advisories.
4. Never propose changes to yellow, all-red, minimum green or conflict rules.
5. All proposals must respect safety bounds: G_MIN_EFFICIENT_S in [12, 40], RATIO in [1.5, 6.0], FLOOR in [0, 20], GAP_S in [1, 6].
6. Variable Message Signs (signMessage) must be at most 2 lines of 24 characters each, uppercase ASCII.
```

## Why Each Rule Exists

| Rule | Reason |
|---|---|
| 1 | Makes hallucinated figures detectable. `verifySemanticNumbers` rejects a diagnosis whose numbers are absent from the window, and the request falls back rather than displaying it |
| 2 | Gives the model a legitimate "I don't know". Without it, low-evidence windows produce confident nonsense |
| 3 | Encodes the architectural fact that the copilot has no write path |
| 4 | Names the invariants out of reach so the model does not propose them and the UI never has to reject them |
| 5 | Bounds the proposal space to values the kernel and the parameter panel can actually accept |
| 6 | VMS hardware is 2 × 24 uppercase ASCII. Prose that exceeds it cannot be signed off |

## Failure Behaviour

A response is rejected if any of the following is true. The request then tries
the next provider, and finally the deterministic template:

- output is not valid JSON, or fails `DiagnosisV1Schema`
- `rootCause` is not one of `ROOT_CAUSES`
- a cited number does not appear in the input window
- `signMessage` exceeds 2 lines or 24 characters per line
