# Runbook 04: Edge Worker & Durable Object Error Rate Rising

## Trigger
- Cloudflare Workers 5xx error ratio exceeds 2% over a 5-minute window.
- Client applications report WebSocket disconnections or DO storage errors.

## Immediate Actions
1. **Check Health Endpoint:**
   - Query `GET /api/health` and review status, budget, and memory metrics.
2. **Review Worker Limits & Quotas:**
   - In Cloudflare Dashboard, verify whether CPU execution time per request (free tier limit) was exceeded.
   - Verify Durable Object SQLite storage limits.
3. **Shed Load:**
   - Disable multi-viewer WebSocket synchronization temporarily if room traffic exceeds capacity.
   - Core simulation and single-user control room run unimpeded locally in the browser.
4. **Inspect Error Logs:**
   - Run `npx wrangler tail` to stream live Edge Worker exceptions.

