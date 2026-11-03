# UrbanFlow AI — Engineering Instruction Pack

> A rule-and-knowledge pack for building **UrbanFlow AI** (adaptive traffic-signal control with a Safety Kernel, safe emergency preemption and an advisory AI copilot) for the Meta Global AI Developer Hackathon, Indie track. Deadline: **Wed 2026-11-04, 21:00 ET** (target submission ≤ 15:00 ET). Feature freeze: **Mon 2026-11-02, night**.
>
> Written for AI coding agents and human engineers. It covers system design, backend, data, AI, security, testing and DevOps at the same depth as the frontend and design systems.

## Start here

1. Read [`state of agent/AGENTS.md`](state%20of%20agent/AGENTS.md) — reading order, Rules vs Skills, session protocol.
2. Open [`state of agent/tasks.json`](state%20of%20agent/tasks.json) — `session.next_up` is your task (guide: [`TRACKER_GUIDE.md`](state%20of%20agent/TRACKER_GUIDE.md)).
3. Read all 20 [rules](state%20of%20agent/rules/) (they are short), then the skills for your task.
4. Read the specs you need; always [`platform-specifications/01`](platform-specifications/01_PROJECT_MASTER_GUIDE.md) through `06`.

**Precedence when documents disagree:** Rules > platform-specifications 01–06 > other modules > Skills > task text > convenience.

## The one architecture rule

The deterministic controller and the **Safety Kernel** decide signals. The data pipeline only observes and stores. **AI only advises**: bounded proposal → zod validation → Kernel dry-run → digital-twin what-if → human Approve. Everything else in this pack serves that sentence.

## Conventions used in this pack

- 🔎 marks a provider or platform fact (limits, model IDs, prices) that must be verified against current official documentation before use.
- Placeholders `<DEVELOPER_NAME>`, `<DEVELOPER_EMAIL>`, `<GITHUB_HANDLE>` are filled by the human (Rule 09).
- Numbers in public material come only from the generated `results.json` (Rule 00).

## Directory index

### `platform-specifications/` — What we are building: vision, contracts, control spec, AI spec, rubric, source reconciliation

| File | Topic |
|---|---|
| [`01_PROJECT_MASTER_GUIDE.md`](platform-specifications/01_PROJECT_MASTER_GUIDE.md) | Project Master Guide & Quality Bar |
| [`02_DOMAIN_MODEL_AND_CONTRACTS.md`](platform-specifications/02_DOMAIN_MODEL_AND_CONTRACTS.md) | Domain Model & Frozen Contracts |
| [`03_TRAFFIC_CONTROL_SPECIFICATION.md`](platform-specifications/03_TRAFFIC_CONTROL_SPECIFICATION.md) | Traffic Control Specification |
| [`04_AI_COPILOT_AND_VISION_SPECIFICATION.md`](platform-specifications/04_AI_COPILOT_AND_VISION_SPECIFICATION.md) | AI Copilot & Vision Specification |
| [`05_HACKATHON_RUBRIC_AND_SUBMISSION.md`](platform-specifications/05_HACKATHON_RUBRIC_AND_SUBMISSION.md) | Hackathon Rubric, Schedule & Submission |
| [`06_SOURCE_DOCUMENT_RECONCILIATION.md`](platform-specifications/06_SOURCE_DOCUMENT_RECONCILIATION.md) | Source Document Reconciliation |

### `system-design/` — Architecture, ADRs, data/streaming, reliability and safety, security, performance, observability

| File | Topic |
|---|---|
| [`10_SYSTEM_ARCHITECTURE.md`](system-design/10_SYSTEM_ARCHITECTURE.md) | System Architecture |
| [`11_ARCHITECTURE_DECISION_RECORDS.md`](system-design/11_ARCHITECTURE_DECISION_RECORDS.md) | Architecture Decision Records (ADRs) |
| [`12_DATA_STREAMING_AND_LAKE_DESIGN.md`](system-design/12_DATA_STREAMING_AND_LAKE_DESIGN.md) | Data, Streaming & Lake Design |
| [`13_RELIABILITY_AND_SAFETY_ENGINEERING.md`](system-design/13_RELIABILITY_AND_SAFETY_ENGINEERING.md) | Reliability & Safety Engineering |
| [`14_SECURITY_AND_THREAT_MODEL.md`](system-design/14_SECURITY_AND_THREAT_MODEL.md) | Security & Threat Model |
| [`15_PERFORMANCE_AND_CAPACITY_BUDGETS.md`](system-design/15_PERFORMANCE_AND_CAPACITY_BUDGETS.md) | Performance & Capacity Budgets |
| [`16_OBSERVABILITY_AND_OPERATIONS.md`](system-design/16_OBSERVABILITY_AND_OPERATIONS.md) | Observability & Operations |

