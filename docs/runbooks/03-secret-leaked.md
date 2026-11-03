# Runbook 03: Secret Leaked Incident Response

## Trigger
- Secret token (`META_API_KEY`, `EVP_HMAC_SECRET`, `HF_TOKEN`) detected in public commit, screenshot, or log export.
- `gitleaks` fails in CI.

## Immediate Actions
1. **Rotate Immediately (Containment):**
   - **Meta API Key:** Log in to Meta Developer Portal -> revoke current API key -> generate new key.
   - **EVP HMAC Secret:** Generate new 32-byte cryptographically secure secret:
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - Update Cloudflare Worker secrets:
     `wrangler secret put META_API_KEY`
     `wrangler secret put EVP_HMAC_SECRET`
2. **Invalidate Demo Tokens:**
   - Any outstanding signed demo tokens with old secret will immediately fail validation with `INVALID_SIGNATURE`.
3. **Purge From Git History (Eradication):**
   - Use `git-filter-repo` or BFG to expunge sensitive strings from repository commits if committed.
4. **Post-Incident Review:**
   - Verify all pre-commit hooks and CI gates are active. Document incident summary in `docs/INCIDENTS.md`.

