# Module 15: Performance & Capacity Budgets

> Performance is a **feature with a gate**, not a polish step. Budgets below are tested; anything not measured is labelled an estimate.

---

## 1. Budget Table

| Area | Metric | Budget | Gate command | Task |
|---|---|---|---|---|
| Simulation | Headless speed-up (8 lanes × 900 vph) | ≥ **100×** real time (1 sim-hour < 36 s on CI) | `pnpm test perf-sim` | 2 |
| Simulation | Saturation flow (IDM-emergent) | 1 500 – 2 100 veh/h/lane | sim flow test | 2 |
| Rendering | Frame time p95 @ 200 vehicles | ≤ **20 ms** local; CI threshold ≤ 33 ms | `pnpm e2e perf` | 6 |
| Worker→UI | Per-frame message | Transferable typed arrays; **no JSON** per frame | review + test | 6 |
| Bundle | Total JS (gz) | ≤ **350 KB** | `size-limit` | 16 |
| Page | Lighthouse (mobile throttled) | perf ≥ 85 · a11y ≥ 95 · best-practices ≥ 95 | `pnpm lighthouse` | 16 |
| Page | LCP / CLS / INP | < 2.5 s / < 0.1 / < 200 ms | Lighthouse + web-vitals e2e | 16 |
| Memory | Soak growth (30 min browser, 10 sim-h headless) | < 20 % heap growth, no crash | `pnpm test soak` | 16 |
| Throttle | 4× CPU + slow 4G | Usable; interactive ≤ 5 s | `pnpm e2e throttled` | 16 |
| Edge | `/api/health` p95 (local, 200 calls) | printed; < 100 ms local | smoke script | 9 |
| Copilot | Meta answer p95 | ≤ 6 s else fallback | edge logs | 11 |
| Pipeline | lane-metrics p95 latency | < 15 s (floor: window + watermark) | `make test` | 10 |

CI environments are slower than a developer laptop; thresholds are looser in CI, and **the measured local number is always printed and recorded**.

---

## 2. Method (how to measure honestly)

1. **Pin the environment:** CPU model, RAM, OS, Node/Chromium versions — written into the benchmark output.
2. **Warm up:** discard the first N iterations/seconds.
3. **Repeat:** ≥ 5 runs for timings; report median and p95, not best-of.
4. **One variable at a time.** Never change controller *and* rendering in one comparison.
5. **Use production builds** for page-level numbers (dev servers distort).
6. **Store raw samples** in `bench/out/` so a chart can be regenerated.
7. **Never quote** a number that did not come from a stored run.

---

## 3. Simulation Hot-Loop Rules (`packages/core/src/sim`)

| Rule | Reason |
|---|---|
| Struct-of-arrays (`Float32Array`/`Int32Array`/`Uint8Array`) per lane | Cache locality, no GC churn |
| **No allocation per tick** (no object/array literals, closures, spreads in the loop) | GC pauses wreck frame time |
| No `Map`/`Set`/`forEach`/`reduce` in the hot path; indexed `for` loops | JIT-friendly, predictable |
| Free-list slot reuse, never `splice` | O(1) removal |
| Pre-size capacities from config (`laneLengthM / minGap`) | Avoid growth |
| Avoid `Math.pow`/`sqrt` inside inner loops when a cheaper form exists; hoist invariants | Throughput |
| Separate *step* from *observe*; observe computes aggregates once per tick, not per consumer | Linear cost |
| Rolling windows as ring buffers | Constant-time updates |
| Profile before optimising (Chrome/Node `--prof`); record the profile summary in the PR | No folklore |

If the speed-up is < 100×: profile the hot loop, remove allocations, replace `Map` use, re-measure.

---

## 4. Rendering Rules

1. `requestAnimationFrame` only; interpolate between sim ticks using the last two snapshots.
2. **Static road layer pre-rendered** to an `OffscreenCanvas`/cached bitmap; redrawn only on resize/theme change.
3. Draw only visible/changed items; batch by fill style; avoid `shadowBlur` in per-vehicle loops.
4. HiDPI via `devicePixelRatio` capped at 2 (cap documented; 3× wastes fill-rate).
5. No layout thrash: read DOM metrics once per frame, never inside draw calls.
6. DOM updates for KPIs are **throttled** (≤ 4 Hz) and batched; charts use uPlot with fixed-size ring buffers.
7. `aria-live` announcements throttled to 1 per 5 s.
8. Pause rendering when the tab is hidden; keep the worker's *time* policy explicit (pause or run slowed) and test it.
9. Animate only `transform`/`opacity` in CSS (module 42).

---

## 5. Worker Messaging Budget

| Item | Rule |
|---|---|
| Frame payload | Transferable `ArrayBuffer`s (x, y, heading, type, flags) + small header; reuse/recycle buffers (ping-pong) |
| KPIs/events | Aggregated and sent ≤ 4 Hz as compact JSON |
| Commands | Typed, versioned, zod-validated union |
| Backlog protection | If the UI lags, **drop frames, never queue unbounded**; counter shown in dev overlay |

---

## 6. Bundle Discipline

- Route-level/code-split heavy panels (charts, Camera Mode, copilot) via dynamic `import()`.
- No moment/lodash/full-icon-sets; inline only the SVG icons used.
- Fonts: self-hosted subsets (Inter, JetBrains Mono), `font-display: swap`, preload the two critical weights, `size-adjust` fallbacks to avoid CLS.
- Images: AVIF/WebP, explicit `width`/`height`, lazy below the fold; generated scene images pre-compressed.
- `size-limit` budget fails CI at +5 % over baseline or > 350 KB gz total.

---

## 7. Capacity & Free-Tier Guardrails (verify numbers on the provider's current pricing pages)

| Resource | Guardrail |
|---|---|
| Cloudflare Workers requests/day | Cache `/api/health` (short TTL); client back-off; WebSocket for live data instead of polling |
| Worker CPU per request | Keep handlers tiny; no heavy JSON work; verify the current free-plan CPU limit |
| Durable Object storage | Replay blobs ≤ 200 KB, 7-day expiry, per-IP caps; periodic cleanup alarm |
| Workers AI | Used only as fallback; daily cap; cache |
| Meta API credits | Per-IP and global caps; cost meter; alert/cap in the Meta console |
| GitHub Actions minutes | Public repo; cache pnpm store; run e2e on one browser in PRs, three nightly |

---

## 8. Pipeline Capacity Notes

See module 12 §9. Summary: ≈ 100 msg/s ⇒ ≈ 2.6 GB/day raw JSON @ 300 B; local Spark in ≈ 4 GB RAM; partitions = 3; do not claim cluster scale from a single node.

---

## 9. Anti-Patterns

- Optimising without a profile.
- Quoting a best run.
- Per-frame `JSON.stringify` across the worker boundary.
- `setInterval` loops for rendering.
- Allocating arrays in `observe()` called every tick.
- Large CSS blur/backdrop-filter layers over the canvas.
- Measuring `vite dev` and calling it page speed.
