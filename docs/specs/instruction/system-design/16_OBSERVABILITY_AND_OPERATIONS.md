# Module 16: Observability & Operations

> If a judge hits a bug at 3 a.m. your time, the logs, the health endpoint and the "debug bundle" must tell you exactly what happened — without leaking a secret or a person.

---

## 1. Principles

1. **Observability is built in**, not bolted on: IDs, counters and badges are part of every feature's definition of done.
2. **Reproduce > describe:** any report can be reproduced from `{seed, scenarioId, inputLog, appVersion}`.
3. **No secrets, no PII, no prompts with user text** in any log, metric, trace or screenshot.
4. **Every degraded state is visible** to the user (badge/toast) and countable by the operator.

---

## 2. Identifiers

| ID | Where | Format | Purpose |
|---|---|---|---|
| `runId` | Sim, events, recordings | `run<seed>-<scenario>-<yyyymmddHHMM>` | Correlate a run across core/pipeline/edge |
| `seed` | Everything | integer | Reproduction |
| `stateHash` | Footer, exports, tests | FNV-1a 64 hex | Determinism proof across browsers |
| `requestId` | Edge | ULID/uuid | Correlate client error with edge log |
| `eventId` | Kafka/WS | `runId:tick:lane:kind` | Dedup, replay |
| `appVersion` | Footer, health, logs | `git describe` + build time | Which build misbehaved |

---

## 3. Logging

### 3.1 Shape (JSON lines, one object per line)

```json
{"ts":"2026-10-29T14:03:11.482Z","level":"warn","svc":"edge","route":"/api/evp",
 "requestId":"01JD…","event":"evp.rejected","reason":"NONCE_REPLAY",
 "ipHash":"a91f…","latencyMs":3,"version":"v0.9.2-14-gabc123"}
```

### 3.2 Rules

| Rule | Detail |
|---|---|
| Levels | `debug` (dev only) · `info` · `warn` (handled anomaly) · `error` (unexpected) |
| Event names | `<domain>.<verb>` lowercase (`copilot.fallback`, `kernel.violation_prevented`) |
| Reason codes | `UPPER_SNAKE` enums, documented in `22_API_AND_PROTOCOL_STANDARDS.md` |
| IPs | Never raw; `sha256(ip + dailySalt)` truncated |
| Prompts | Never log prompt/response text; log `{provider, model, promptVersion, tokensIn, tokensOut, latencyMs, costUsdEstimate, cacheHit}` |
| Stack traces | Server logs only; never in responses |
| Volume | Edge logs sampled for `info` on hot paths; `warn`/`error` always |
| Browser | `console.error` only for real errors; Playwright asserts **zero console errors** on load and flows |

---

## 4. Metrics (counters/gauges/histograms)

### 4.1 Core (in-app, shown in a dev/"Audit" panel and exported with runs)

| Metric | Type |
|---|---|
| `kernel.ticks`, `kernel.conflicts` (must be 0), `kernel.violationsPrevented{type}` | counter |
| `kernel.minGreenSeenS`, `maxGreenSeenS`, `yellowCompliancePct`, `allRedCompliancePct` | gauge |
| `sim.arrivals`, `exited`, `inSystem`, `denied` (conservation check) | counter/gauge |
| `evp.requests{accepted,rejected,reason}`, `evp.shortfallS` | counter/histogram |
| `render.frameMs` (p50/p95), `worker.droppedFrames` | histogram/counter |

### 4.2 Edge

`requests_total{route,status}` · `rate_limited_total{bucket}` · `ai_calls_total{provider,outcome}` · `ai_cost_usd_today` · `ai_cache_hits_total` · `ws_connections` · `do_storage_bytes` (best effort).

### 4.3 Pipeline

`events_in_total{topic}` · `events_dlq_total{reason}` · `late_events_total` · `batch_duration_ms` · `lag_offsets` · `latency_ms{p50,p95}` · `anomalies_total{type}`.

---

## 5. Health & Status Endpoints

`GET /api/health` →

```json
{"status":"ok","version":"v0.9.2-14-gabc123","time":"2026-10-29T14:03:11Z",
 "aiProviders":{"meta":true,"workersAi":true},
 "budget":{"used":212,"limit":1500},
 "aiCostUsdToday":0.031}
```

Rules: no secrets; cacheable for a few seconds; the web app uses it to decide the degradation level (module 13 §5) and shows **AI spend today** in the Copilot panel.

---

## 6. The Debug Bundle (Export → "Copy debug info")

One click copies JSON containing: `appVersion`, `seed`, `scenarioId`, `inputLog`, `stateHash`, `userAgent`, last 50 console warnings/errors (sanitised), kernel counters, feature flags, degradation level. **No** free-text user input, no tokens. Bug reports must include it; the repro command is `pnpm repro <bundle.json>` (replays headless and compares the state hash).

---

## 7. Tracing (minimal, practical)

Propagate `requestId` from web → edge → provider (as an opaque header) and log it at each hop. Full distributed tracing is out of scope; document it as a production path.

---

## 8. Alerting (hackathon edition)

| Condition | Action |
|---|---|
| Live URL smoke fails | Immediately run offline-bundle fallback; fix or roll back |
| AI daily cap ≥ 80 % | Lower rate limits; confirm fallback badge works |
| `kernel.conflicts > 0` anywhere | **Stop-the-line** (P0) |
| Edge 5xx ratio > 2 % for 5 min | Disable optional routes, keep health |
| Credits low / payment problem | Switch to Llama/Template default |

Use an external uptime ping (free tier) on both URLs during judging; daily `pnpm smoke` before every demo window.

---

## 9. Operational Checklist Before Each Release

1. `pnpm verify` + `pnpm e2e` green; `docs/TEST_REPORT.md` regenerated.
2. `pnpm smoke --url <live>` green.
3. `/api/health` shows expected providers and sane budget.
4. Secrets rotated if they appeared anywhere unexpected.
5. Tag created; release notes list changes and known gaps.
