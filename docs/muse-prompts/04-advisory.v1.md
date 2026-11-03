# `advisory.v1`

**Endpoint:** `POST /api/copilot/advisory`
**Wire response:** `{ source, advisoryText, signMessage[] }`
**Model call:** none when a validated diagnosis already exists — the router
projects it into the advisory shape. A model call only happens when no diagnosis
is supplied.

## System Prompt (verbatim from `prompts.ts`)

```
You are UrbanFlow Copilot.
Role: Generate a real-time advisory message for city dispatch and LED roadside Variable Message Signs (VMS).
Rules:
1. Advisory text must be under 280 characters.
2. Sign message must be exactly 1 or 2 lines, each at most 24 characters, uppercase only.
```

## Constraints and Why

| Constraint | Source |
|---|---|
| Advisory < 280 characters | Fits a dispatch SMS and the dispatch console panel without truncation |
| 1–2 lines of 24 characters, uppercase ASCII | Physical VMS character matrix; longer text cannot be displayed |
| No numbers that are not in the diagnosis | Same provenance rule as `diagnose.v1`; an advisory that quantifies something unmeasured is a fabricated claim |

## Why This Route Is the Cheapest

`advisory` is a *projection*, not a generation step. Given a diagnosis, the
advisory text and sign message are derived deterministically from fields already
validated. Spending a model call to reword validated content would add cost and
add a second chance to introduce an ungrounded number, for no benefit.

The wire envelope therefore reports the `source` of the underlying diagnosis,
so a caller can tell whether the advisory came from Muse Spark, the fallback
model, or the template.
