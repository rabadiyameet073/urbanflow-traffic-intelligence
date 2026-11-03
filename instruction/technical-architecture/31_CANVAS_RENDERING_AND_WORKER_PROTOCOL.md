# Module 31: Canvas Rendering & Worker Protocol

> The 60 FPS "wow in five seconds" screen. How the worker talks to the renderer, how frames are drawn, and how time, speed, pause and time-travel behave.

---

## 1. Time Model

Inside the worker (an IO shell, not `core`), a **fixed-timestep accumulator** drives the deterministic core:

```ts
// worker/sim.worker.ts (shell: may use performance.now)
let acc = 0, last = performance.now();
function frame(now: number) {
  const dtWall = Math.min(0.25, (now - last) / 1000); last = now;   // clamp spiral-of-death
  if (!paused) acc += dtWall * speed;                                 // speed ∈ {0.5, 1, 5, 20}
  let steps = 0;
  while (acc >= SIM_DT_S && steps < MAX_STEPS_PER_FRAME) { loop.tick(); acc -= SIM_DT_S; steps++; }
  postFrame();
  schedule(frame);
}
```

| Rule | Detail |
|---|---|
| Determinism | Wall-clock affects **how many** ticks run per frame, never the results of a tick |
| Speed | 0.5×, 1×, 5×, 20×; single-step when paused |
| Overload | `MAX_STEPS_PER_FRAME` cap; if exceeded, speed degrades visibly (badge "running slower") rather than freezing |
| Hidden tab | Worker slows/pauses by explicit policy (documented, tested) |
| Keyframes | Snapshot every 60 sim-seconds for restart and time-travel |

The worker scheduler uses `setTimeout`/`MessageChannel`-based ticking (workers have no `requestAnimationFrame` guarantees); the **renderer** uses `requestAnimationFrame` on the main thread and interpolates.

---

## 2. Message Catalogue (versioned, zod-defined in `core`)

### 2.1 Main → Worker (commands)

| `type` | Payload | Notes |
|---|---|---|
| `init` | `{ v:1, config: SimConfig, controllerA, controllerB?, params }` | Starts twins in lockstep |
| `run` / `pause` / `step` | `{ speed? }` | |
| `reset` | `{ seed }` | Same-seed reset ⇒ same first-10-s hash |
| `setLaneDemand` | `{ lane, vph }` | Clamped 0..1800; logged in input log, applied to **both twins** |
| `setModalSplit` | `{ split }` | Renormalised to sum 1 |
| `spawnEms` | `{ lane, kind }` | |
| `injectIncident` / `clearIncident` | `{ lane, kind, positionM, durationS }` / `{ lane }` | |
| `setController` | `{ id: 'fixed'|'adaptive' }` | Single view only |
| `setParams` | `{ params }` | Bounds-validated; Kernel dry-run first |
| `restoreTo` | `{ tSimS }` | Time-travel via nearest keyframe |
| `requestSnapshot` | `{}` | For what-if clone and exports |
| `ping` | `{ n }` | Heartbeat |

### 2.2 Worker → Main (events)

| `type` | Payload | Rate |
|---|---|---|
| `frame` | `{ twin, tick, tSimS, header, buffers… }` (transferables) | each render frame |
| `kpis` | compact metrics window per twin | ≤ 4 Hz |
| `events` | batched domain events (EVP timeline, incidents, anomalies) | on change |
| `decision` | adaptive decision log (pressures, rule, reason) | per decision |
| `safety` | counters (`conflicts`, `violationsPrevented`, compliance %) | ≤ 1 Hz |
| `hash` | `{ tSimS, stateHash }` | 1 Hz |
| `error` | `{ code, message }` | on failure |
| `pong` | `{ n }` | heartbeat |

All messages carry `v: 1`. Unknown/invalid in dev ⇒ throw; in prod ⇒ ignore + count.

### 2.3 Frame Buffer Layout

Per twin, per frame: `Float32Array` interleaved `[x, y, headingRad, lengthM, typeIdx, flags]` × N (stride 6), plus `Uint8Array` signal heads and a small JSON header `{n, tSimS, tickDtS}`. Buffers are **transferred** (zero-copy) and returned for reuse via a ping-pong pool; if the UI lags, the worker **drops** frames rather than queueing.

---

## 3. Renderer Architecture

```
static layer (OffscreenCanvas / cached bitmap) : asphalt, lane markings, stop lines, crosswalks, arrows, labels
dynamic layer (main canvas, per frame)         : vehicles, brake lights, EMS light bar/siren ring, queue bars
overlay (DOM or canvas)                        : signal heads + countdowns, lane labels, selection ring
```

