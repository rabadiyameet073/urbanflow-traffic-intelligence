# Security Policy

UrbanFlow AI is a simulation prototype. It is not a safety-certified system and
must not be used to operate physical traffic signal hardware. Security reports
are still taken seriously, because the gateway and the copilot handle signed
requests, secrets and paid API calls.

## Reporting

Open a private security advisory on the repository, or contact the maintainer
listed in the submission form. Do not open a public issue for an unpatched
vulnerability.

Please include: the affected route or module, a reproduction, and the impact
you believe it has. We aim to acknowledge within 72 hours.

## What Is In Scope

| Surface | Notes |
|---|---|
| `packages/edge` HTTP routes | Origin gate, CORS, request parsing, error envelopes |
| EVP authentication | HMAC-SHA256 signature, timestamp window, nonce replay store |
| Durable Object | Nonce store, rate-limit windows, WebSocket limits |
| Copilot providers | Prompt injection, output validation, cost exhaustion |
| Supply chain | Dependency provenance and lockfile integrity |

## Design Decisions Relevant to Security

1. **No origin is trusted by default.** `ALLOWED_ORIGINS` is an explicit
   allow-list; a literal `*` in that list is ignored rather than honoured.
   Disallowed origins receive `403 ORIGIN_FORBIDDEN` with no
   `Access-Control-Allow-Origin` header.
2. **Replay is a storage problem, not a check problem.** The nonce store uses
   `INSERT OR IGNORE` and reads `rowsWritten`, so two concurrent requests with
   the same nonce cannot both succeed. A check-then-insert would race.
3. **IP addresses are never stored raw.** They are hashed with a per-day salt
   before reaching the Durable Object, so the store cannot be used to
   reconstruct visitor identity across days.
4. **The AI has no write path.** There is no route that converts model output
   into a signal state. Model output is zod-validated, and every number in a
   diagnosis is checked against the input window; an ungrounded number fails
   validation and the response falls back to a deterministic template.
5. **Cost is bounded, not monitored.** Per-IP limits, a per-source minimum
   interval, and a global daily cap are enforced before the provider call. When
   a limit trips, the copilot degrades silently to the template rather than
   failing the request — availability is preserved, spend is not.
6. **Secrets never enter the repository.** `.env` is ignored; worker secrets are
   set with `wrangler secret put`. `.env.example` carries only obvious dev
   placeholders.
7. **Payload size and content type are checked before parsing.** Oversized
   bodies return `413`, non-JSON returns `415`, and JSON containing `NaN` or
   `Infinity` is rejected rather than coerced.

## Explicitly Out of Scope

- Physical signal cabinet behaviour, conflict monitors, and malfunction
  management units. This project models them; it does not implement them.
- Claims that the simulation is safe for regulatory purposes. See
  [docs/LIMITATIONS.md](docs/LIMITATIONS.md).
- Denial of service through resource exhaustion on a self-hosted deployment
  without a CDN in front of it.
