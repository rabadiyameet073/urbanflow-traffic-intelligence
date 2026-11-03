# Skill: edge-gateway

**Use when:** Working on the Cloudflare Worker, Durable Object, routes or wrangler config.

**Read first:** `backend-engineering/21`, `backend-engineering/22`, `system-design/14`

## Rules

1. Routes are small and typed; validate with zod; uniform error envelope with codes.
2. Durable Object (SQLite) stores nonces and light session state; use WebSocket Hibernation; alarms clean TTLs in bounded batches.
3. HMAC-SHA256 with Web Crypto `verify`, canonical JSON, constant-time comparison, timestamp window.
4. Rate limit per IP/key; body size limit; strict CORS allow-list; security headers.
5. Provider calls have timeouts, retries with jitter, and a cost cap; fallback chain Meta → Llama → Template.
6. 🔎 Verify free-plan limits and current DO SQL API before coding.

## Good / Bad

- ✅ `await crypto.subtle.verify('HMAC', key, sig, data)`
- ❌ Comparing signatures with `===`.

## Landmines

- Workers CPU limits are tight; avoid heavy loops.
- `compatibility_date` changes behaviour; bump deliberately.
