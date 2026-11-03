# Skill: security-hardening

**Use when:** Anything crossing a trust boundary; before each deploy.

**Read first:** `system-design/14`, Rule 10

## Rules

1. STRIDE for every new boundary; update the threat table.
2. Validate and bound all inputs; escape all outputs; no `innerHTML` with data.
3. CSP without `unsafe-inline`; HSTS; `X-Content-Type-Options`; `Referrer-Policy`; `Permissions-Policy`.
4. HMAC + nonce + timestamp on EVP; rate limits; size limits.
5. OWASP LLM Top-10 mapping maintained for the Copilot.
6. Run abuse tests (module 14) in CI.

## Good / Bad

- ✅ CSP `default-src 'self'; connect-src 'self' https://<worker>`
- ❌ Wildcard CORS with credentials.

## Landmines

- Inline styles break CSP; use classes/tokens.
- `VITE_*` values are public.
