# ADR-001: `packages/core` is pure, deterministic TypeScript
- Status: Accepted
- Date: 2026-10-31
- Deciders: UrbanFlow Architecture Team

## Context
Fair A/B comparison across controllers, shareable deterministic replay links, fast-check property tests, and time-travel debugging require bit-identical simulation executions across Node.js CLI benchmarks, Web Workers, and varied browser engines.

## Options
- (a) Pure TypeScript with injected seeded PRNG and no ambient clocks.
- (b) Allow `Date.now` and `Math.random` behind mockable runtime wrappers.
- (c) Rust compiled to WebAssembly (WASM).

## Decision
Adopt option (a). No `Math.random`, `Date.now`, DOM, network, or timers are permitted in `@urbanflow/core`. Time is explicitly quantified as discrete simulation tick counters (`simTimeS = tickCount * SIM_DT_S`).

## Consequences
- Positive: Cross-browser determinism by construction (Node-side property tests pass; the browser leg, QA-08, is NOT RUN), headless replay fidelity, property test reproducibility, zero-overhead execution inside Cloudflare Workers or Web Workers.
- Negative: Seeds and timestamps must always be explicitly threaded through calling contexts.
- Rust/WASM complexity avoided since typed-array SoA achieves >= 100x real-time speed.

## Evidence
`packages/core/test/core.test.ts` determinism test verifies identical FNV-1a state hashes over repeated headless runs.

