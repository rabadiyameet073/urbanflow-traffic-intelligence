# Module 21: Edge Gateway (Cloudflare Workers + Durable Object)

> `packages/edge`: free-plan Worker + one SQLite-backed Durable Object class. It is a **gateway** — rooms, signed EVP, copilot router, replay store, budget guard. It never decides signals (ADR-002).

> ⚠️ Cloudflare APIs and free-plan limits evolve. Treat every limit below as "verify on the current Cloudflare docs/pricing page before relying on it", and record the date you checked in `docs/DEPLOY.md`.

---

## 1. Responsibilities

| Route | Method | Purpose |
|---|---|---|
| `/api/health` | GET | Status, version, AI provider availability, budget counters |
| `/ws/:room` | GET (Upgrade) | Room WebSocket fan-out (Hibernation API) |
| `/api/evp` | POST | Authenticated EVP gateway |
| `/api/evp/demo-token` | POST | Short-lived signed demo template; rate-limited |
| `/api/replay` | POST | Store a replay blob (≤ 200 KB), 7-day expiry |
| `/api/replay/:id` | GET | Fetch replay blob |
| `/api/copilot/*` | POST | diagnose / explain / chat / advisory / propose (Task 11 router seam) |

---

## 2. Worker Structure

```
packages/edge/src/
  index.ts            # fetch handler: route table, CORS, headers, error boundary
  router.ts           # tiny path matcher (no framework)
  env.ts              # typed Env + runtime zod validation of vars/secrets presence
  http/               # json(), error(), cors(), securityHeaders(), readJson(limit)
  security/           # hmac.ts, canonicalJson.ts, hashIp.ts
  do/Room.ts          # Durable Object class (rooms, nonces, rate limits, replay, counters)
  budget/guard.ts     # per-IP + global counters via DO; check()/record()
  copilot/            # providers/, router.ts, prompts.ts, schemas.ts, cache.ts
  logging.ts          # structured logs (no secrets, hashed IPs)
```

Rules:
1. Handlers are thin: parse → validate → call a pure function → format. Business logic lives in testable modules.
2. **Every** route passes through: method check → CORS/origin check → size limit → rate limit → schema validation → handler → uniform error boundary.
3. No global mutable state in the Worker module scope (isolates are reused unpredictably). Shared state lives in the DO.
4. Keep CPU per request tiny (free plan has a small CPU-time limit — verify the current value). No large JSON transforms, no heavy crypto loops.

---

## 3. Env & Secrets

| Name | Kind | Purpose |
|---|---|---|
| `META_API_KEY` | secret | Meta Model API |
| `EVP_HMAC_SECRET` | secret | EVP signature |
| `META_MODEL` | var | default `muse-spark-1.3` (never `-contributor`) |
| `META_API_BASE` | var | default `https://api.meta.ai/v1` (re-check on dev.meta.ai) |
| `AI_DAILY_CAP` | var | default 1500 |
| `ALLOWED_ORIGINS` | var | CSV allow-list |
| `WORKERS_AI_MODEL` | var | Llama fallback id |

Commands go in `docs/DEPLOY.md`: `wrangler secret put META_API_KEY`, `wrangler secret put EVP_HMAC_SECRET`. A startup check returns `/api/health` with `aiProviders.meta=false` when the key is missing instead of crashing.

---

## 4. HMAC-SHA256 EVP Verification

Canonical JSON (sorted keys, no whitespace, UTF-8) over the exact field set `{id, lane, distanceM, speedMps, tRequestS, nonce, source, ts}`. Reference implementation: `helpers/hmac.ts` and `helpers/canonical-json.ts` in this pack.

```ts
export async function verifyEvp(secret: string, body: SignedEvp, nowMs: number): Promise<Result> {
  if (Math.abs(nowMs - body.ts) > 30_000) return reject('TIMESTAMP_SKEW');
  const ok = await verifyHmac(secret, canonicalJson(pick(body, FIELDS)), body.signature); // crypto.subtle.verify → constant-time
  return ok ? accept() : reject('BAD_SIGNATURE');
}
```

Order of checks (cheap → expensive, and never leak which check failed beyond the reason code): size → schema → timestamp window → rate limit → HMAC → nonce (atomic in DO) → plausibility → relay.

Never compare signatures with `===`. Never log the signature or secret.

---

## 6. Durable Object `Room`

- **One DO per room id** (`env.ROOM.idFromName(roomCode)`) plus a reserved id for global counters (`"__global__"`).
- SQLite-backed (free-plan compatible); wrangler migration uses `new_sqlite_classes`.
- Single-threaded per object ⇒ nonce check-and-insert is atomic without extra locks.

```toml
# wrangler.toml (excerpt)
name = "urbanflow-edge"
main = "src/index.ts"
compatibility_date = "<date you create the project>"

[[durable_objects.bindings]]
name = "ROOM"
class_name = "Room"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["Room"]

[vars]
ALLOWED_ORIGINS = "https://urbanflow.pages.dev,http://localhost:5173"
AI_DAILY_CAP = "1500"
```

