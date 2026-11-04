# Module 56: Technical Writing & Documentation Standards

> Documentation is part of the product and part of the score (judges read the README and `docs/`). Write so a tired engineer at 2 a.m. — or a judge with three minutes — gets the right answer.

---

## 1. Principles

1. **Reader first.** Name the reader and their goal at the top of each document.
2. **Truth over polish.** Every claim is verifiable (command, file, generated number). Remove unverifiable adjectives.
3. **Docs live with code.** A change that alters behaviour updates docs in the **same commit** (Rule 16).
4. **One source of truth.** Link, don't copy. Generated content is marked and regenerated, never hand-edited.
5. **Show, then explain.** Runnable commands and examples before theory.
6. **Honest limits.** State what is not done, not claimed, not measured.

---

## 2. Document Types & Templates

| Type | Location | Required content |
|---|---|---|
| **README** | root | One-sentence pitch · live URL + video · 5-command quickstart · architecture picture · headline measured results (generated) · honest limitations link · licence · credits |
| **ARCHITECTURE** | `docs/ARCHITECTURE.md` | Context, containers, trust boundaries, run modes, versions pinned |
| **ADR** | `docs/adr/NNN-*.md` | Template in module 11 |
| **SAFETY_CASE** | `docs/` | Claims → arguments → executable evidence (module 13) |
| **RESULTS** | `docs/` (generated) | Module 25 report template |
| **LIMITATIONS** | `docs/` | Everything simulated/assumed/unmeasured; what a real deployment would need |
| **DEPLOY** | `docs/` | Exact commands, secrets setup, rollback, last-verified date |
| **Runbooks** | `docs/runbooks/` | Symptom → check → fix → verify (≤ 1 page) |
| **API** | `docs/API.md` | Routes, schemas, examples, errors |
| **DEMO_SCRIPT** | `docs/` | Module 43 |
| **muse-prompts/** | `docs/muse-prompts/NN-name.md` | Prompt used, date, tool/model, outcome, fixes needed |
| **CHANGELOG** | root | Human highlights + generated list |
| **SECURITY** | root | How to report; scope; no secrets policy |
| **TEST_REPORT** | `docs/` (generated) | QA matrix results with timestamps and commit |

### 2.1 README opening (pattern)

```markdown
# UrbanFlow AI
Adaptive traffic-signal control with safe emergency preemption — a simulation you can open in a browser.
**Live demo:** <url> · **3-min video:** <url> · **Results:** [docs/RESULTS.md](docs/RESULTS.md) (generated)

> Simulation only. Not connected to real roads. See [LIMITATIONS](docs/LIMITATIONS.md).
```

---

## 3. Writing Style

| Do | Don't |
|---|---|
| Active voice, present tense: "The Kernel clamps illegal requests." | "Illegal requests will be handled by the Kernel." |
| Short sentences (≤ 25 words); one idea per paragraph | Walls of text |
| Concrete numbers with units and source | "very fast", "highly optimised" |
| Define terms once (glossary) and reuse exactly | Synonym drift (phase/stage/state for the same thing) |
| Imperative for procedures: "Run `pnpm verify`." | "You might want to run…" |
| Parallel structure in lists | Mixed fragments and sentences |
| Spell out acronyms at first use (EVP, LOS, HMAC) | Unexplained jargon |
| Plain words ("use", "start") | "utilise", "leverage" |

Words that need evidence or removal: *robust, seamless, cutting-edge, revolutionary, state-of-the-art, blazing, production-ready, guaranteed, 100 % safe*.

---

## 4. Structure Rules

1. Title → one-paragraph purpose → prerequisites → steps → verification → troubleshooting → references.
2. Procedures: numbered steps, each one action, with the **expected output** shown.
3. Every command block states where it is run (repo root unless stated) and is copy-paste safe.
4. Tables for specs/comparisons; prose for reasoning; diagrams for flows (with a text description).
5. Link to the code/test that enforces a statement (`packages/core/src/control/kernel/…`).
6. Dates are absolute (`2026-10-29`), never "yesterday".

---

## 5. Code Comments & Docstrings

- Public API: JSDoc/docstring with purpose, units, invariants, errors, example when non-obvious.
- Inline comments explain *why*, reference ADR/rule/test names, and are kept ≤ 2 lines.
- No commented-out code; delete it (git remembers).
- Safety-relevant code carries `// SAFETY:` comments linking to the invariant ID (I1–I6).

---

## 6. Review Checklist for Docs (part of PR review)

- [ ] Audience and goal clear in the first paragraph.
- [ ] Every command runs from a clean clone (`pnpm fresh-clone` covers key ones).
- [ ] Every number is generated or labelled an assumption with its source.
- [ ] Links resolve; anchors exist (`pnpm docs:check`).
- [ ] Diagrams render (`mmdc`) and have text descriptions.
- [ ] Limitations stated where claims are made.
- [ ] No secrets, personal data, or private URLs.
- [ ] Spell-check and terminology consistent with the glossary.

---

## 7. Muse Prompt Log Entry (evidence for the Meta-tooling score)

```markdown
# 03 – Controllers + Safety Kernel
- Date: 2026-10-28 · Tool: Muse Code · Model: <id> · Session: <n>
- Prompt: (full text or link to `prompts/03.txt`)
- Outcome: 1 pass / 2 fix prompts
- Verification: pnpm verify green (212 tests), BFS explored 48,213 states
- Issues Muse introduced: `Math.random` in a helper → removed (caught by lint rule)
- Lessons: add the "no Math.random" line earlier in MUSE_CONTEXT
```

Rules: no secrets in prompts; record failures honestly; numbers in the log come from real command output.

---

## 8. Anti-Patterns

| ❌ | ✅ |
|---|---|
| README claims "−38 %" | Generated headline with CI and scenario |
| "See the code" | Link to the specific file/test |
| Doc written after the fact from memory | Written with the change |
| Duplicate explanations in 3 files | One canonical + links |
| Screenshots as the only source of a number | Numbers in text, screenshots as illustration |
| Undated "Last updated" | ISO date + commit |
