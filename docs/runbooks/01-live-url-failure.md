# Runbook 01: Live URL Failure & Rollback Procedure

## Trigger
- External uptime ping reports non-200 HTTP status on primary Cloudflare Pages URL.
- Demo UI fails to load during judge review.

## Immediate Actions
1. **Switch to Backup URL:** Direct users/judges immediately to the secondary mirror:
   - Primary: `https://urbanflow.pages.dev`
   - Backup: `https://urbanflow-backup.github.io`
2. **Offline ZIP Fallback:** Point judges to the self-contained offline release zip bundle in GitHub Releases.
3. **Inspect Edge Health:**
   - Execute: `curl -s https://edge.urbanflow.workers.dev/api/health`
   - If Edge returns 5xx: Check Cloudflare Workers Dashboard analytics. Note that Core simulation runs offline in-browser even if Edge is down.
4. **Rollback Deployment:**
   - In Cloudflare Pages dashboard: Rollback to previous known-good deployment artifact.
5. **Verify:**
   - Run `pnpm smoke --url <live-url>` to confirm clean startup.
