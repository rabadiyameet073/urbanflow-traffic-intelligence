# Rule 16 — Documentation and Technical Writing (inviolable)

Docs are part of the product and the score. They change in the same commit as the behaviour they describe.

## Protocol

1. A change to behaviour, contract, command, budget or architecture updates the affected docs **in the same commit** (README, `docs/`, ADR, module/skill if it is a rule-level change).
2. One source of truth: link, do not copy. Generated sections are marked `<!-- generated: do not edit -->`.
3. Every command in docs runs from a clean clone; `pnpm fresh-clone` proves the key ones.
4. Required docs exist and are current by submission: README, ARCHITECTURE, ADRs, SAFETY_CASE, RESULTS (generated), LIMITATIONS, DEPLOY, API, DEMO_SCRIPT, CREDITS, TEST_REPORT, muse-prompts/, SECURITY (module 56 §2).
5. Style: active voice, concrete numbers with units and sources, defined terms, no unearned superlatives (module 56 §3).
6. Mermaid diagrams must render (`mmdc`) and carry a text description.
7. Dates are absolute ISO. Provider facts carry 🔎 or a verified-on date.
8. LIMITATIONS lists everything simulated, assumed or unmeasured; it is never softened to look better.
9. Muse prompt log records prompts, outcomes and honest failures (module 56 §7).

## Good / Bad

| ✅ | ❌ |
|---|---|
| Kernel change + test + SAFETY_CASE row in one commit | "Docs later" |
| Link to the test enforcing a claim | "See the code" |

## Enforcement

`pnpm docs:check` (links, anchors, Mermaid render, markdownlint), claims audit, `audit.sh` A12, review checklist §2.7.
