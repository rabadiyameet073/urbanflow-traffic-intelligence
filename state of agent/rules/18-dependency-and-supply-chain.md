# Rule 18 — Dependencies and Supply Chain (inviolable)

Every dependency is code we did not write but must answer for. Fewer is better.

## Protocol

1. Approved runtime set is in module 57 (`zod`, `uPlot`, plus `kafkajs` for tooling). Adding any runtime dependency needs: purpose, gzip cost, licence, maintenance status, install scripts, and an ADR line.
2. Lockfiles committed; versions pinned exactly for build-critical tools (TypeScript, Vite, Playwright, Spark, Kafka image); Python requirements pinned with `==`.
3. Install with the lockfile (`pnpm install --frozen-lockfile`); no `latest` tags; Docker bases pinned.
4. `pnpm audit` and `pip-audit` run in CI; high/critical findings are fixed or documented with a justification and a task.
5. No dependency bumps after the feature freeze except security fixes (Rule 15).
6. Prefer platform APIs (Web Crypto, Canvas, fetch) over libraries; prefer deleting code over adding packages.
7. Verify a package exists and is the intended one before adding (typosquats, hallucinated names); check the registry page, not memory.
8. GitHub Actions are pinned to commit SHAs or trusted major versions; no `curl | bash`.
9. After any bump: `pnpm verify`, `pnpm e2e`, review visual baselines.

## Good / Bad

| ✅ | ❌ |
|---|---|
| "Add `uPlot@<exact>`: MIT, 45 KB min, ADR-014" | `pnpm add some-chart-kit` unreviewed |
| `pyspark==<pinned>` matches connector | Unpinned `pyspark` |

## Enforcement

CI audit steps, `size-limit`, license-checker, `audit.sh` A13, review checklist §5 (agent diffs).
