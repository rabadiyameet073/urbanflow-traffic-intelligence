# UrbanFlow AI — Deployment Guide

> **Status: not deployed.** These are the procedures, not a record of a completed
> deployment. No live URL currently serves this build. Every claim about a public
> URL in this repository is a target until `scripts/smoke-live.sh` has been run
> against it and its log filed in `docs/AUDIT_LOG.md`.

## 0. Prerequisites

| Requirement | Why |
|---|---|
| Cloudflare account with Workers and Pages enabled | Worker + SQLite Durable Object + static hosting |
| `wrangler` CLI on `PATH` | `wrangler deploy`, `wrangler pages deploy`, `wrangler secret put` |
| `EVP_HMAC_SECRET` generated | Without it the worker falls back to the obvious development default |
| Meta API key (optional) | Absent key simply skips the first provider tier |

The Pages project name **must** be `urbanflow-ai`. `ALLOWED_ORIGINS` in
`packages/edge/wrangler.toml` is set to `https://urbanflow-ai.pages.dev`; if you
use a different project name, update that variable or every browser request will
fail preflight with `403 ORIGIN_FORBIDDEN`.

## 1. Edge Gateway (Cloudflare Workers)

Deploy the serverless Edge Gateway to Cloudflare Workers:

```bash
cd packages/edge
# Set secret keys
wrangler secret put META_API_KEY
wrangler secret put EVP_HMAC_SECRET

# Deploy Worker & SQLite Durable Object
wrangler deploy
```

Verify deployment:
```bash
curl https://urbanflow-edge.<your-subdomain>.workers.dev/api/health
```

The response must match the documented health shape: `status`, `version`,
`time`, `aiProviders`, `budget`, `aiCostUsdToday`. A `503` here means the
Durable Object binding or its `v1` SQLite migration did not apply — check
`[[migrations]]` in `wrangler.toml` before assuming the code is wrong.

### Secrets

Never put a secret in `[vars]`. `EVP_HMAC_SECRET` in particular must be set with
`wrangler secret put`, and the development default
(`dev_evp_secret_key_32_chars_long`) is deliberately recognisable so a leaked
dev value is obvious in review.

## 2. Web Application (Cloudflare Pages)

Build the static frontend bundle:
```bash
pnpm --filter @urbanflow/web build
```
The output directory is `packages/web/dist/`.

Deploy via Wrangler Pages:
```bash
npx wrangler pages deploy packages/web/dist --project-name=urbanflow-ai
```

`packages/web/public/_headers` is copied into the build and supplies the static
origin's security headers. It is deliberately not the Worker's set: the page
needs `worker-src 'self'` because the simulation runs in a Worker, and it must
stay indexable, so it carries no `X-Robots-Tag: noindex`. If a header is missing
from the deployed site, first check that `dist/_headers` exists — Pages serves
the site without any of these headers when the file is absent, and nothing in
the build fails to tell you.

No `_redirects` file is needed: deep links use a `#` fragment (ADR 0019), so
there is no server-side route to fall back to.

### Cross-origin edge gateway

`apiBase()` in `packages/web/src/copilot/client.ts` is empty by default, so the
copilot calls `/api/...` same-origin. That only works when the Worker answers on
the same hostname. When the Worker is on `*.workers.dev`, set the meta tag in
`packages/web/index.html` before building:

```html
<meta name="urbanflow-api-base" content="https://urbanflow-edge.<subdomain>.workers.dev" />
```

and add that exact origin to `ALLOWED_ORIGINS` in
`packages/edge/wrangler.toml`. Miss either half and every copilot request fails
preflight with `403 ORIGIN_FORBIDDEN`.

## 2b. Web Application (Vercel — alternative static host)

The repository is configured to deploy the same static SPA to Vercel without any
build change. Vercel hosts **only the frontend bundle**; the Copilot and EVP
gateway is a Cloudflare Worker (§1) and is *not* moved to Vercel. If you want the
AI features live on a Vercel URL, you still deploy the Worker separately and point
the page at it exactly as in §2 "Cross-origin edge gateway".

Root `vercel.json` carries the whole setup:

| Field | Value | Why |
|---|---|---|
| `framework` | `vite` | Vercel's Vite preset; `packages/web` is the Vite project. |
| `installCommand` | `pnpm install --frozen-lockfile` | Monorepo install at the repo root, no lockfile drift (Rule 18). |
| `buildCommand` | `pnpm --filter @urbanflow/web build` | Builds only the web package; `@urbanflow/core` is consumed from source by Vite, so no pre-build step is needed. |
| `outputDirectory` | `packages/web/dist` | The Vite `build.outDir`. |
| `headers` | mirrors `packages/web/public/_headers` | Vercel does not read Pages' `_headers`, so the CSP / `worker-src` / no-store rules are restated here. `connect-src 'self' https://*.workers.dev` is what lets the page reach the Worker. |
| `rewrites` | `/(.*) → /index.html` | SPA fallback. Deep links use a `#` fragment (ADR 0019), so this is only a safety net; Vercel resolves a matching static file before any rewrite, so hashed assets under `/assets/*` still serve directly. |