### `backend-engineering/` — Simulation engine, edge gateway, API, pipeline, LLM integration, statistics, data modeling

| File | Topic |
|---|---|
| [`20_SIMULATION_ENGINE_ENGINEERING.md`](backend-engineering/20_SIMULATION_ENGINE_ENGINEERING.md) | Simulation Engine Engineering |
| [`21_EDGE_GATEWAY_CLOUDFLARE.md`](backend-engineering/21_EDGE_GATEWAY_CLOUDFLARE.md) | Edge Gateway (Cloudflare Workers + Durable Object) |
| [`22_API_AND_PROTOCOL_STANDARDS.md`](backend-engineering/22_API_AND_PROTOCOL_STANDARDS.md) | API & Protocol Standards |
| [`23_PIPELINE_PYTHON_SPARK_STANDARDS.md`](backend-engineering/23_PIPELINE_PYTHON_SPARK_STANDARDS.md) | Pipeline Engineering — Python, Spark, Docker |
| [`24_LLM_INTEGRATION_ENGINEERING.md`](backend-engineering/24_LLM_INTEGRATION_ENGINEERING.md) | LLM Integration Engineering |
| [`25_STATISTICS_AND_BENCHMARKING_METHOD.md`](backend-engineering/25_STATISTICS_AND_BENCHMARKING_METHOD.md) | Statistics & Benchmarking Method |
| [`26_DATA_MODELING_SQL_AND_STORAGE.md`](backend-engineering/26_DATA_MODELING_SQL_AND_STORAGE.md) | Data Modeling, SQL & Storage |

### `technical-architecture/` — Frontend architecture, canvas and worker protocol, accessibility, public page/SEO, monorepo and CI/CD

| File | Topic |
|---|---|
| [`30_FRONTEND_ARCHITECTURE.md`](technical-architecture/30_FRONTEND_ARCHITECTURE.md) | Frontend Architecture (Vite + TypeScript, Framework-Light) |
| [`31_CANVAS_RENDERING_AND_WORKER_PROTOCOL.md`](technical-architecture/31_CANVAS_RENDERING_AND_WORKER_PROTOCOL.md) | Canvas Rendering & Worker Protocol |
| [`32_ACCESSIBILITY_AND_I18N.md`](technical-architecture/32_ACCESSIBILITY_AND_I18N.md) | Accessibility & Internationalisation |
| [`33_PUBLIC_PAGE_SEO_AND_SHARING_RULES.md`](technical-architecture/33_PUBLIC_PAGE_SEO_AND_SHARING_RULES.md) | Public Page, SEO & Social Sharing Rules |
| [`34_MONOREPO_BUILD_AND_CI_CD.md`](technical-architecture/34_MONOREPO_BUILD_AND_CI_CD.md) | Monorepo, Build & CI/CD |

### `design-and-motion/` — Control-room design system, data visualisation, motion, demo and video

| File | Topic |
|---|---|
| [`40_CONTROL_ROOM_DESIGN_SYSTEM.md`](design-and-motion/40_CONTROL_ROOM_DESIGN_SYSTEM.md) | Control-Room Design System |
| [`41_DATA_VISUALIZATION_STANDARDS.md`](design-and-motion/41_DATA_VISUALIZATION_STANDARDS.md) | Data Visualisation Standards |
| [`42_MOTION_AND_MICRO_INTERACTIONS.md`](design-and-motion/42_MOTION_AND_MICRO_INTERACTIONS.md) | Motion & Micro-Interactions |
| [`43_DEMO_VIDEO_AND_PRESENTATION_DESIGN.md`](design-and-motion/43_DEMO_VIDEO_AND_PRESENTATION_DESIGN.md) | Demo, Judge Mode & Video Presentation Design |

### `languages-and-tooling/` — Standards for every language and tool, writing standards, tech-stack registry

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

### `quality-and-audits/` — Testing strategy, pre-flight audits, agent directives, code review, master QA matrix

