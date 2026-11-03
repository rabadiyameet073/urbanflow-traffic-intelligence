# Rule 10 — Secrets and Privacy (inviolable)

No secret ever enters the repo, the bundle, a log, a prompt or a screenshot.

## Protocol

1. Secrets (Meta API key, HMAC key, Hugging Face token, Cloudflare tokens) live only in `wrangler secret`, CI secret stores, Colab secrets or the human's password manager.
2. `VITE_*` variables are public by definition: never put secrets there. The browser never calls the Meta API directly; the Worker does.
3. `.env*` is git-ignored; `.env.example` lists names and purposes only.
4. Logs, error envelopes, debug bundles and metrics redact keys, tokens, signatures and request bodies beyond documented fields (module 16).
5. Prompts, test fixtures, recordings and screenshots contain no secrets or personal data.
6. If a secret is exposed: stop, tell the human immediately, rotate it, and record the incident in `docs/AUDIT_LOG.md`. History rewrite is the human's call.
7. The system stores no personal data: no accounts, no analytics, no cookies beyond functional storage. Telemetry is simulated.
8. HMAC comparison is constant-time; nonces are single-use with TTL (module 22).

## Good / Bad

| ✅ | ❌ |
|---|---|
| `env.META_API_KEY` read in the Worker only | `VITE_META_KEY` in the web bundle |
| Log `{code:'HMAC_INVALID'}` | Log the raw signature or header |

## Enforcement

gitleaks (pre-commit + CI, full history before submission), `audit.sh` A6, bundle scan in CI, security tests (module 14).
