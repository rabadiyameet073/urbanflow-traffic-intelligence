# API Reference

> Module 22 §8: routes, examples, and the status/`error.code` table.
> The wire contracts themselves live in `packages/core/src/contracts.ts` (Rule 12);
> machine-readable JSON Schemas are generated into `docs/api/*.schema.json` by
> `pnpm api:gen` and drift-checked by `pnpm api:check` (run `pnpm build` first —
> the generator reads the compiled `core` output). Examples below are the same
> checks `scripts/smoke-live.sh` executes against a deployed instance.

## Base URL & content type

All routes are served by the edge gateway (`packages/edge`). Requests and
responses are `application/json; charset=utf-8` only; any other content type is
rejected with `415 UNSUPPORTED_MEDIA_TYPE`. Bodies are size-capped **before**
parsing: EVP 4 KB, copilot 64 KB, replay 200 KB (`413 PAYLOAD_TOO_LARGE`).

## Routes

| Method | Path | Purpose | Request | Response |
|---|---|---|---|---|
| `GET` | `/api/health` | Liveness + measured AI spend | — | `{ status, version, time, aiProviders, budget, aiCostUsdToday }` · `Cache-Control: public, max-age=5` |
| `GET` | `/api/metrics` | Gateway counters snapshot | — | `EdgeMetrics.getSnapshot()` |
| `POST` | `/api/evp` | Emergency-vehicle preemption (HMAC-signed) | `SignedEvp` (§EVP) | decision `{ id, decision, reason, serverTime }` |
| `POST` | `/api/evp/demo-token` | Mint a demo signing key (demo origins only) | — | `{ ...evpData, signature }` |
| `POST` | `/api/replay` | Store a replay blob (idempotent by content hash) | `{ id, blob }` ≤ 200 KB | `{ success, id, deduplicated }` · 201 (200 on dedupe) |
| `GET` | `/api/replay/:id` | Fetch a stored replay | — | `{ id, blob }` · `410 EXPIRED` after 7 days |
| `POST` | `/api/copilot/diagnose` | AI diagnosis of a 60 s window | `{ window, image? }` ≤ 64 KB | `{ source, latencyMs, tokens, costUsdEstimate, diagnosis }` |
| `POST` | `/api/copilot/explain` | Narrate a decision log | `{ decisionLog }` | `{ source, text }` |
| `POST` | `/api/copilot/chat` | Grounded Q&A, question ≤ 500 chars | `{ question, sessionId }` | `{ source, answer, toolCalls[] }` |
| `POST` | `/api/copilot/advisory` | Public-advisory copy | `{ diagnosis }` | `{ source, advisoryText, signMessage[] }` |
| `GET` | `/api/db/status` | MongoDB connection & telemetry storage status | — | `{ ok, connected, uri, dbName, collections, fallbackActive }` |
| `POST` | `/api/db/runs` | Store or update simulation run document | `SimulationRunDoc` | `{ ok, message, runId }` · 201 |
| `GET` | `/api/db/runs` | List recorded simulation runs | — (supports `?limit=50`) | `{ ok, runs: [...] }` |
| `GET` | `/api/db/runs/:runId` | Get specific simulation run metadata | — | `{ ok, run: {...} }` |
| `POST` | `/api/db/runs/:runId/telemetry` | Batch ingest lane telemetry records | `{ records: LaneTelemetryDoc[] }` | `{ ok, insertedCount }` · 201 |
| `GET` | `/api/db/runs/:runId/telemetry` | Retrieve run telemetry points | — (supports `?limit=500`) | `{ ok, count, records: [...] }` |
| `POST` | `/api/db/runs/:runId/evp` | Record emergency vehicle preemption event | `EvpEventDoc` | `{ ok, message }` · 201 |
| `GET` | `/api/db/runs/:runId/evp` | Get recorded EVP logs for run | — | `{ ok, events: [...] }` |
| `POST` | `/api/db/runs/:runId/signal` | Record signal timing / phase transition | `SignalStateDoc` | `{ ok, message }` · 201 |
| `GET` | `/api/db/runs/:runId/export` | Complete run bundle export (run, telemetry, evp) | — | `{ run, telemetry, evpEvents }` |
| `GET` | `/ws/:room` | Viewer WebSocket upgrade (§WebSocket below) | upgrade headers | `101` / `1013` room full |

