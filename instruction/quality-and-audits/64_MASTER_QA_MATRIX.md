# Module 64: Master QA Matrix

> 33 acceptance checks. Each has an ID, what is verified, how, and the pass criterion. The generated `docs/TEST_REPORT.md` fills the **Result** column from machine output. A row with no evidence counts as failed.

Legend — Layer: S safety, D determinism, F frontend, B backend/edge, P pipeline, A AI, X cross-cutting.

| ID | L | Check | How | Pass criterion |
|---|---|---|---|---|
| QA-01 | S | No conflicting greens ever (I1) | Property + BFS + differential | 0 violations across ≥ 10⁴ traces; BFS exhaustive |
| QA-02 | S | Min green / yellow / all-red respected (I2–I4) | Property + unit | 0 violations |
| QA-03 | S | Max red wait bounded (I5) | Scenario + property | No lane > 120 s in all 8 scenarios |
| QA-04 | S | Watchdog forces FLASH_RED on stall (I6) | Chaos test | Within spec time; recovery via ALL_RED |
| QA-05 | S | Kernel rejects illegal controller/AI requests with reason codes | Unit + fuzz | 100 % of illegal inputs rejected, codes match catalogue |
| QA-06 | S | Kernel mutation score | Stryker (kernel) | ≥ 85 % (or each survivor documented) |
| QA-07 | D | Same seed ⇒ same state hash (3 runs) | Vitest | Identical |
| QA-08 | D | Node vs Chromium hash equality | Playwright + Node | Identical hash after N ticks |
| QA-09 | D | Render rate independence | Test with 30/60/144 Hz accumulators | Identical hash |
| QA-10 | D | Replay reproduces run | Record → replay | Identical hash |
| QA-11 | S | EVP feasibility classification correct incl. TIGHT and INFEASIBLE (e.g., 150 m case) | Fixtures | All classes reproduced; ETA math matches spec |
| QA-12 | S | EVP clears ambulance within planned ETA when ACCEPTED | Scenario | Δ ≤ tolerance; no I1–I6 violation |
| QA-13 | B | HMAC verification (valid/invalid/expired/replay) | Edge tests | Correct status/code in each |
| QA-14 | B | Input bounds & size limits | Fuzz | No 5xx; 4xx with envelope |
| QA-15 | B | Rate limiting works and does not lock out normal use | Load test | 429 beyond limit; normal flow unaffected |
| QA-16 | B | Durable Object restart/hibernation retains nonce state | Miniflare test | Replay still rejected after resume |
| QA-17 | A | Model output schema enforcement | Adversarial fixtures | 100 % malformed/injected outputs → safe fallback |
| QA-18 | A | Template fallback works with Meta API down | Chaos | UI labelled "template", no errors |
| QA-19 | A | AI cannot change signals without Human Approve + Kernel dry-run | E2E + unit | No path found; audit A7 clean |
| QA-20 | A | LLM eval score tracked | Evals | ≥ stated threshold; reported honestly |
| QA-21 | P | Spark window aggregation matches expected Parquet on fixture | pytest | Exact match |
| QA-22 | P | Late/bad records → DLQ, not crash | pytest/integration | Counted in `dlq` topic/metrics |
| QA-23 | P | Anomaly rules TP/TN/boundary | pytest | All cases pass |
| QA-24 | P | Lite mode parity with full pipeline | Fixture diff | Same aggregates |
| QA-25 | P | `make demo` from clean clone | Fresh-clone script | Succeeds; time recorded |
| QA-26 | F | Accessibility: axe zero serious/critical; keyboard-only complete | Playwright + manual | 0 violations; all E5 steps pass |
| QA-27 | F | Contrast tokens meet WCAG 2.2 AA both themes | `helpers/contrast.py` | 0 failing pairs |
| QA-28 | F | Reduced motion & forced colours | E6 | Functional, no motion > spec |
| QA-29 | F | Responsive 320/768/1440 | E10 | No horizontal scroll; controls usable |
| QA-30 | X | Performance budgets: ≥100× sim, frame p95 ≤ 20 ms, ≤ 350 KB gz JS, Lighthouse 85/95/95 | `pnpm perf` | All thresholds met on deployed URL |
| QA-31 | X | Security headers, CSP, no secrets in bundle/history | curl + gitleaks | All present; 0 findings |
| QA-32 | X | Benchmark integrity: paired seeds, held-out, bootstrap CI, results.json hash | Bench script | Reproduces headline numbers ± 0 on re-run |
| QA-33 | X | Docs integrity: links, Mermaid renders, claims audit, README numbers generated | `docs:check` + module 61 §3.2 | 0 broken links; 0 unsupported claims |

---

## Reporting Format (generated per run)

```markdown
| ID | Result | Evidence | Commit | Date |
|---|---|---|---|---|
| QA-01 | PASS | BFS 48,213 states; 10,000 traces | abc1234 | 2026-11-03 |
```

Rules:
1. Results come from scripts; humans may annotate but not flip a FAIL.
2. A FAIL blocks submission unless the item is explicitly cut by Rule 15 **and** documented in LIMITATIONS.
3. Matrix IDs are stable; new checks get new IDs, never reuse.
4. Mapping to rubric: QA-01…06, 11, 12 → Technical Execution (safety); QA-07…10, 32 → Technical Execution (rigor); QA-17…20 → Meta tools & Innovation; QA-21…25 → Big-data pipeline evidence; QA-26…29 → UX/Design; QA-30, 31 → Quality; QA-33 → Presentation.
