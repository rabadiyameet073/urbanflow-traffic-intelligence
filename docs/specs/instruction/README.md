# UrbanFlow AI — Engineering Specification Pack

Numbered modules that define how this system is built and reviewed: platform
specifications, system design, backend engineering, frontend architecture,
design standards, language standards, and quality audits. They were the
reference during development and remain here as the design record.

Precedence when documents disagree: platform-specifications 01–06 > other
modules > convenience. Where a module states something that was later
superseded, `platform-specifications/06` (source reconciliation) records which
claim won.

## The one architecture rule

The deterministic controller and the Safety Kernel decide signals. The data
pipeline only observes and stores. AI only advises: bounded proposal → Zod
validation → Kernel dry-run → digital-twin what-if → human approval.
Everything else in this pack serves that sentence.

## Conventions used in this pack

- 🔎 marks a provider or platform fact (limits, model IDs, prices) that must
  be verified against current official documentation before use.
- Numbers in public material come only from the generated `results.json`;
  `pnpm docs:check` fails if the published tables drift from it.

## Directory index

### `platform-specifications/` — vision, contracts, control spec, AI spec, rubric, source reconciliation

| File | Topic |
|---|---|
| [`01_PROJECT_MASTER_GUIDE.md`](platform-specifications/01_PROJECT_MASTER_GUIDE.md) | Project Master Guide & Quality Bar |
| [`02_DOMAIN_MODEL_AND_CONTRACTS.md`](platform-specifications/02_DOMAIN_MODEL_AND_CONTRACTS.md) | Domain Model & Frozen Contracts |
| [`03_TRAFFIC_CONTROL_SPECIFICATION.md`](platform-specifications/03_TRAFFIC_CONTROL_SPECIFICATION.md) | Traffic Control Specification |
| [`04_AI_COPILOT_AND_VISION_SPECIFICATION.md`](platform-specifications/04_AI_COPILOT_AND_VISION_SPECIFICATION.md) | AI Copilot & Vision Specification |
| [`05_HACKATHON_RUBRIC_AND_SUBMISSION.md`](platform-specifications/05_HACKATHON_RUBRIC_AND_SUBMISSION.md) | Hackathon Rubric, Schedule & Submission |
| [`06_SOURCE_DOCUMENT_RECONCILIATION.md`](platform-specifications/06_SOURCE_DOCUMENT_RECONCILIATION.md) | Source Document Reconciliation |

### `system-design/` — architecture, ADRs, data/streaming, reliability, security, performance, observability

| File | Topic |
|---|---|
| [`10_SYSTEM_ARCHITECTURE.md`](system-design/10_SYSTEM_ARCHITECTURE.md) | System Architecture |
| [`11_ARCHITECTURE_DECISION_RECORDS.md`](system-design/11_ARCHITECTURE_DECISION_RECORDS.md) | Architecture Decision Records (ADRs) |
| [`12_DATA_STREAMING_AND_LAKE_DESIGN.md`](system-design/12_DATA_STREAMING_AND_LAKE_DESIGN.md) | Data, Streaming & Lake Design |
| [`13_RELIABILITY_AND_SAFETY_ENGINEERING.md`](system-design/13_RELIABILITY_AND_SAFETY_ENGINEERING.md) | Reliability & Safety Engineering |
| [`14_SECURITY_AND_THREAT_MODEL.md`](system-design/14_SECURITY_AND_THREAT_MODEL.md) | Security & Threat Model |
| [`15_PERFORMANCE_AND_CAPACITY_BUDGETS.md`](system-design/15_PERFORMANCE_AND_CAPACITY_BUDGETS.md) | Performance & Capacity Budgets |
| [`16_OBSERVABILITY_AND_OPERATIONS.md`](system-design/16_OBSERVABILITY_AND_OPERATIONS.md) | Observability & Operations |

### `backend-engineering/` — simulation engine, edge gateway, API, pipeline, LLM integration, statistics, data modeling

