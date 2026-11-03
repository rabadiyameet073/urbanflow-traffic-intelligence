# ADR-005: Adaptive controller is switching-cost-aware
- Status: Accepted
- Date: 2026-10-31
- Deciders: UrbanFlow Architecture Team

## Context
Naive Max-Pressure algorithms switch phases as soon as pressure on another phase exceeds the current phase. At balanced demand, this causes excessive yellow (3.5s) and all-red (2.0s) clearance intervals (5.5s lost time per cycle), yielding 2-3x worse delay than fixed-time controllers.

## Options
- (a) Add switching-cost hysteresis (`G_MIN_EFFICIENT_S`, ratio/floor margins, gap-out logic).
- (b) Standard fixed green splits with sensor extensions.

## Decision
Adopt option (a). Implement `G_MIN_EFFICIENT_S` hold duration, switching threshold `competingPressure > currentPressure * RATIO + FLOOR`, gap-out detector, and anti-starvation forced max-green.

## Consequences
- Positive: Parity-or-better performance against fixed-time baseline across all 8 standard scenarios; robust against chatter.
- Negative: Additional hyper-parameters require disciplined tuning on training seeds and verification on held-out test seeds.

## Evidence
`packages/bench/out/results.json` shows adaptive controller beats fixed-time across held-out seeds.

