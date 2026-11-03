# Rule 14 — Performance Budgets Are Gates (inviolable)

Budgets (module 15) fail the build when exceeded. Performance is measured, not asserted.

## Protocol

1. Budgets: sim ≥ 100× real time headless; frame p95 ≤ 20 ms (60 FPS target) at the reference scenario; JS ≤ 350 KB gzip total, initial route ≤ 200 KB; Lighthouse mobile ≥ 85 performance / ≥ 95 accessibility / ≥ 95 best practices; first meaningful frame < 2 s on throttled profile.
2. `size-limit` and `pnpm perf` run in CI; a regression beyond budget blocks merge.
3. Hot paths (`sim`, `metrics`, render loop) are allocation-free: typed arrays, indexed loops, preallocated buffers; no per-frame object creation.
4. The sim runs in a Web Worker; main thread only draws and handles input. Rendering is decoupled from the fixed-step accumulator.
5. Large work is chunked or off-thread; no long tasks > 50 ms on the main thread.
6. New dependencies must state their gzip cost before adding (Rule 18).
7. Optimise after measuring: attach the profile or benchmark to the commit body.
8. Edge: cache aggressively, keep Worker CPU time within free limits 🔎.

## Good / Bad

| ✅ | ❌ |
|---|---|
| "frame p95 14.2 ms, bundle 281 KB gz (budget 350)" | "Feels fast" |
| Preallocated `Float32Array` for lane positions | `vehicles.map(v => ({...v}))` per frame |

## Enforcement

CI `pnpm perf`, `size-limit`, Lighthouse CI on the deployed URL, QA-30, review checklist §6.