| File | Topic |
|---|---|
| [`20_SIMULATION_ENGINE_ENGINEERING.md`](backend-engineering/20_SIMULATION_ENGINE_ENGINEERING.md) | Simulation Engine Engineering |
| [`21_EDGE_GATEWAY_CLOUDFLARE.md`](backend-engineering/21_EDGE_GATEWAY_CLOUDFLARE.md) | Edge Gateway (Cloudflare Workers + Durable Object) |
| [`22_API_AND_PROTOCOL_STANDARDS.md`](backend-engineering/22_API_AND_PROTOCOL_STANDARDS.md) | API & Protocol Standards |
| [`23_PIPELINE_PYTHON_SPARK_STANDARDS.md`](backend-engineering/23_PIPELINE_PYTHON_SPARK_STANDARDS.md) | Pipeline Engineering — Python, Spark, Docker |
| [`24_LLM_INTEGRATION_ENGINEERING.md`](backend-engineering/24_LLM_INTEGRATION_ENGINEERING.md) | LLM Integration Engineering |
| [`25_STATISTICS_AND_BENCHMARKING_METHOD.md`](backend-engineering/25_STATISTICS_AND_BENCHMARKING_METHOD.md) | Statistics & Benchmarking Method |
| [`26_DATA_MODELING_SQL_AND_STORAGE.md`](backend-engineering/26_DATA_MODELING_SQL_AND_STORAGE.md) | Data Modeling, SQL & Storage |

### `technical-architecture/` — frontend architecture, canvas and worker protocol, accessibility, SEO, monorepo and CI/CD

| File | Topic |
|---|---|
| [`30_FRONTEND_ARCHITECTURE.md`](technical-architecture/30_FRONTEND_ARCHITECTURE.md) | Frontend Architecture (Vite + TypeScript, Framework-Light) |
| [`31_CANVAS_RENDERING_AND_WORKER_PROTOCOL.md`](technical-architecture/31_CANVAS_RENDERING_AND_WORKER_PROTOCOL.md) | Canvas Rendering & Worker Protocol |
| [`32_ACCESSIBILITY_AND_I18N.md`](technical-architecture/32_ACCESSIBILITY_AND_I18N.md) | Accessibility & Internationalisation |
| [`33_PUBLIC_PAGE_SEO_AND_SHARING_RULES.md`](technical-architecture/33_PUBLIC_PAGE_SEO_AND_SHARING_RULES.md) | Public Page, SEO & Social Sharing Rules |
| [`34_MONOREPO_BUILD_AND_CI_CD.md`](technical-architecture/34_MONOREPO_BUILD_AND_CI_CD.md) | Monorepo, Build & CI/CD |

### `design-and-motion/` — control-room design system, data visualisation, motion, demo and video

| File | Topic |
|---|---|
| [`40_CONTROL_ROOM_DESIGN_SYSTEM.md`](design-and-motion/40_CONTROL_ROOM_DESIGN_SYSTEM.md) | Control-Room Design System |
| [`41_DATA_VISUALIZATION_STANDARDS.md`](design-and-motion/41_DATA_VISUALIZATION_STANDARDS.md) | Data Visualisation Standards |
| [`42_MOTION_AND_MICRO_INTERACTIONS.md`](design-and-motion/42_MOTION_AND_MICRO_INTERACTIONS.md) | Motion & Micro-Interactions |
| [`43_DEMO_VIDEO_AND_PRESENTATION_DESIGN.md`](design-and-motion/43_DEMO_VIDEO_AND_PRESENTATION_DESIGN.md) | Demo, Judge Mode & Video Presentation Design |

### `languages-and-tooling/` — standards per language and tool, writing standards, tech-stack registry

| File | Topic |
|---|---|
| [`50_TYPESCRIPT_STANDARDS.md`](languages-and-tooling/50_TYPESCRIPT_STANDARDS.md) | TypeScript Standards |
| [`51_JAVASCRIPT_HTML_CSS_STANDARDS.md`](languages-and-tooling/51_JAVASCRIPT_HTML_CSS_STANDARDS.md) | JavaScript, HTML & CSS Standards |
| [`52_PYTHON_STANDARDS.md`](languages-and-tooling/52_PYTHON_STANDARDS.md) | Python Standards |
| [`53_SQL_AND_SPARK_SQL_STANDARDS.md`](languages-and-tooling/53_SQL_AND_SPARK_SQL_STANDARDS.md) | SQL & Spark SQL Standards |
| [`54_SHELL_MAKE_DOCKER_YAML_TOML_STANDARDS.md`](languages-and-tooling/54_SHELL_MAKE_DOCKER_YAML_TOML_STANDARDS.md) | Shell, Make, Docker, YAML & TOML Standards |
| [`55_SCHEMAS_JSON_ZOD_MERMAID_MARKDOWN.md`](languages-and-tooling/55_SCHEMAS_JSON_ZOD_MERMAID_MARKDOWN.md) | Schemas, JSON, Zod, Mermaid & Markdown |
| [`56_TECHNICAL_WRITING_STANDARDS.md`](languages-and-tooling/56_TECHNICAL_WRITING_STANDARDS.md) | Technical Writing & Documentation Standards |
| [`57_TECH_STACK_REGISTRY.md`](languages-and-tooling/57_TECH_STACK_REGISTRY.md) | Tech Stack Registry |

