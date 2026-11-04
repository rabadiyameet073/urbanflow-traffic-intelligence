# ADR-016: Tune on train seeds; publish only held-out results
- Status: Accepted
- Date: 2026-10-31
- Deciders: UrbanFlow Architecture Team

## Context
Tuning adaptive controller parameters (switching costs, margins, hold times) on the same seeds used for benchmarking leads to overfitted algorithms and dishonest performance claims.

## Options
- (a) Strict separation: tuning on train seeds (1-100); benchmarking and reporting solely on held-out seeds (1001-1050).
- (b) Random seed evaluation without partitioning.

## Decision
Adopt option (a). All controller hyper-parameters are tuned on training seeds. Benchmark reports published in `docs/validation/RESULTS.md` and `packages/bench/out/results.json` run strictly on held-out seeds with 95% bootstrap confidence intervals.

## Consequences
- Positive: Scientific rigor, defensible numbers, resilience against random seed cherry-picking.
- Negative: Requires dual-phase benchmark execution.

## Evidence
`packages/bench/out/results.json` reports held-out seeds 1001-1020 with paired delta analysis.