| File | Topic |
|---|---|
| [`60_TESTING_STRATEGY.md`](quality-and-audits/60_TESTING_STRATEGY.md) | Testing Strategy |
| [`61_PREFLIGHT_AUDIT_CHECKLIST.md`](quality-and-audits/61_PREFLIGHT_AUDIT_CHECKLIST.md) | Pre-Flight Audit Checklist |
| [`62_AI_AGENT_OPERATING_DIRECTIVES.md`](quality-and-audits/62_AI_AGENT_OPERATING_DIRECTIVES.md) | AI Agent Operating Directives |
| [`63_CODE_REVIEW_STANDARDS.md`](quality-and-audits/63_CODE_REVIEW_STANDARDS.md) | Code Review Standards |
| [`64_MASTER_QA_MATRIX.md`](quality-and-audits/64_MASTER_QA_MATRIX.md) | Master QA Matrix |

### `state of agent/` — rules, skills and tracking

| File | Purpose |
|---|---|
| [`AGENTS.md`](state%20of%20agent/AGENTS.md) | Operating manual: reading order, skill index, Self-Containment Law, Session Continuity Contract |
| [`TRACKER_GUIDE.md`](state%20of%20agent/TRACKER_GUIDE.md) | How `tasks.json` works |
| [`tasks.json`](state%20of%20agent/tasks.json) | Source of truth for work: tasks T0–T19, session block |
| [`pending-component-work.md`](state%20of%20agent/pending-component-work.md) | Open verifications (🔎), known debts, human-only actions |
| `archive/.gitkeep` | Placeholder for archived task history |

#### Rules (inviolable)

| File | Rule |
|---|---|
| [`00-honest-numbers.md`](state%20of%20agent/rules/00-honest-numbers.md) | Rule 00 — Honest Numbers (inviolable) |
| [`01-git-hygiene.md`](state%20of%20agent/rules/01-git-hygiene.md) | Rule 01 — Git Hygiene (inviolable) |
| [`02-gates.md`](state%20of%20agent/rules/02-gates.md) | Rule 02 — Gates (inviolable) |
| [`03-never-push.md`](state%20of%20agent/rules/03-never-push.md) | Rule 03 — Never Push, Deploy or Tag (inviolable) |
| [`04-task-discipline.md`](state%20of%20agent/rules/04-task-discipline.md) | Rule 04 — Task Discipline (inviolable) |
| [`05-branch-hygiene.md`](state%20of%20agent/rules/05-branch-hygiene.md) | Rule 05 — Branch Hygiene (inviolable) |
| [`06-safety-kernel-supremacy.md`](state%20of%20agent/rules/06-safety-kernel-supremacy.md) | Rule 06 — Safety Kernel Supremacy (inviolable) |
| [`07-determinism-and-purity.md`](state%20of%20agent/rules/07-determinism-and-purity.md) | Rule 07 — Determinism and Purity (inviolable) |
| [`08-ai-advises-never-controls.md`](state%20of%20agent/rules/08-ai-advises-never-controls.md) | Rule 08 — AI Advises, Never Controls (inviolable) |
| [`09-developer-identity.md`](state%20of%20agent/rules/09-developer-identity.md) | Rule 09 — Developer Identity (inviolable) |
| [`10-secrets-and-privacy.md`](state%20of%20agent/rules/10-secrets-and-privacy.md) | Rule 10 — Secrets and Privacy (inviolable) |
| [`11-zero-cost-and-licensing.md`](state%20of%20agent/rules/11-zero-cost-and-licensing.md) | Rule 11 — Zero Cost and Licensing (inviolable) |
| [`12-contracts-source-of-truth.md`](state%20of%20agent/rules/12-contracts-source-of-truth.md) | Rule 12 — Contracts Are the Source of Truth (inviolable) |
| [`13-accessibility-floor.md`](state%20of%20agent/rules/13-accessibility-floor.md) | Rule 13 — Accessibility Floor (inviolable) |
| [`14-performance-budgets-as-gates.md`](state%20of%20agent/rules/14-performance-budgets-as-gates.md) | Rule 14 — Performance Budgets Are Gates (inviolable) |
| [`15-feature-freeze-and-cut-line.md`](state%20of%20agent/rules/15-feature-freeze-and-cut-line.md) | Rule 15 — Feature Freeze and Cut Line (inviolable) |
| [`16-documentation-and-technical-writing.md`](state%20of%20agent/rules/16-documentation-and-technical-writing.md) | Rule 16 — Documentation and Technical Writing (inviolable) |
| [`17-testing-discipline.md`](state%20of%20agent/rules/17-testing-discipline.md) | Rule 17 — Testing Discipline (inviolable) |
| [`18-dependency-and-supply-chain.md`](state%20of%20agent/rules/18-dependency-and-supply-chain.md) | Rule 18 — Dependencies and Supply Chain (inviolable) |
| [`19-visual-fidelity-and-tokens.md`](state%20of%20agent/rules/19-visual-fidelity-and-tokens.md) | Rule 19 — Visual Fidelity and Tokens (inviolable) |