### 6.1 WebSocket Hibernation API

```ts
export class Room extends DurableObject<Env> {
  async fetch(req: Request) {
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);          // hibernation-friendly
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  async webSocketMessage(ws: WebSocket, msg: string | ArrayBuffer) { /* size, rate, zod, broadcast */ }
  async webSocketClose(ws: WebSocket, code: number) { /* cleanup, code 1000 acknowledge */ }
}
```

Limits: ≤ 50 viewers/room, ≤ 16 KB/message, ≤ 20 msg/s/connection, ping/pong, clean close codes (1008 policy violation, 1009 message too big, 1013 try again later for room full). Messages are zod-validated against the `core` schemas (`lane-telemetry`, `signal-state`, `lane-metrics`, `emergency-events`).

### 6.2 SQLite tables (inside the DO)

```sql
CREATE TABLE IF NOT EXISTS schema_version (v INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS nonces   (nonce TEXT PRIMARY KEY, seen_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS rl       (bucket TEXT NOT NULL, window_start INTEGER NOT NULL, n INTEGER NOT NULL,
                                      PRIMARY KEY (bucket, window_start));
CREATE TABLE IF NOT EXISTS replays  (id TEXT PRIMARY KEY, blob TEXT NOT NULL, created_at INTEGER NOT NULL,
                                      expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS ai_usage (day TEXT NOT NULL, key TEXT NOT NULL, calls INTEGER NOT NULL,
                                      cost_micro_usd INTEGER NOT NULL, PRIMARY KEY (day, key));
CREATE INDEX IF NOT EXISTS idx_nonces_seen ON nonces(seen_at);
CREATE INDEX IF NOT EXISTS idx_replays_exp ON replays(expires_at);
```

- Use a DO **alarm** for TTL cleanup (nonces > 5 min, replays past `expires_at`, old `rl` windows, `ai_usage` > 7 days).
- Money stored as **integer micro-USD**; never floats (no floating-point currency).

---

## 7. CORS, Headers, Errors

```ts
// Allow-list CORS: echo the Origin only if it is in ALLOWED_ORIGINS; otherwise omit ACAO entirely.
// Preflight: 204 with Allow-Methods/Headers/Max-Age for allowed origins only.
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-site',
  'Cache-Control': 'no-store',            // except /api/health (short max-age)
};
```

Uniform error envelope: `{ "error": { "code": "RATE_LIMITED", "message": "…", "requestId": "…" } }`. Codes are in module 22. No stack traces, no internal identifiers, same shape for 4xx and 5xx.

---

## 8. Budget Guard

`check(ipHash, kind): {allow, reason}` / `record(ipHash, kind, costMicroUsd)` backed by the DO.
Limits (all env-overridable): per-IP 20 AI calls/h; per-session min interval 10 s; global `AI_DAILY_CAP`; EVP 1/10 s/source and 5/min/IP; replay writes per-IP/hour. When an AI limit trips, the router **silently** falls back (badge changes) rather than erroring.

---

## 9. Testing (vitest + `@cloudflare/vitest-pool-workers` or Miniflare)

| # | Test |
|---|---|
| 1 | HMAC valid ✔; tampered field ✘; wrong secret ✘; expired ts ✘; replayed nonce ✘; constant-time verify used |
| 2 | Rate limits: 6th request/min from one IP rejected; global storm guard |
| 3 | WS: two clients in a room exchange telemetry; oversize message closes 1009; 51st viewer rejected |
| 4 | CORS: disallowed origin gets no ACAO; preflight OK for allowed |
| 5 | Replay: round trip; expiry (fake timers); oversize rejected |
| 6 | Secret hygiene: grep built output for env **values** ⇒ none |
| 7 | Load smoke: 200 sequential `/api/health` — print p95 |
| 8 | `wrangler dev` smoke script run in CI or pre-release |

---

## 10. Deployment Checklist

1. `wrangler login` (free account); `wrangler secret put …` ×2; set `ALLOWED_ORIGINS` to the real pages.dev origin.
2. `wrangler deploy`; record the `*.workers.dev` URL; set `VITE_EDGE_URL` for the web build.
3. Run `pnpm smoke --url <edge>`; check `/api/health` shows both providers and budget.
4. Confirm no deploys after Nov 3 evening unless fixing a showstopper.

---

## 11. Anti-Patterns

- Verifying the HMAC *after* doing expensive work; comparing with `===`.
- Reading the body before the size limit.
- Module-scope counters pretending to be rate limits.
- Floating-point costs; storing user text in logs.
- Wildcard CORS (`*`) with credentials or on signed endpoints.
- Returning different error shapes for different failures (leaks internals; breaks clients).