### `quality-and-audits/` — testing strategy, pre-flight audits, agent directives, code review, QA matrix

| File | Topic |
|---|---|
| [`60_TESTING_STRATEGY.md`](quality-and-audits/60_TESTING_STRATEGY.md) | Testing Strategy |
| [`61_PREFLIGHT_AUDIT_CHECKLIST.md`](quality-and-audits/61_PREFLIGHT_AUDIT_CHECKLIST.md) | Pre-Flight Audit Checklist |
| [`62_AI_AGENT_OPERATING_DIRECTIVES.md`](quality-and-audits/62_AI_AGENT_OPERATING_DIRECTIVES.md) | AI Agent Operating Directives |
| [`63_CODE_REVIEW_STANDARDS.md`](quality-and-audits/63_CODE_REVIEW_STANDARDS.md) | Code Review Standards |
| [`64_MASTER_QA_MATRIX.md`](quality-and-audits/64_MASTER_QA_MATRIX.md) | Master QA Matrix |

### `helpers/` — executable support code (tested)

| File | Purpose |
|---|---|
| [`contrast.py`](helpers/contrast.py) | WCAG contrast checker for the design tokens (`python3 helpers/contrast.py`) |
| [`rng.ts`](helpers/rng.ts) | `mulberry32`, named split streams, deterministic `detLn`, exponential sampling |
| [`hash.ts`](helpers/hash.ts) | FNV-1a 64 state hashing over typed-array bytes |
| [`canonical-json.ts`](helpers/canonical-json.ts) | Canonical JSON for signing and hashing |
| [`hmac.ts`](helpers/hmac.ts) | Web Crypto HMAC-SHA256 sign/verify, timestamp window |
| [`stats.ts`](helpers/stats.ts) | Seeded paired bootstrap confidence intervals |
| [`meta-helpers.ts`](helpers/meta-helpers.ts) | `fitTitle`, safe JSON-LD script serialisation |
| [`helpers.test.ts`](helpers/helpers.test.ts) | Self-tests for all TypeScript helpers (10 tests) |
| [`check-meta.mjs`](helpers/check-meta.mjs) | Checks a built page's metadata, JSON-LD, skip link, inline-handler rules |
| [`audit.sh`](helpers/audit.sh) | The 14 grep audits (A1–A14) from module 62 |

`validate-pack.mjs` validates the development task tracker that shipped with
earlier revisions of this repo; the tracker was retired, so the script is kept
for reference only.

Verify the helpers:

```bash
cd docs/specs/instruction/helpers
tsc -p tsconfig.json --outDir /tmp/uf-helpers && cp package.json /tmp/uf-helpers/ && (cd /tmp/uf-helpers && node --test)
python3 contrast.py
```

## How the pieces fit

| Concern | Where it lives |
|---|---|
| What the system must do and its frozen contracts | `platform-specifications/02` |
| Kernel supremacy and determinism | `system-design/13`, `system-design/10` |
| How the AI stays advisory | `platform-specifications/04`, `backend-engineering/24` |
| How we know it works | `quality-and-audits/60`, `quality-and-audits/64` |
| How we avoid over-claiming | `backend-engineering/25`, `quality-and-audits/61` |
| Honest numbers in public material | `scripts/docs-check.mjs` (run as `pnpm docs:check`) validates README and `docs/validation/RESULTS.md` against the benchmark artefacts |

## Maintenance

Changes to these modules should go through the same review as code. After any
edit, re-check the internal links in this index.
