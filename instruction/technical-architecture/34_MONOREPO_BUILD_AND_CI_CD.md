# Module 34: Monorepo, Build & CI/CD

> One definition of "done": `pnpm verify`. Local, Muse-generated and CI-run code all answer to it.

---

## 1. Repository Layout (module 30/11 reference)

```
urbanflow-ai/
├── package.json  pnpm-workspace.yaml  pnpm-lock.yaml  .npmrc  .nvmrc
├── tsconfig.base.json  tsconfig.json (project references)
├── eslint.config.js  .prettierrc  .editorconfig  .gitignore  .gitattributes  .env.example
├── .github/workflows/{ci.yml,nightly.yml,release.yml}
├── packages/{core,web,edge,bench}/
├── pipeline/  vision/  evals/  e2e/  docs/  instruction/
├── MUSE_CONTEXT.md  README.md  LICENSE  CHANGELOG.md  SECURITY.md  CONTRIBUTING.md
```

`.gitattributes`: `* text=auto eol=lf` (avoid CRLF churn); binary markers for PNG/Parquet.

---

## 2. Toolchain Pins

| Tool | Policy |
|---|---|
| Node | ≥ 20 LTS in `.nvmrc` and `engines`; CI uses the same |
| pnpm | `packageManager` field pins exact version (Corepack) |
| TypeScript | Exact version pinned; `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `verbatimModuleSyntax` |
| ESLint | Flat config, `typescript-eslint` strict-type-checked, custom rules (below) |
| Prettier | One config; `lint` runs `prettier --check` |
| Vitest | Workspace config; coverage via `v8` |
| Playwright | Pinned browsers (Chromium, Firefox, WebKit) installed via `pnpm exec playwright install --with-deps` |
| Python | 3.11; `uv` or `pip` with hashes optional; `ruff`, `mypy`, `pytest` pinned in `requirements-dev.txt` |

---

## 3. Root Scripts (contract)

| Script | Runs |
|---|---|
| `pnpm lint` | ESLint + Prettier check + dependency-cruiser + (python) ruff |
| `pnpm typecheck` | `tsc -b` for all packages + `mypy` for Python |
| `pnpm test` | Vitest (all packages) + pytest (pipeline/vision/evals fast tests) |
| `pnpm build` | Production builds of web, edge (wrangler `--dry-run`), bench |
| **`pnpm verify`** | `lint && typecheck && test && build` — **fails on any error** |
| `pnpm e2e` | Playwright (functional, a11y, visual, perf) |
| `pnpm bench run --scenario all` | Held-out benchmark → `results.json` |
| `pnpm docs:check` | README numbers = `results.json`; links resolve; meta budgets |
| `pnpm security` | gitleaks, `pnpm audit --prod`, `pip-audit`, bundle-secret grep |
| `pnpm smoke --url <u>` | Live smoke test |
| `pnpm fresh-clone` | Clone → install → verify → build in a temp dir |
| `pnpm repro <bundle.json>` | Re-run from a debug bundle and compare hash |

---

## 4. Custom Lint Rules (architecture enforced by machines)

| Rule | Applies to | Effect |
|---|---|---|
| `no-restricted-globals`: `Math.random`, `Date`, `performance`, `setTimeout`, `setInterval`, `window`, `document`, `fetch`, `crypto` | `packages/core/**` | Determinism & purity |
| `no-restricted-imports`: `node:*`, sibling packages | `packages/core/**` | Purity, dependency law |
| `no-restricted-syntax`: assignments to `signal.lanes`/`SignalState` fields outside `control/kernel/**` | all | Rule 06 |
| `no-restricted-properties`: `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `Function` | `packages/web/**`, `packages/edge/**` | XSS |
| `@typescript-eslint/no-floating-promises`, `no-misused-promises` | all | Async safety |
| `no-console` (allow `warn`,`error`) | libs | Hygiene |
| `max-lines` 400 / `max-lines-per-function` 80 (warn) | all | Reviewability |
| `jsx-a11y`-equivalent checks for static HTML in templates (custom/`eslint-plugin-html` where applicable) | web | a11y |

dependency-cruiser config forbids cycles and cross-package imports other than `→ core`.

---

## 5. CI Workflow (reference — verify action versions when you create it)

```yaml
name: ci
on:
  push: { branches: [main, build/**] }
  pull_request:
permissions: { contents: read }
concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: pnpm }
      - uses: actions/setup-python@v5
        with: { python-version: '3.11', cache: pip }
      - run: pnpm install --frozen-lockfile
      - run: pip install -r requirements-dev.txt
      - run: pnpm verify
      - run: pnpm test determinism && pnpm test safety && pnpm test fair-arrivals
      - run: pnpm security
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: reports, path: |
          packages/bench/out/
          docs/TEST_REPORT.md }

  e2e:
    needs: verify
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with: { name: playwright-report, path: e2e/playwright-report }
```

`nightly.yml`: three browsers, differential safety test (2 M ticks), mutation test, soak (headless 10 sim-hours), `pip-audit`, full benchmark smoke.
`release.yml`: on tag `v*` — build, create offline bundle zip, attach to the GitHub Release; deploy edge and web.

CI rules:
1. **Principle of least privilege** (`permissions: contents: read`); no secrets in PR workflows from forks.
2. Pin third-party actions by major version at minimum (SHA pinning for security-sensitive ones).
3. Cache package stores; never cache secrets.
4. CI must pass **from a clean checkout** (`pnpm fresh-clone` mirrors it).
5. A red `main` is a stop-the-line event.

---

## 6. Versioning, Commits, Changelog

- **Conventional Commits** (`feat(core): …`, `fix(edge): …`, `docs: …`, `test: …`, `chore: …`, `perf: …`). Scope = package or module.
- Task numbers in the body (`Task: T3`), tracker IDs per Rule 04.
- `CHANGELOG.md` generated from commits at release; human-edited highlights at the top.
- Tags: `v0.x.y` for milestones; **`submission-v1`** is the frozen submission snapshot.
- Commit messages end with the attribution lines required by the environment (see Rule 01).

---

## 7. Deployment Pipeline

| Target | How | Gate |
|---|---|---|
| Web → Cloudflare Pages | `wrangler pages deploy packages/web/dist` (or Pages Git integration) | `pnpm verify`, e2e green, `pnpm smoke` |
| Web → GitHub Pages (backup) | Action publishing `dist/` with the correct `base` | Same |
| Edge → Workers | `wrangler deploy` with secrets pre-set | edge tests + health smoke |
| Offline bundle | Zip of `dist/` + README + checksum on the GitHub Release | `pnpm e2e offline` |

Humans trigger production deploys (Rule 03: agents never push or deploy). No deploys after Nov 3 evening unless fixing a showstopper; after any deploy run `pnpm smoke`.

---

## 8. Environment Management

| File | Purpose | Committed? |
|---|---|---|
| `.env.example` | Names only (`META_API_KEY=`, `EVP_HMAC_SECRET=`, `VITE_EDGE_URL=`, `VITE_SITE_URL=`) | ✅ |
| `.env`, `.dev.vars` | Real local values | ❌ (gitignored) |
| Worker secrets | `wrangler secret put` | n/a |
| CI secrets | GitHub encrypted secrets (only for jobs that need them) | n/a |

---

## 9. Branch Protection (recommended on GitHub)

`main`: require CI (`verify`, `e2e`), linear history, no force-push, human-only merges. Working branch per Rule 05.

---

## 10. Anti-Patterns

- Different scripts locally vs CI.
- `pnpm install` without `--frozen-lockfile` in CI.
- Floating tool versions ("latest").
- Skipping e2e "because it's slow" before release.
- Committing build outputs, `.env`, Parquet dumps > a few MB, or editor configs.
- Long-lived feature branches (this is a 9-day sprint).
