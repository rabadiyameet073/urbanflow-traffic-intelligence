# ADR-004: Coarse four-phase conflict model
- Status: Accepted
- Date: 2026-10-31
- Deciders: UrbanFlow Architecture Team

## Context
Intersection signaling can use coarse four-phase ring sequences (NS Left, NS Thru, EW Left, EW Thru) or complex dual-ring NEMA models with concurrent non-conflicting left turns and right turn overlaps.

## Options
- (a) Coarse four-phase conflict model where any two different phases conflict.
- (b) Full NEMA 8-phase dual-ring with permissive greens and overlaps.

## Decision
Adopt option (a). Any two distinct phases conflict. No overlap phases or permissive lefts are modeled in the core reference engine.

## Consequences
- Positive: Exhaustive state verification via BFS is mathematically tractable; simple safety proof; transparent failure modes for judges.
- Negative: Lower theoretical capacity than a modern dual-ring intersection under heavy asymmetric left-turn demand. Documented in `docs/validation/LIMITATIONS.md`.

## Evidence
Reachable-state model checker explores 100% of state transitions without state explosion.

