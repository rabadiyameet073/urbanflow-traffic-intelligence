# pending-component-work.md — Known Debts & Open Decisions

> Living list of things consciously deferred or unverified. Each entry has an owner task. Remove entries when resolved (with evidence in `tasks.json`).

## Open Verifications (🔎 must be checked against current official docs before relying on them)

| ID | Item | Why it matters | Owner task |
|---|---|---|---|
| V1 | Cloudflare Workers/Durable Objects/Workers AI **free-plan limits** (requests, SQLite storage, WebSocket messages) | Zero-cost rule; hibernation design | T9 |
| V2 | Meta Model API: exact model IDs (`muse-spark-1.3`, non-contributor variant), rate limits, JSON-mode/tool-calling support, credit balance | AI adapter contract | T11 |
| V3 | SAM 3.1 availability/licence on Hugging Face; fallback version | Vision task | T12 (fallback T13) |
| V4 | Spark 3.5.x ↔ Kafka connector coordinates and Java version | Pipeline reproducibility | T10 |
| V5 | Devpost submission fields, track naming, video host rules | Submission | T18 |
| V6 | Muse Code access and prompt-log expectations | Meta tools criterion | T0 |

## Known Design Debts

| ID | Debt | Plan |
|---|---|---|
| D1 | Hash share links cannot carry per-run OG previews | Documented honestly (module 33); static OG card only |
| D2 | Mutation testing may not fit the schedule | Cut-line item (Rule 15); document if cut |
| D3 | HDFS/MinIO profiles optional | Cut early if time-boxed |
| D4 | Real-world datasets (UTD19/PeMS) not integrated | Out of scope; mention in LIMITATIONS |
| D5 | Multi-intersection coordination | Out of scope; LIMITATIONS |
| D6 | `docs/TEST_REPORT.md` is manually maintained; module 60 §7's report generator (`pnpm test:report`) does not exist | Generator needs a real test run to emit from; build on top of `vitest --reporter=json` in a session that can execute it |
| D7 | `bash helpers/audit.sh` copied into the repo (2026-10-31) but never executed; CI step is `continue-on-error` | Human runs it locally, reviews every `AUDIT-OK()` marker added in the modules 50–64 pass (docs/LIMITATIONS.md 35), then removes `continue-on-error` to make it the hard gate module 61 §1 intends |
| D8 | `pip-audit` CI step (Module 52 §1) added over both requirements files but `continue-on-error`, never run; `requirements-dev.txt` leaves `pytest`/`pydantic`/`numpy` unpinned (no version recorded in tree — Rule 00) | Human runs `pip-audit` once against a real install, pins the UNRECORDED dev deps from `pip freeze`, then drops `continue-on-error` |
| D9 | Lane-level control (Module 40 §5 `Stepper`, Module 43 §1 “lane steppers”) is not wired: canvas click-to-select, `+ / −` demand steppers and an incident-injection dialog. The blocker is that `LaneObservation` (`contracts.ts` §6) exposes no current `demandVph`, so the UI cannot show the true value without inventing one (Rule 00) or diverging from the worker (single-writer). The keyboard dialog was trimmed to stay honest (dead `← → ↑ ↓`/`+ −`/`I` rows removed) — docs/LIMITATIONS.md 36 | Add `demandVph` to `LaneObservation` behind an ADR + `schemaVersion` bump + N−1 reader + regenerated fixtures (Rule 12), then build the selector + steppers + incident dialog and verify focus/keyboard in a browser |
| D10 | `vercel.json` (root) + `docs/DEPLOY.md` §2b make the SPA Vercel-ready but **nothing is deployed** — no project linked, no Vercel URL, and the SVG-icon/elevation polish was reasoned statically, not rendered (docs/LIMITATIONS.md 37) | Human runs `npx vercel --prod` from a clean checkout, adds the Vercel origin to the edge `ALLOWED_ORIGINS` + sets `<meta name="urbanflow-api-base">`, reconciles `canonical`/`og:url` (Pages vs Vercel is one canonical), and eyeballs the icons/shadows in a real browser |

## Human-Only Actions Pending

- [ ] Fill developer identity placeholders (Rule 09): `<DEVELOPER_NAME>`, `<DEVELOPER_EMAIL>`, `<GITHUB_HANDLE>` — including `.github/CODEOWNERS`, which enforces nothing until the handle is real and "Require review from Code Owners" is enabled on main.
- [ ] Run `bash helpers/audit.sh` and review the `AUDIT-OK()` markers (debt D7).
- [ ] Run `pip-audit` against a real install and pin the UNRECORDED dev deps in `pipeline/requirements-dev.txt` (debt D8).
- [ ] Create GitHub repo, Cloudflare project; set secrets.
- [ ] Accept SAM/Llama licences on Hugging Face (Rule 11).
- [ ] Register on Devpost; create `submission-v1` tag.