| Rule | Detail |
|---|---|
| Resolution | `devicePixelRatio` capped at 2; resize via `ResizeObserver`, debounced; static layer re-rendered on resize/theme only |
| Interpolation | Keep last two snapshots; render at `α = (now − t_snap1)/(t_snap2 − t_snap1)` for smooth motion between ticks |
| Draw order | Road → queue bars → vehicles (by y for pseudo-depth) → signal heads → selection/EMS effects |
| Culling | Skip off-screen/zero-alpha elements |
| Batching | Group by fill style; avoid per-vehicle `save()/restore()`; no `shadowBlur` in loops |
| Palette | CSS-token-derived (module 40), read once per theme change into a plain object |
| Shape + colour redundancy | Vehicle type by **shape and size** as well as colour; signal state by **colour + glyph** (●/▲/■ or labelled text) |
| Reduced motion | No pulsing/flashing: EMS shown as static high-contrast marker + label; interpolation retained (it is not decorative motion) |
| Hit testing | Lane selection by click uses polygon `pointInPolygon` in `geometry.ts` (pure, unit-tested) |

### 3.1 Coordinate Mapping (pure, tested)

`worldToCanvas(x, y, viewport)` / `canvasToWorld`, with round-trip property tests (error < 1e-6 m) and DPR/scroll-offset handling.

### 3.2 Vehicle Shapes

| Type | Shape | Notes |
|---|---|---|
| BIKE | small rounded dot with direction tick | |
| CAR | rounded rectangle 4.5 m | |
| BUS | long rectangle with window stripe | distinct hue + stripe |
| TRUCK | longest, cab + trailer split | |
| AMBULANCE | white body, red cross, light bar (blink unless reduced-motion), siren ring | |
| Brake lights | red pair when `decel > 0.5 m/s²` | |

Palette: **Okabe-Ito** for categorical type colours; luminance contrast against road ≥ 3:1 for non-text graphics.

---

## 4. Controls ↔ Protocol Mapping

| Control | Command | Local rule |
|---|---|---|
| Lane `−`/`+` (step 50; Shift = 200) | `setLaneDemand` | clamp 0..1800 |
| Lane slider | `setLaneDemand` | same |
| Modal-split sliders (Car/Bike/Bus/Truck) | `setModalSplit` | renormalise proportionally; sum = 1 (property-tested) |
| Spawn Ambulance / Fire Engine | `spawnEms` | lane from dropdown or canvas click |
| Inject / Clear Incident | `injectIncident` / `clearIncident` | |
| Seed field | `reset` | integer ≥ 0 |
| Detection distance 150/300/500 | `init`/`setParams` | applied to future spawns |
| Speed selector | `run{speed}` | |
| Shortcuts | Space pause · A ambulance · I incident · R reset · 1–4 speed · arrows select lane · ± adjust | listed in a `?` dialog |

All controls are keyboard operable, ARIA-labelled, with ≥ 44 px touch targets.

---

## 5. Twin View & Lockstep

- **One worker driving two sims in lockstep** is preferred (identical tick order, simpler fairness) unless profiling shows it cannot hold 60 FPS; then use two workers with identical input logs. Document the choice in an ADR.
- Every user edit becomes an input-log entry with a tick number and is applied to **both** twins at the same tick.
- UI badge: "Identical arrivals (seed N)". A mismatch in arrival counters is a bug (e2e asserts equality).

---

## 6. Time Travel

- Keyframe every 60 sim-seconds (`snapshot()`); scrubbing = restore nearest keyframe + deterministic re-simulation to the target tick.
- Both twins scrub together; "Return to live" button; scrubbing never mutates the input log (read-only until live).
- Test: scrub back 60 s and forward ⇒ hash equals the original at the same time.

---

## 7. Failure Behaviour

| Event | Result |
|---|---|
| Worker `error` or missed heartbeat (2 s) | Terminate, create new worker, `restoreTo(lastKeyframe)`, toast |
| Slow main thread | Frame drop policy; dev overlay counts dropped frames |
| Invalid message | Ignore + count (prod); throw (dev) |
| Out-of-memory | Reduce capacity, restart from keyframe, log |

---

## 8. Performance Gates

| Gate | Threshold |
|---|---|
| p95 frame time, 8 lanes × 1200 vph, 20 s sample | ≤ 20 ms local / ≤ 33 ms CI |
| Vehicles on screen | 200 |
| Main-thread long tasks (> 50 ms) during run | 0 (excluding load) |
| Memory growth over 30 min | < 20 % |

---

## 9. Anti-Patterns

- Simulating on the main thread "just for the demo".
- `JSON.stringify` of vehicle arrays per frame.
- Variable-dt simulation tied to frame time.
- Redrawing the static road every frame.
- Using colour alone to distinguish signal states or vehicle types.
- Queueing every frame when the UI is slow.
- Mutating the input log while scrubbing.
