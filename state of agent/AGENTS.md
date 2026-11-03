# AGENTS.md — UrbanFlow AI Agent Operating Manual

> Read this first, every session. It tells you what to read, what is inviolable (Rules), what is craft (Skills), and how to hand work over cleanly. Applies to every AI agent and every human contributor.

**Project:** UrbanFlow AI — adaptive traffic-signal control with a Safety Kernel, safe emergency preemption and an advisory AI copilot, built for the Meta Global AI Developer Hackathon (Indie track). **Deadline:** 2026-11-04 21:00 ET (target submit ≤ 15:00 ET). **Feature freeze:** Mon 2026-11-02, night.

---

## 1. Reading Order (mandatory)

1. This file.
2. `tasks.json` → `session.next_up` and the task's acceptance criteria.
3. `TRACKER_GUIDE.md` (once per session if unfamiliar).
4. `rules/` — all 20 files. They are short; none may be skipped.
5. The `skills/*/SKILL.md` for the task at hand (see §3 index).
6. The relevant spec modules: `platform-specifications/01–06` always; others per task (`system-design/`, `backend-engineering/`, `technical-architecture/`, `design-and-motion/`, `languages-and-tooling/`, `quality-and-audits/`).
7. `pending-component-work.md` for known debts touching your area.

Precedence when documents disagree: **Rules > platform-specifications 01–06 > other modules > Skills > task text > convenience.** Report the conflict in the session block; do not silently pick.

---

## 2. Rules vs Skills

| | Rules (`rules/`) | Skills (`skills/*/SKILL.md`) |
|---|---|---|
| Nature | Inviolable. Violation = defect, no exceptions without a human-approved ADR | Craft knowledge: how to do a kind of work well |
| Form | Protocol, Good/Bad, Enforcement | Rules of thumb, Good/Bad, Landmines |
| Change | Human + ADR | Agent may propose edits via `skill-maintenance` |
| Checked by | Gates, grep audits, CI | Review |

---

## 3. Skill Index

| Area | Skills |
|---|---|
| Frontend & design | `theme-tokens`, `design-system`, `data-visualization`, `responsive-system`, `motion`, `accessibility`, `canvas-rendering`, `worker-protocol`, `state-store`, `component-creation`, `folder-structure`, `code-standards` |
| Core & control | `simulation-engine`, `safety-kernel`, `adaptive-controller`, `evp-preemption`, `benchmarking-statistics`, `degradation-seams` |
| Backend & data | `edge-gateway`, `api-design`, `kafka-streaming`, `spark-pipeline`, `lake-and-storage`, `python-standards` |
| AI & vision | `llm-copilot`, `prompt-engineering`, `vision-sam` |
| Platform & quality | `security-hardening`, `observability`, `resilience-chaos`, `testing-property-based`, `testing-e2e-visual`, `performance-budgets`, `ci-cd-deployment` |
| Process | `technical-writing`, `debug-playbook`, `skill-maintenance`, `hackathon-submission` |

---

## 4. The Self-Containment Law

Every file in this pack must be understandable without the original background documents. If you must consult a source, extract the fact into the right module (with its reconciliation entry in `platform-specifications/06`) and cite the module, not the source. A rule or skill that says "see the other doc" without content is a defect.

---

## 5. Session Continuity Contract

Sessions end without warning. Therefore:

1. **Start:** read `tasks.json`; trust it over memory. If `session.pending_verifications` is non-empty, do those first.
2. **During:** update the task's status when you start (`in_progress`) and when you finish (`done`). Only one task `in_progress` unless the human says otherwise.
3. **Commit often** (small, explicit paths). Every commit leaves the tree green or records why not.
4. **End:** update `session` block: `branch`, `tip` (short SHA), `unpushed` (count), `next_up`, `pending_verifications`, `last_updated` (ISO date), `updated_by`.
5. **Never push, deploy or tag** (Rule 03). Print the exact commands for the human.
6. **Hand-off message:** what changed · evidence (command output summary) · next step · open risks/blockers.

---

## 6. The Seven Reflexes

1. *Is this the Kernel's decision?* → If it touches signals, only the Kernel acts.
2. *Is this pure?* → In `core`, no time/random/IO.
3. *Is this number real?* → From `results.json` or labelled assumption.
4. *Is this input trusted?* → Validate at every boundary.
5. *Can a keyboard/screen-reader user do it?* → Accessibility floor.
6. *Did I run it?* → Quote output or say "not verified".
7. *Is this inside the cut line?* → Respect Rule 15.

---

## 7. Quick Commands

```bash
pnpm verify              # typecheck, lint, tests (unit/property/BFS/differential), docs, size
pnpm e2e                 # Playwright (E1–E10) + axe
pnpm perf                # budgets
pnpm bench               # paired-seed benchmark → results.json
make demo                # Kafka + Spark (Lite mode: UF_LITE=1)
bash helpers/audit.sh    # grep audits (module 62)
node helpers/validate-pack.mjs   # validates tasks.json + pack links
```

---

## 8. Escalate to the Human When

- A Rule would need to be broken. · A contract (module 02) must change. · Provider limits/prices differ from 🔎-marked assumptions. · Anything requires spending money, pushing, deploying, tagging, accepting a model licence, or handling a secret. · Two attempts at the same blocker failed.
