# Meta Model API Integration Notes

> Cost and availability figures below are **assumptions taken from the provider's
> published pricing at integration time**, not measurements. Every one is marked
> `assumption`. See Rule 00 in the repository's honest-numbers policy.

## Configuration

| Item | Value | Status |
|---|---|---|
| Portal | `dev.meta.ai` (Meta Model API) | as documented by the provider |
| Base URL | `https://api.dev.meta.ai/v1` (OpenAI-compatible) | configured in `env.ts` as `META_API_BASE` |
| Model | `muse-spark-1.3` | configured as `META_MODEL` |
| Naming rule | Use `muse-spark-1.3`; never a `-contributor` variant | enforced by the default value |
| Input price | ≈ $1.25 / 1M tokens | **assumption** — provider list price at integration time |
| Output price | ≈ $4.25 / 1M tokens | **assumption** — provider list price at integration time |
| Promotional credit | claimed at signup | **not verified in code**; the budget guard assumes no credit |

The gateway does not depend on any of these values being correct. It enforces a
per-IP limit (20 calls/hour, 10 s minimum interval) and a global daily cap
(`AI_DAILY_CAP`, default 1500) before any provider call, and it accumulates cost
in **integer micro-USD** so the meter cannot drift through float rounding.

## Provider Chain

```
Muse Spark (META_API_KEY present)
    ↓ timeout, non-2xx, schema failure, or ungrounded number
Workers AI (Llama, when the `AI` binding exists)
    ↓ same failures
Deterministic template (always available, no network)
```

The chain degrades **silently**. A user never sees a provider error; they see a
response whose `source` field says which tier answered. That is deliberate: an
operator asking "why is the queue growing" should get an answer, not a stack
trace about a rate limit.

## What Makes a Response Fail Over

| Failure | Detected by |
|---|---|
| Timeout / connection error | `fetch` abort in the provider client |
| Non-2xx response | status check |
| Output is not JSON | `JSON.parse` |
| Output violates the schema | `DiagnosisV1Schema.safeParse` |
| `rootCause` outside the enumerated set | schema enum |
| A cited number is not in the input window | `verifySemanticNumbers` |
| Circuit breaker open (3 failures in 60 s) | `CopilotRuntime` |

## Measured vs Assumed

**Measured in this repository:** the number of provider tiers, the fallback
order, the per-request cache TTL (60 s), the breaker threshold (3 failures /
60 s), the budget limits, and the fact that the template provider answers with
no network at all (asserted in `edge.test.ts`).

**Assumed:** token prices, the credit balance, provider latency, and provider
availability. No latency percentile for Muse Spark is published in this
repository, because none was measured. If a number about model performance is
needed, it must be produced by a run, not by this document.

## Claim Language to Avoid

The following phrasings are wrong and should not reappear in the README, the
video script, or the submission form:

- "100 % uptime" — the correct statement is that the copilot degrades to a
  deterministic template rather than failing the request.
- "measured latency" — unless a run produced it.
- "free" — the credit terms are the provider's to change; the accurate claim is
  that the design needs no paid tier to function.
