# Runbook 02: AI Cost Spike & Budget Exhaustion

## Trigger
- Daily AI credit usage approaches or exceeds 80% of configured cap (`AI_DAILY_CAP`).
- Edge log alerts report frequent `RATE_LIMITED` on `/api/copilot/diagnose`.

## Immediate Actions
1. **Lower Rate Limits & Daily Cap:**
   - Update `AI_DAILY_CAP` in `wrangler.toml` or via Cloudflare Worker environment variables.
   - Restrict per-IP rate limit from 20/h to 5/h.
2. **Force Template Fallback Mode:**
   - If Meta API balance is critically low: Disable MetaProvider in `CopilotRouter` to route directly to `TemplateProvider` and cached precomputed diagnoses.
3. **Check Cache Hits:**
   - Verify that repeated diagnosis requests for the same window hash are hitting the DO cache (`ai_cache_hits_total`).
4. **Inspect IP Abuse:**
   - Check hashed IP logs to identify any scraping bots or abusive scripts. Ban abusive IPs in Cloudflare WAF.
