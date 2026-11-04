# Module 22: API & Protocol Standards

> HTTP, WebSocket, Web-Worker and Kafka message conventions. Consistency here is what lets one adapter change instead of ten.

---

## 1. Principles

1. **Contracts first:** zod schema in `core` → TypeScript types → runtime validation → JSON Schema export (`zod-to-json-schema`) for docs/tests. Never hand-write a type that duplicates a schema.
2. **Explicit versions:** every payload carries `schemaVersion` (integer). HTTP API version is implicit in the schema; breaking changes need an ADR and a reader for N−1 during the demo window.
3. **Uniform errors** everywhere; **stable reason codes**; no free-form strings as logic.
4. **Idempotent where retried** (EVP, replay store).
5. **Validate at every trust boundary**, even between your own components.

---

## 2. HTTP Conventions

| Topic | Rule |
|---|---|
| Paths | `/api/<noun>[/<id>][/<verb>]`, lowercase, kebab-case |
| Methods | `GET` safe/cacheable; `POST` create/command; no `PUT/DELETE` needed in v1 |
| Content type | `application/json; charset=utf-8` only; reject others with 415 |
| Size limits | Enforced **before** parsing (Content-Length + streaming cap): EVP 4 KB, copilot 64 KB, replay 200 KB |
| Time | ISO-8601 UTC strings on the wire; epoch milliseconds only for signed fields (`ts`) |
| Numbers | JSON numbers; money as integer micro-USD; no NaN/Infinity (reject) |
| IDs | Opaque strings; client never parses them |
| Caching | `/api/health`: `max-age=5`; everything else `no-store` |
| CORS | Allow-list echo; no wildcard |
| Compression | Platform default |

### 2.1 Status mapping

| Status | When | `error.code` examples |
|---|---|---|
| 200/201 | OK / created | — |
| 202 | Accepted for async work (rare) | — |
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

`429` and `503` include `Retry-After` seconds when known.

### 2.2 Error envelope

```json
{ "error": { "code": "RATE_LIMITED", "message": "Too many requests. Try again later.", "requestId": "01JD…" } }
```

Messages are human-readable and generic; **codes** are the contract. Never echo user input into `message`.

### 2.3 EVP decision response

```json
{ "id": "evp-123", "decision": "accepted", "reason": null, "serverTime": "2026-10-29T14:03:11Z" }
{ "id": "evp-124", "decision": "rejected", "reason": "NONCE_REPLAY", "serverTime": "…" }
```

Reason codes (rejections): `BAD_SIGNATURE, TIMESTAMP_SKEW, NONCE_REPLAY, RATE_LIMITED, STORM_GUARD, IMPLAUSIBLE_SPEED, IMPLAUSIBLE_DISTANCE, UNKNOWN_LANE, INVALID_REQUEST`.

---

## 3. WebSocket Protocol (`/ws/:room`)

Envelope:

```json
{ "v": 1, "type": "signal-state", "seq": 1042, "t": "2026-10-29T14:03:11.482Z", "payload": { } }
```

| Rule | Detail |
|---|---|
| Types | `lane-telemetry`, `signal-state`, `lane-metrics`, `emergency-events`, `ping`, `pong`, `hello` |
| Validation | zod per type; unknown type ⇒ ignore + count; invalid ⇒ close 1008 after 3 strikes |
| Ordering | `seq` per sender; receivers tolerate gaps |
| Limits | 16 KB/message, 20 msg/s/conn, 50 viewers/room |
| Close codes | 1000 normal · 1008 policy · 1009 too big · 1013 room full / try later |
| Reconnect | Client: exponential backoff 0.5 s → 8 s with jitter; resume without state requirement |
| Heartbeat | Server ping every 30 s (Hibernation auto-response); client treats 2 missed pongs as down |

---

## 4. Web Worker Protocol (`web/worker` ↔ main)

Typed, versioned discriminated unions in `core` (zod-validated in tests and in dev builds). Full catalogue in module 31. Rules: commands are small JSON; **frames are transferable typed arrays**; the worker never touches the DOM; the main thread never runs simulation code.

---

## 5. Kafka Messages

Same envelope fields as module 02 §3: `schemaVersion`, `eventId`, `timestamp`, `intersectionId`, plus `controller` where relevant. Keys per module 12. Headers: `producedAtMs`, `runId`. Unknown versions → `dlq`.

---

## 6. Copilot API (edge)

| Route | Request | Response |
|---|---|---|
| `POST /api/copilot/diagnose` | `{ window: DiagnosisWindowV1, image?: base64Png }` | `{ source, latencyMs, tokens, costUsdEstimate, diagnosis: DiagnosisV1 }` |
| `POST /api/copilot/explain` | `{ decisionLog }` | `{ source, text }` |
| `POST /api/copilot/chat` | `{ question (≤ 500 chars), sessionId }` | `{ source, answer, toolCalls[] }` |
| `POST /api/copilot/advisory` | `{ diagnosis }` | `{ source, advisoryText, signMessage[] }` |

`proposeParams` is verified **client-side** (twin + kernel live in the browser); the edge only returns the AI's *suggested* `Partial<AdaptiveParams>` inside `recommendedActions`.

Every response carries `source ∈ {muse-spark, llama-fallback, template}`.

---

## 7. Idempotency & Retries

| Operation | Idempotency key | Retry policy |
|---|---|---|
| EVP request | `id` (and `nonce` for replay) | Client may retry once on network error with the **same** `id`/`nonce` ⇒ same decision |
| Replay store | Content hash → same id returned | Retry once |
| Copilot | None (cacheable by input hash) | Server retries 5xx once |

---

## 8. Documentation of APIs

- JSON Schemas generated into `docs/api/*.schema.json` by a script (checked in CI for drift).
- `docs/API.md` lists routes, examples, status/ code table. Examples are executable in a smoke script.
- Every new route needs: schema, tests (happy, invalid, oversized, rate-limited), docs row, CORS/headers check.

---

## 9. Anti-Patterns

| ❌ | ✅ |
|---|---|
| `{ ok: false, msg: "bad" }` | `{ error: { code, message, requestId } }` |
| Different error shapes per route | One envelope |
| Business rules in route handlers | Pure functions in `core`/`edge/lib` |
| Parsing JSON then checking size | Size first |
| Free-text reasons driving UI logic | Enum codes |
| Floating-point money | Integer micro-USD |
| Silent drop of invalid messages | Count + close on repeat |
