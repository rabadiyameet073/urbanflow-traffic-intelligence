# ADR-020: Right-hand-traffic geometry; mirroring only by explicit config
- Status: Accepted
- Date: 2026-10-31
- Deciders: UrbanFlow Architecture Team

## Context
Traffic rules differ globally between Right-Hand Traffic (RHT, e.g., US/Europe) and Left-Hand Traffic (LHT, e.g., UK/India). Attempting to support dynamic lane inversion without explicit configuration creates confusion in conflict analysis.

## Options
- (a) Right-hand-traffic (RHT) with protected left turns as the primary canonical model.
- (b) Dynamic runtime lane mirroring without fixed nomenclature.

## Decision
Adopt option (a). All canonical lane IDs (`NB-TR`, `NB-L`, `SB-TR`, `SB-L`, `EB-TR`, `EB-L`, `WB-TR`, `WB-L`) and conflict matrices strictly follow Right-Hand Traffic rules. Mirroring is permitted only via explicit configuration flags.

## Consequences
- Positive: Stable invariant checking; deterministic phase naming (`P1` to `P4`); unambiguous safety analysis.
- Negative: Demonstrations in LHT jurisdictions must explicitly note the canonical US/RHT geometry.

## Evidence
`packages/core/src/contracts.ts` lane topology and safety invariant definitions.
