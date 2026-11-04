# UrbanFlow AI — Benchmark Results & Statistical Ledger

Every number on this page is read out of the two artefacts committed next to it:

- [`packages/bench/out/results.json`](../../packages/bench/out/results.json) — paired-seed scenario benchmark
- [`packages/bench/out/ems-sweep.json`](../../packages/bench/out/ems-sweep.json) — EVP detection-distance sweep

Nothing here is hand-entered. If a number in this document disagrees with the JSON, the JSON is correct and this document is wrong.

---

## 1. Method

| Item | Value |
|---|---|
| Held-out seeds | `1001, 1002, 1003, 1004, 1005` (5 seeds, never used for tuning) |
| Scenario duration | 600 s simulated per run, fixed step `dt = 0.1 s` |
| Pairing | Each seed runs fixed-time and adaptive under identical demand, modal split and geometry |
| Primary metric | `personDelayS` — total delay weighted by vehicle occupancy (Module 02 §4) |
| Statistic | **Mean of per-seed relative differences**, not the ratio of two means |
| Interval | Seeded percentile bootstrap, 10 000 resamples, 95 % |
| Reproduce | `pnpm --filter @urbanflow/bench bench` |

`relPct` is the mean of `(fixed_i − adaptive_i) / fixed_i` across seeds. **Positive means Adaptive produced less person-delay.** The confidence interval describes that same per-seed statistic, so an interval that contains zero means the run set did not resolve a winner — a point estimate alone never does.

Why not the ratio of two means: with 5 seeds, the two quantities can disagree in both sign and magnitude. The per-seed difference is the quantity that pairs the runs and is what the interval is built on.

---

## 2. Primary Result — Person-Delay

<!-- generated: do not edit -->
<!-- Source: packages/bench/out/results.json — regenerate with `pnpm --filter @urbanflow/bench bench` (Module 55 §4). -->
| Scenario | Fixed | Adaptive | Δ mean (s) | relPct | 95 % CI (relPct) | CI excludes 0 | Stated expectation | Outcome |
|---|---|---|---|---|---|---|---|---|
| Balanced Parity | 98.50 s | 79.38 s | +19.12 | **+18.9 %** | [−1.5, +39.2] | no | parity | parity (not resolved) |
| Balanced High Traffic | 128.60 s | 117.05 s | +11.55 | **+9.0 %** | [+0.4, +17.7] | **yes** | parity | Adaptive ahead of parity |
| Near Saturation | 141.13 s | 145.55 s | −4.41 | **−4.8 %** | [−19.9, +8.8] | no | adaptive ≥ parity | **not met** (point estimate favours fixed) |
| Light Night Traffic | 59.14 s | 40.07 s | +19.08 | **+24.8 %** | [+4.2, +48.9] | **yes** | adaptive wins | **met** |
| North–South Heavy Tide | 106.70 s | 80.28 s | +26.41 | **+24.8 %** | [+18.0, +31.6] | **yes** | adaptive wins | **met** |
| Stadium Surge Dump | 86.69 s | 92.70 s | −6.00 | **−12.3 %** | [−36.7, +7.2] | no | adaptive wins | **not met** (point estimate favours fixed) |
| Mixed Uneven | 101.24 s | 91.21 s | +10.03 | **+9.0 %** | [−2.3, +20.3] | no | adaptive wins | inconclusive |
| Blocked Lane Incident | 107.43 s | 84.10 s | +23.34 | **+20.7 %** | [+2.0, +39.3] | **yes** | adaptive ≥ parity | **met** |

Reading the table honestly:

- **4 of 8** scenarios have a 95 % interval that excludes zero, and all four favour Adaptive.
- **2 of 8** point estimates favour Fixed (Near Saturation, Stadium Surge); neither interval excludes zero, so neither is evidence that Fixed is better.
- **2 of 8** favour Adaptive with intervals that straddle zero — real-looking direction, unresolved magnitude.
- **2 expectations are not met** on the point estimate. That is reported as-is rather than reframed; the "Stadium Surge Dump" scenario was designed to show a surge advantage and does not.

The defensible claim is therefore narrow: *Adaptive is never significantly worse than fixed-time on this seed set, and is significantly better on 4 of 8 scenarios.* Any stronger headline is not supported by these intervals.

---

## 3. Secondary Metrics

Throughput and denied-entry rate are not paired statistics in this run — they are totals over the same 5 seeds, reported with both values side by side.

