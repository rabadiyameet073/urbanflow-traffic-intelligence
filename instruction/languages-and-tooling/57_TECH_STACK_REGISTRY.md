# Module 57: Tech Stack Registry

> Every language, runtime, library, service and tool, with purpose, cost, licence class and pin policy. **Versions are pinned in lockfiles/Dockerfiles at install time — record the exact version and the date in `docs/ARCHITECTURE.md`.** Items marked 🔎 must be re-verified against current docs before use.

---

## 1. Languages

| Language | Where | Why |
|---|---|---|
| TypeScript 5.x | core, web, edge, bench, e2e | Type safety, one language across browser/Worker/Node |
| JavaScript (ESM) | scripts, configs | Tooling glue only |
| HTML5 / CSS3 | web | Hand-written, token-driven |
| Python 3.11 | pipeline, vision, evals | Spark, ML libraries |
| SQL (Spark SQL, SQLite; DuckDB optional) | pipeline, DO | Analytics and edge state |
| Bash + Make | pipeline, tooling | Orchestration |
| YAML / TOML / JSON | compose, CI, wrangler, configs | Configuration |
| Markdown + Mermaid | docs | Documentation |
| (JVM: Scala/Java) | **not authored**; Spark runs on the JVM | Config only (versions/packages) |

---

## 2. Runtime & Platform

| Component | Role | Cost | Notes |
|---|---|---|---|
| Node.js ≥ 20 LTS | Build, bench, producer | Free | `.nvmrc` |
| pnpm | Workspaces | Free | `packageManager` pin |
| Vite | Web build/dev | Free (MIT) | |
| Cloudflare Pages | Static hosting | Free plan 🔎 | Primary URL |
| Cloudflare Workers + Durable Objects (SQLite) | Edge gateway | Free plan 🔎 | Verify current limits |
| Cloudflare Workers AI | Llama fallback | Free allocation 🔎 | Cap usage |
| GitHub + Actions + Pages | Repo, CI, backup hosting | Free (public repo) | |
| Docker / Compose | Pipeline | Free | ≥ 8 GB RAM advised; Lite mode otherwise |
| Apache Kafka (KRaft) | Streaming | Free (Apache-2.0) | Single broker |
| Apache Spark 3.5.x (PySpark) | Stream processing | Free (Apache-2.0) | Connector pinned to same version |
| Parquet / pyarrow | Lake format/reader | Free | |
| MinIO / HDFS | Optional profiles | Free | Not default |
| Google Colab / Modal | Offline vision | Free tier / hackathon credits | Outputs committed |

---

## 3. Libraries (approved set)

### 3.1 TypeScript runtime

| Lib | Purpose | Notes |
|---|---|---|
| `zod` | Schemas/validation | Contracts everywhere |
| `uPlot` | Charts | Tiny (≈ 45 KB min) |
| `kafkajs` | Producer (bench/pipeline only) | Not in the web bundle |
| (none else) | | Anything new needs justification |

### 3.2 TypeScript dev

`typescript`, `vite`, `vitest`, `fast-check`, `@playwright/test`, `@axe-core/playwright`, `eslint`, `typescript-eslint`, `prettier`, `size-limit`, `dependency-cruiser`, `wrangler`, `@cloudflare/vitest-pool-workers` (or Miniflare), `zod-to-json-schema`, `stylelint`, `markdownlint-cli2`.

### 3.3 Python

Runtime: `pyspark`, `pyarrow`, `kafka-python` or `confluent-kafka` (only if needed outside Spark), `pydantic`/`jsonschema`, `numpy`. Vision (Colab-only): `torch`, `transformers`, `opencv-python-headless`, `pillow`. Dev: `pytest`, `hypothesis`, `ruff`, `mypy`, `pip-audit`, `pytest-cov`.

### 3.4 CLI/Quality tools

`gitleaks`, `shellcheck`, `shfmt`, `hadolint`, `actionlint`, `yamllint`, `@mermaid-js/mermaid-cli (mmdc)`, `lighthouse`, OBS Studio, DaVinci Resolve/CapCut (video).

---

## 4. AI & Vision Services

| Service | Use | Constraint |
|---|---|---|
| Meta Model API — `muse-spark-1.3` 🔎 | Copilot | Credits only; non-`-contributor`; server-side key |
| Muse Code | Build the project | Hackathon access; backup OpenCode + Meta API key |
| SAM 3.1 | Segmentation | Licence accepted on Hugging Face; fallback to newest available SAM, **disclose** |
| Muse Image | Synthetic scenes | Store prompts; generated images only |
| Llama (open weights) | Fallback | Workers AI free tier or Ollama (dev) |
| Baseten / Modal / Fireworks credits | Optional compute/inference | Do not exceed free credit; none required for core |

**Explicit exclusions:** no other vendor's model API; no paid cloud (AWS/GCP/Azure); no analytics/tracking SDKs; no UI framework beyond ADR-006's escape hatch.

---

## 5. Licence Policy

| Class | Examples | Rule |
|---|---|---|
| Permissive (MIT/BSD/Apache-2.0/ISC) | most deps | Allowed; credit in `docs/CREDITS.md` |
| Weak copyleft (MPL, LGPL) | rare | Allowed if dynamically linked/unmodified; review |
| Strong copyleft (GPL/AGPL) | — | **Not allowed** in shipped code |
| Model licences (SAM, Llama) | — | Accept as a human; follow terms; credit |
| Datasets (UTD19, PeMS, METR-LA) | optional | Registration/terms honoured; cite; never presented as live data |
| Fonts | Inter (OFL), JetBrains Mono (OFL) | Self-host; include licence |

Project licence: **MIT**. Run a licence check (`license-checker`/`pip-licenses`) before submission and store output in `docs/CREDITS.md`.

---

## 6. Pin & Update Policy

1. Lockfiles committed (`pnpm-lock.yaml`, pinned `requirements*.txt`).
2. Build-critical tools pinned exactly (TypeScript, Vite, Playwright, Spark, Kafka image).
3. Updates only at planned moments; **no dependency bumps after feature freeze** except security fixes.
4. After any bump: `pnpm verify`, `pnpm e2e`, visual baselines review.
5. Record the version table in `docs/ARCHITECTURE.md` at submission (`submission-v1`).

---

## 7. Cost Ledger (target: $0)

| Item | Expected | Guard |
|---|---|---|
| Meta Model API | ≈ $0 within $150 credits | Caps, cache, console alert |
| Cloudflare | $0 | Caching, rate limits, verify free limits |
| GitHub | $0 | Public repo |
| Everything else | $0 | — |

Any line that could incur real cost requires a written decision in `docs/META_API_NOTES.md`/ADR and an explicit cap.
