# Module 25: Statistics & Benchmarking Method

> How UrbanFlow produces numbers that survive a hostile reviewer. All public claims come from this pipeline (`packages/bench`).

---

## 1. Core Principles

1. **Paired design:** for each seed, run Fixed and Adaptive on the *identical* arrival stream; analyse per-seed differences.
2. **Train/held-out split:** tune parameters on seeds 1–100; publish results on seeds 1001+ only (ADR-016).
3. **Uncertainty always shown:** mean difference with a 95 % bootstrap CI; never a bare percentage.
4. **No cherry-picking:** all scenarios, all seeds, reported — including ties and losses.
5. **Censoring handled:** vehicles still in the system at the end are included (their waiting so far counts), or the run uses a warm-up and cool-down with both stated.
6. **Integrity counters:** denied entries, conservation check, safety violations (must be 0) appear in every report.
7. **Reproducibility:** `pnpm bench run --scenario all` regenerates `results.json` byte-for-byte on the same commit and seeds.

---

## 2. Experiment Design

| Item | Value |
|---|---|
| Duration | 1 simulated hour per run + 5 min warm-up (discarded) |
| Seeds | Train 1–100 (tuning only) · Held-out 1001–1050 (published) |
| Scenarios | 8-scenario library (below) |
| Controllers | `fixed-90s`, `adaptive` (tuned), optionally `adaptive-naive` (Gmin 7, no efficiency hold) as an ablation |
| Primary metric | Person-delay (s/person); secondary: avg delay, max queue, throughput, stops, bus/bike delay, EMS delay |
| Integrity | Denied %, conservation, kernel conflicts = 0 |

### 2.1 Reference Scenario Library (`packages/core/src/scenarios.ts`)

| id | Story | Demand (veh/h per lane group) | Expectation |
|---|---|---|---|
| `balanced-parity` | Steady balanced | TR 450 / L 150 | **Parity** (±5 %) |
| `balanced-high` | Steady balanced, busy | TR 700 / L 200 | **Parity** |
| `near-saturation` | Peak, near capacity | TR 1000 / L 300 | Adaptive ≥ parity |
| `light-night` | Night traffic | TR 200 / L 60 | Adaptive better |
| `ns-heavy-tide` | Morning tide, NS heavy | NS 800 / EW 150 | **Adaptive wins** |
| `stadium-dump` | Event release on one approach | EB 1500 for 15 min | Adaptive wins |
| `mixed-uneven` | Uneven, shifting demand | Randomised profile (seeded) | Adaptive wins |
| `blocked-lane-incident` | Lane blockage at t = 10 min | Balanced + incident | Adaptive ≥ parity; copilot demo |

Optional extras (P2): `bus-bunching`, `rain-capacity-drop`, `school-dismissal`. **Expectation tags shown in the UI are read from `results.json` at build time — never typed.**

---

## 3. Delay Definition

`delay_i = (t_exit − t_entry) − t_freeflow(lane, type)`; free-flow = distance (approach + box) / min(speedLimit, type max). Vehicles in the system at the end contribute `(t_end − t_entry) − t_freeflow_so_far`. Person-delay uses `pax` from `VEHICLE_SPECS` (bus 45, car 1.4, bike 1, truck 1).

---

## 4. Bootstrap Confidence Interval (paired)

For per-seed paired differences `d_s = metric_fixed(s) − metric_adaptive(s)`:

```
point  = mean(d)
CI     = percentile bootstrap, B = 10 000 resamples of seeds with replacement, 2.5th–97.5th percentile
rel %  = 100 · point / mean(metric_fixed)         (reported with its own bootstrap CI)
```

Reference implementation: `helpers/stats.ts` (seeded resampling so the CI itself is reproducible).

Reporting language rules:
- "Adaptive reduced person-delay by **X %** (95 % CI [a, b], n = 50 held-out seeds, scenario *ns-heavy-tide*)."
- If the CI includes 0: say **"no significant difference (parity)"**.
- Never pool scenarios into a single headline number without showing each one.

---

## 5. Tuning Protocol

1. Grid/random search over `AdaptiveParams` (bounded) on **train seeds** across *all* scenarios; objective = mean person-delay with a **penalty** for any scenario where adaptive is > 5 % worse than fixed.
2. Freeze parameters; record in `packages/core/src/control/params.tuned.json` with the git commit.
3. Evaluate once on held-out seeds. If the gap between train and held-out improvement is large (> ≈ 5 points), report it and consider the tuning overfit.
4. **Never** re-tune after looking at held-out results (if you must, burn a new held-out seed block and say so).

---

## 6. Regression Gate

`pnpm test regression`: adaptive must never be > 5 % worse than fixed (person-delay, point estimate) in any scenario on a fixed small seed set (CI-sized: 10 seeds, 20 sim-min). The full held-out run is a release step.

---

## 7. EVP Sweep (Task 4/5)

Detection distances 150 / 300 / 500 m × 40 seeds: mean ± 95 % CI of `emsDelayS` for `fixed` vs `adaptive+EVP`; also the share of `TIGHT` plans and mean shortfall. Output `ems-sweep.json`. Narrative: why 150 m cannot work (ETA 10 s < ≈ 13.5 s + queue flush).

---

## 8. Equity & Environment Ledger

- Person-delay, bus delay, bike delay reported separately (equity).
- Idle fuel = Σ(idle seconds × per-class L/h ÷ 3600); CO₂ = fuel × factor (gasoline 2.31, diesel 2.68 kg/L). All factors are **assumptions** shown in an "assumptions" popover and in `RESULTS.md`.

---

## 9. `results.json` Schema (sketch)

```json
{
  "schemaVersion": 1,
  "commit": "abc1234", "createdAt": "…", "environment": { "node": "…", "cpu": "…" },
  "seeds": { "train": [1,100], "heldOut": [1001,1050] },
  "params": { "adaptive": { "G_MIN_EFFICIENT_S": 25, "RATIO": 3, "FLOOR": 8 } },
  "scenarios": [{
    "id": "ns-heavy-tide",
    "metrics": { "personDelayS": { "fixed": 0, "adaptive": 0, "diff": 0, "diffCI95": [0,0], "relPct": 0, "relCI95": [0,0] } },
    "integrity": { "deniedPct": 0, "conservationOk": true, "kernelConflicts": 0 }
  }]
}
```

`docs/RESULTS.md` and the UI expectation tags are generated from this file. `pnpm docs:check` fails if README numbers differ.

---

## 10. Things We Never Claim

| ❌ Claim | Why |
|---|---|
| "−38 % everywhere" | Scenario-dependent; some are parity |
| Any number from the Appendix-F sanity model | It is a design check, not a result |
| Real-world percentages | It is a simulation on a documented model |
| Cluster-scale pipeline throughput | Single-node local Spark |
| Hardware fail-safe timing | Simulated watchdog only |
| AI accuracy without the eval table | Not measured |

---

## 11. Report Template (`docs/RESULTS.md`, generated)

1. Headline table: scenario × (fixed, adaptive, Δ %, CI, verdict ∈ {adaptive wins, parity, adaptive loses}).
2. Integrity table: denied %, conservation, conflicts.
3. EVP sweep table + the TIGHT explanation.
4. Equity (bus, bike) and environment ledger with assumptions.
5. Train vs held-out gap.
6. Method summary (seeds, duration, warm-up, bootstrap B) and the command to reproduce.
7. Limitations.