<!-- generated: do not edit -->
<!-- Source: packages/bench/out/results.json — regenerate with `pnpm --filter @urbanflow/bench bench` (Module 55 §4). -->
| Scenario | Throughput fixed (veh/h) | Throughput adaptive (veh/h) | Exited fixed | Exited adaptive | Denied fixed | Denied adaptive |
|---|---|---|---|---|---|---|
| Balanced Parity | 1 028 | 1 753 | 857 | 1 461 | 11.64 % | 0.05 % |
| Balanced High Traffic | 1 105 | 2 008 | 921 | 1 673 | 30.80 % | 12.30 % |
| Near Saturation | 1 268 | 2 233 | 1 057 | 1 861 | 43.94 % | 29.43 % |
| Light Night Traffic | 666 | 877 | 555 | 731 | 0.00 % | 0.00 % |
| North–South Heavy Tide | 1 157 | 1 661 | 964 | 1 384 | 19.55 % | 4.74 % |
| Stadium Surge Dump | 896 | 1 672 | 747 | 1 393 | 39.47 % | 23.57 % |
| Mixed Uneven | 998 | 1 626 | 832 | 1 355 | 21.45 % | 7.81 % |
| Blocked Lane Incident | 1 032 | 1 794 | 860 | 1 495 | 14.66 % | 0.77 % |

Adaptive discharged more vehicles in **8 of 8** scenarios and denied fewer entries in **6 of 8** (the other two are zero-denial for both controllers).

Note the tension with Section 2: throughput rises even where person-delay does not fall. Serving more vehicles sooner and reducing the delay of the vehicles already present are different objectives, and short queues can improve one while hurting the other. Both columns are reported together for exactly that reason.

---

## 4. Integrity & Conservation Audit

| Check | Result |
|---|---|
| `arrivals = exited + inSystem + denied` | **true** in all 8 scenarios, both controllers |
| Safety Kernel invariant conflicts | **0** in all 8 scenarios, both controllers |
| NaN / Infinity in reported metrics | none — `isFiniteDeep` guard on the edge, `Number.isFinite` assertions in the bench |

A conflict count of zero is not self-certified by the benchmark: `SafetyKernel.getMetrics().conflicts` is summed for both controllers and written into `integrity.kernelConflicts`. Earlier revisions hard-coded this field to `0`; that is no longer the case.

---

## 5. Emergency Vehicle Preemption Sweep

Source: [`packages/bench/out/ems-sweep.json`](../../packages/bench/out/ems-sweep.json) — seeds 42–46, 60 s warm-up (so the ambulance meets an existing queue), then a 180 s measurement window.

The emergency vehicle is spawned at its **physical** detection distance via `SimEngine.spawnEmsAt`, so a 150 m run really starts 150 m from the stop line. The approach is lengthened to `distance + 60 m` so the vehicle fits; `laneLengthM` is reported per row because a longer approach also adds storage, which is a genuine confound and not hidden.

<!-- generated: do not edit -->
<!-- Source: packages/bench/out/ems-sweep.json — regenerated by the same `pnpm bench` run (Module 55 §4). -->
| Detection distance | Approach | Fixed EMS delay | Adaptive EMS delay | Paired Δ (fixed − adaptive) | 95 % CI | Plan status |
|---|---|---|---|---|---|---|
| 150 m | 300 m | 13.90 s | 13.43 s | +0.47 s | [−13.96, +20.60] | **TIGHT — 5/5 runs** |
| 300 m | 360 m | 42.57 s | 56.67 s | −14.10 s | [−44.52, +25.64] | OK — 5/5 runs |
| 500 m | 560 m | 76.18 s | 76.18 s | 0.00 s | [−6.20, +10.10] | OK — 5/5 runs |

### What this does and does not show

**It shows** the planning boundary precisely. The EVP manager requires
`yellow (3.5 s) + all-red (2.0 s) + preclearance (8.0 s) + queue flush, start-up loss (6.0 s) = 19.5 s` of lead time. At 150 m and 15 m/s the ETA is 10.0 s, so every run is classified `TIGHT` with a **measured shortfall of 9.5 s**. Yellow and all-red are fixed by Safety Kernel invariants I2 and I5, so the engine records the shortfall and refuses to shorten clearance. At 300 m (ETA 20.0 s) and 500 m (ETA 33.3 s) every run is `OK`.

**It does not show** that preemption reduces ambulance delay. On this seed set **all three paired intervals include zero**. Preemption changes *when* the ambulance gets a green but does not change *how long* it sits in the queue, because in this model the constraint is the queue itself, not the signal. At 500 m the ambulance is roughly 400 m back in the jam; the stop line is green long before it arrives, and both controllers produce identical delay.

This is reported as a negative result. The detector-distance finding (the TIGHT boundary) is the part of the sweep that the data supports.

---

## 6. Known Caveats

1. **Survivorship in the delay metric.** `personDelayS` is computed over vehicles that exited. A vehicle denied at the approach contributes to `deniedPct` but not to delay, so delay and denial must be read together (Section 3 does exactly that).
2. **Five held-out seeds.** The intervals are wide by construction. Four scenarios resolve; four do not. `pnpm repro` widens the seed set for anyone who wants tighter intervals.
3. **One scenario per topology.** All scenarios share the four-approach permutation from Module 02; results do not generalise to arbitrary network geometry.
4. **EVP sweep geometry confound.** Approach length scales with detection distance, which adds storage. Background demand is identical across points, and `laneLengthM` is in every row so the confound is auditable.
5. **`Stadium Surge Dump` misses its stated expectation** and its interval includes zero. No weighting, seed selection or metric choice was applied to change that.
