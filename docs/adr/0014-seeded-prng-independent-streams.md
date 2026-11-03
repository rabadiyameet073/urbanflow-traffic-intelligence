# ADR-014: Seeded PRNG with named, independent streams
- Status: Accepted
- Date: 2026-10-31
- Deciders: UrbanFlow Architecture Team

## Context
When comparing controllers (Fixed vs. Adaptive vs. Actuated), vehicle arrivals must remain identical. If arrival generation shares a single global random stream with driver type selection or braking jitter, any change in vehicle count alters future arrivals on other lanes.

## Options
- (a) Independent named PRNG streams per lane (`arrivals:<lane>`, `types:<lane>`) via `mulberry32` and `splitRng`.
- (b) Single shared PRNG stream across the whole simulation.

## Decision
Adopt option (a). Each lane maintains dedicated, isolated PRNG streams derived deterministically from the scenario root seed and label.

## Consequences
- Positive: True fair arrivals: lane arrivals are identical across all controllers regardless of congestion, spillback, or preemption events.
- Negative: Requires instantiating and managing separate RNG state functions per lane.

## Evidence
`packages/core/test/core.test.ts` fair arrivals test validates 100% arrival match.