Every copilot response carries `source ∈ { muse-spark, llama-fallback, template }`;
money is accumulated as integer micro-USD and only converted in the wire layer.

## Error envelope

One shape everywhere — codes are the contract, messages never echo user input:

```json
{ "error": { "code": "RATE_LIMITED", "message": "Too many requests. Try again later.", "requestId": "01JD…" } }
```

| Status | When | `error.code` |
|---|---|---|
| 200/201 | OK / created | — |
| 400 | Schema/format invalid | `INVALID_REQUEST`, `INVALID_JSON` |
| 401 | Signature missing/invalid | `BAD_SIGNATURE` |
| 403 | Origin not allowed | `ORIGIN_FORBIDDEN` |
| 404 | Unknown route/id | `NOT_FOUND` |
| 405 | Wrong method | `METHOD_NOT_ALLOWED` |
| 409 | Duplicate nonce/replay | `NONCE_REPLAY` |
| 410 | Expired replay | `EXPIRED` |
| 413 | Too large | `PAYLOAD_TOO_LARGE` |
| 415 | Wrong content type | `UNSUPPORTED_MEDIA_TYPE` |
| 422 | Semantically invalid (plausibility) | `IMPLAUSIBLE_SPEED`, `IMPLAUSIBLE_DISTANCE`, `UNKNOWN_LANE` |
| 429 | Rate/budget limit | `RATE_LIMITED`, `STORM_GUARD`, `BUDGET_EXHAUSTED` |
| 500 | Unexpected | `INTERNAL` |
| 503 | Dependency down | `PROVIDER_UNAVAILABLE` |

`429` and `503` include `Retry-After` seconds when the wait is known. Every
response echoes `X-Request-Id` (caller-supplied when well-formed).

## EVP

Rejection reason codes: `BAD_SIGNATURE, TIMESTAMP_SKEW, NONCE_REPLAY,
RATE_LIMITED, STORM_GUARD, IMPLAUSIBLE_SPEED, IMPLAUSIBLE_DISTANCE,
UNKNOWN_LANE, INVALID_REQUEST`. The idempotency key is `id` (plus `nonce`
against replay); a client may retry once on a network error with the **same**
`id`/`nonce` and gets the same decision.

```
POST /api/evp
{ "id": "evp-123", "lane": "NB-TR", "distanceM": 320, "speedMps": 13.3,
  "tRequestS": 412.0, "nonce": "n-8f2a…", "source": "demo-ems",
  "ts": 1761746591000, "signature": "hex…" }
→ { "id": "evp-123", "decision": "accepted", "reason": null, "serverTime": "2026-10-29T14:03:11Z" }
```

## WebSocket `/ws/:room`

Envelope (all frames): `{ "v": 1, "type": "...", "seq": 1042, "t": "2026-10-29T14:03:11.482Z", "payload": {} }`

| Rule | Value |
|---|---|
| Types | `lane-telemetry`, `signal-state`, `lane-metrics`, `emergency-events`, `ping`, `pong`, `hello` |
| Validation | transport envelope validated here; per-type payload schemas in module 31 catalogue. Unknown/malformed ⇒ ignore + strike; 3 strikes ⇒ close `1008` |
| Ordering | `seq` per sender; receivers tolerate gaps |
| Limits | 16 KB/message (`1009`), 20 msg/s/conn (`1008`), 50 viewers/room (`1013`) |
| Close codes | 1000 normal · 1008 policy · 1009 too big · 1013 room full |
| Reconnect | client: exponential backoff 0.5 s → 8 s with jitter; no resume state required |
| Heartbeat | server pings every 30 s; a client treats 2 missed pongs as down |

## Smoke examples

```bash
bash scripts/smoke-live.sh --url https://<deployment> --api
# covered: GET /api/health → 200 + documented fields + max-age=5,
# GET /api/does-not-exist → 404, POST /api/health → 405,
# security headers present, CORS denies unlisted origins.
```

## Every new route needs

schema (`core`/`edge` zod + `pnpm api:gen`), tests (happy, invalid, oversized,
rate-limited), a docs row above, and the CORS/headers check in the smoke script.
