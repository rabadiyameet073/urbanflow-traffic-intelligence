# ADR-003: One writer of SignalState — the Safety Kernel
- Status: Accepted
- Date: 2026-10-31
- Deciders: UrbanFlow Architecture Team

## Context
Multiple actors (controllers, EVP preemption, Copilot LLM proposals, human operators) may request phase transitions. Permitting direct signal mutation creates race conditions, yellow-shortening, and conflicting greens.

## Options
- (a) Single Inviolable Safety Kernel as the sole mutator of `SignalState`.
- (b) Distributed safety checks across controllers and gateway handlers.

## Decision
Adopt option (a). Controllers and EVP managers emit non-binding `ControlAction` and `EvpDirective` requests. Only `SafetyKernel.step()` mutates `SignalState`. `ConflictMonitor.assertInvariants()` validates every tick before returning.

## Consequences
- Positive: Safety verification is strictly localized; small state space allows exhaustive BFS verification; zero possibility of AI or controller bugs directly causing green conflicts.
- Negative: Additional layer in the control path; controllers must handle clamp/refusal.

## Evidence
`docs/SAFETY_CASE.md` and `packages/core/test/core.test.ts` invariant tests.