#### Skills (craft knowledge)

| Skill | Use when |
|---|---|
| [`accessibility/SKILL.md`](state%20of%20agent/skills/accessibility/SKILL.md) | Any UI work; before merging any front-end change; during the manual pass. |
| [`adaptive-controller/SKILL.md`](state%20of%20agent/skills/adaptive-controller/SKILL.md) | Changing the adaptive controller or its parameters. |
| [`api-design/SKILL.md`](state%20of%20agent/skills/api-design/SKILL.md) | Adding or changing an HTTP or WebSocket endpoint. |
| [`benchmarking-statistics/SKILL.md`](state%20of%20agent/skills/benchmarking-statistics/SKILL.md) | Running or reporting benchmarks. |
| [`canvas-rendering/SKILL.md`](state%20of%20agent/skills/canvas-rendering/SKILL.md) | Editing the intersection renderer, vehicle drawing, overlays or frame loop. |
| [`ci-cd-deployment/SKILL.md`](state%20of%20agent/skills/ci-cd-deployment/SKILL.md) | Editing CI workflows, build scripts or deployment steps. |
| [`code-standards/SKILL.md`](state%20of%20agent/skills/code-standards/SKILL.md) | Writing or reviewing any TypeScript, JS, CSS or HTML. |
| [`component-creation/SKILL.md`](state%20of%20agent/skills/component-creation/SKILL.md) | Creating a new UI component. |
| [`data-visualization/SKILL.md`](state%20of%20agent/skills/data-visualization/SKILL.md) | Creating or editing any chart, sparkline, heatmap or comparison view. |
| [`debug-playbook/SKILL.md`](state%20of%20agent/skills/debug-playbook/SKILL.md) | Diagnosing a failing test, wrong result, hash mismatch or deployment problem. |
| [`degradation-seams/SKILL.md`](state%20of%20agent/skills/degradation-seams/SKILL.md) | Adding any feature that depends on an optional service (Edge, AI, pipeline, vision). |
| [`design-system/SKILL.md`](state%20of%20agent/skills/design-system/SKILL.md) | Building or reviewing any UI component, panel or layout so it matches the control-room look. |
| [`edge-gateway/SKILL.md`](state%20of%20agent/skills/edge-gateway/SKILL.md) | Working on the Cloudflare Worker, Durable Object, routes or wrangler config. |
| [`evp-preemption/SKILL.md`](state%20of%20agent/skills/evp-preemption/SKILL.md) | Working on emergency vehicle detection, planning, or the EVP gateway. |
| [`folder-structure/SKILL.md`](state%20of%20agent/skills/folder-structure/SKILL.md) | Creating files or deciding where code lives. |
| [`hackathon-submission/SKILL.md`](state%20of%20agent/skills/hackathon-submission/SKILL.md) | Preparing submission materials; final week. |
| [`kafka-streaming/SKILL.md`](state%20of%20agent/skills/kafka-streaming/SKILL.md) | Producing to or consuming from Kafka topics. |
| [`lake-and-storage/SKILL.md`](state%20of%20agent/skills/lake-and-storage/SKILL.md) | Designing Parquet layout, retention or local object storage. |
| [`llm-copilot/SKILL.md`](state%20of%20agent/skills/llm-copilot/SKILL.md) | Building or changing the AI Copilot, diagnosis, chat tools or proposals. |
| [`motion/SKILL.md`](state%20of%20agent/skills/motion/SKILL.md) | Adding transitions, animations, or canvas effects. |
| [`observability/SKILL.md`](state%20of%20agent/skills/observability/SKILL.md) | Adding logs, metrics, health or debug tooling. |
| [`performance-budgets/SKILL.md`](state%20of%20agent/skills/performance-budgets/SKILL.md) | Profiling, optimising or reviewing performance. |
| [`prompt-engineering/SKILL.md`](state%20of%20agent/skills/prompt-engineering/SKILL.md) | Writing or revising prompts for the Copilot or for Muse Code. |
| [`python-standards/SKILL.md`](state%20of%20agent/skills/python-standards/SKILL.md) | Writing Python in pipeline/ or vision/. |
| [`resilience-chaos/SKILL.md`](state%20of%20agent/skills/resilience-chaos/SKILL.md) | Implementing degradation, fault injection or chaos mode. |
| [`responsive-system/SKILL.md`](state%20of%20agent/skills/responsive-system/SKILL.md) | Making layouts work from 320 px to ultrawide, or changing panel arrangement. |
| [`safety-kernel/SKILL.md`](state%20of%20agent/skills/safety-kernel/SKILL.md) | Any change touching the Kernel, ConflictMonitor, watchdog or request validation. |
| [`security-hardening/SKILL.md`](state%20of%20agent/skills/security-hardening/SKILL.md) | Anything crossing a trust boundary; before each deploy. |
| [`simulation-engine/SKILL.md`](state%20of%20agent/skills/simulation-engine/SKILL.md) | Working in packages/core/src/sim or metrics. |
| [`skill-maintenance/SKILL.md`](state%20of%20agent/skills/skill-maintenance/SKILL.md) | Updating this pack, rules or skills. |
| [`spark-pipeline/SKILL.md`](state%20of%20agent/skills/spark-pipeline/SKILL.md) | Working on the PySpark Structured Streaming job. |
| [`state-store/SKILL.md`](state%20of%20agent/skills/state-store/SKILL.md) | Adding UI state, derived values, or subscriptions. |
| [`technical-writing/SKILL.md`](state%20of%20agent/skills/technical-writing/SKILL.md) | Writing or editing any documentation. |
| [`testing-e2e-visual/SKILL.md`](state%20of%20agent/skills/testing-e2e-visual/SKILL.md) | Writing Playwright, axe or visual regression tests. |
| [`testing-property-based/SKILL.md`](state%20of%20agent/skills/testing-property-based/SKILL.md) | Writing property, exhaustive or differential tests. |
| [`theme-tokens/SKILL.md`](state%20of%20agent/skills/theme-tokens/SKILL.md) | Adding or changing colours, spacing, type or radii; touching tokens.css or theme switching. |
| [`vision-sam/SKILL.md`](state%20of%20agent/skills/vision-sam/SKILL.md) | Working in vision/: SAM segmentation, Muse Image scenes, Camera Mode data. |
| [`worker-protocol/SKILL.md`](state%20of%20agent/skills/worker-protocol/SKILL.md) | Changing messages between main thread and the simulation worker. |

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
| [`tsconfig.json`](helpers/tsconfig.json), [`package.json`](helpers/package.json) | Strict compile settings and ESM marker for the helpers |
| [`check-meta.mjs`](helpers/check-meta.mjs) | Checks a built page's metadata, JSON-LD, skip link, inline-handler rules |
| [`audit.sh`](helpers/audit.sh) | The 14 grep audits (A1–A14) from module 62 |
| [`validate-pack.mjs`](helpers/validate-pack.mjs) | Validates `tasks.json`, links, README index, rules/skills structure, residue |

Verify the helpers:

```bash
cd helpers
tsc -p tsconfig.json --outDir /tmp/uf-helpers && cp package.json /tmp/uf-helpers/ && (cd /tmp/uf-helpers && node --test)
python3 contrast.py
node validate-pack.mjs
```

## How the pieces fit

| Concern | Where it lives |
|---|---|
| What the system must do and its frozen contracts | `platform-specifications/02`, Rule 12 |
| Why Kernel supremacy and determinism | Rules 06, 07; `system-design/13`; skills `safety-kernel`, `simulation-engine` |
| How the AI stays advisory | Rule 08; `platform-specifications/04`; `backend-engineering/24` |
| How we know it works | Rule 17; `quality-and-audits/60`, `64` |
| How we avoid over-claiming | Rule 00; `backend-engineering/25`; `quality-and-audits/61` §3.2 |
| How we ship on time | Rule 15; `platform-specifications/05`; skill `hackathon-submission` |

## Maintenance

Change Rules only with human approval and an ADR. Improve Skills freely (skill `skill-maintenance`). After any edit run `node helpers/validate-pack.mjs`. Keep the Self-Containment Law: every file must stand on its own.