Deploy from a clean checkout:

```bash
pnpm --filter @urbanflow/web build     # confirm the bundle builds locally first
npx vercel --prod                       # links the project and promotes a build
```

Two manual steps follow any Vercel deploy, and neither has been done in this
pass (it requires a Vercel account, a real domain and a terminal):

1. Set the edge origin for the frontend. On Vercel the clean path is a build-time
   **`VITE_API_BASE_URL`** environment variable (see `packages/web/.env.example`
   and `src/copilot/client.ts`); the runtime `<meta name="urbanflow-api-base">`
   in `index.html` still overrides it without a rebuild. Either way, add the same
   origin to `ALLOWED_ORIGINS` in `packages/edge/wrangler.toml` — otherwise the
   Copilot degrades to its offline template (§2). The variable is a public origin,
   not a secret; never put a secret in a `VITE_` value (Rule 10).
2. The `canonical`, `og:url` and `twitter:image` in `index.html` still point at
   `urbanflow-ai.pages.dev`. A Vercel host is a *different* canonical URL, so
   either accept it as a mirror (Module 33 wants one canonical) or update those
   tags before the Vercel build. Do not ship both hosts advertising themselves
   as canonical.

> **Not deployed.** No Vercel project is linked and no Vercel URL serves this
> build. This section is the procedure; a claim of a live URL needs
> `scripts/smoke-live.sh` run against it and logged in `docs/AUDIT_LOG.md`.

## 2a. Backup Mirrors (demo insurance)

**Neither mirror has been deployed.** Both are one command from a clean
checkout, and they are not equivalent to the primary.

Cloudflare Pages keeps every deployment immutable, so a rollback is a re-deploy
of an older directory rather than a git operation:

```bash
npx wrangler pages deployment list --project-name=urbanflow-ai
npx wrangler pages deploy <previous-dist-dir> --project-name=urbanflow-ai
```

GitHub Pages serves the site under `/<repo>/`, so the default `base: '/'` would
404 every asset — the page would load and show nothing. Pass the base
explicitly; no config change is needed:

```bash
pnpm --filter @urbanflow/web exec vite build --base=/urbanflow-ai/
```

| Difference | Cloudflare Pages | GitHub Pages |
|---|---|---|
| Headers from `_headers` | Applied | **Ignored** — the mirror runs with no CSP |
| URL used in canonical / `og:url` | `urbanflow-ai.pages.dev` | Different host, so social cards point at the primary |
| Edge gateway | Reachable if `ALLOWED_ORIGINS` includes the host | Not reachable unless added; copilot degrades to its template path |

Do not describe the mirrors as identical. The first row is why.

## 3. Streaming Pipeline (Docker Mode)

Start Kafka and Apache Spark:
```bash
cd pipeline
make up
make demo
```

This path requires Docker and roughly 4 GB of RAM. On a machine without Docker,
the pipeline story can still be demonstrated from `pipeline/lite/urbanflow_lite.ts`,
but note that **lite mode was not verified in this pass** (see
`docs/TEST_REPORT.md` QA-25). Do not claim parity with the Spark path in the demo.

## 3b. MongoDB Persistence (Data Storage)

UrbanFlow provides full persistence for simulation runs, lane telemetry, signal phase transitions, and emergency vehicle preemption (EVP) events via MongoDB.

### Configuration

Environment variables configure the database connection (see `.env.example`):
- `MONGODB_URI`: Connection string (defaults to `mongodb://127.0.0.1:27017` or a MongoDB Atlas URI `mongodb+srv://<user>:<password>@<cluster>.mongodb.net`).
- `MONGODB_DB_NAME`: Database name (defaults to `urbanflow`).

### Resilient Fallback Mode

If MongoDB is offline or unreachable, the Edge Gateway automatically switches to an in-memory storage buffer. Simulation runs and telemetry points remain queryable via `/api/db/*` without crashing the gateway.

### Collections & Indexes

The gateway automatically ensures optimized indexes:
- `simulation_runs`: `{ runId: 1 }` (unique), `{ createdAt: -1 }`
- `lane_telemetry`: `{ runId: 1, ts: 1 }`, `{ lane: 1, ts: 1 }`
- `evp_events`: `{ runId: 1, ts: 1 }`, `{ evpId: 1 }`
- `signal_states`: `{ runId: 1, ts: 1 }`
- `anomaly_events`: `{ runId: 1, ts: 1 }`, `{ type: 1 }`

## 4. Rollback

| Component | Rollback |
|---|---|
| Worker | `wrangler rollback` to the previous version id |
| Pages | Re-deploy the previous build directory; Pages keeps deployments immutable |
| Durable Object | Migrations are forward-only. A breaking schema change needs a new class or an explicit migration tag |

## 5. Pre-Submission Smoke

```bash
pnpm verify                                   # typecheck + tests + docs:check + build
bash scripts/smoke-live.sh --url "$LIVE_URL"  # status codes, headers, CORS, health shape
```

Record both outputs in `docs/AUDIT_LOG.md`. A checklist item without a log is
not a passed item.
