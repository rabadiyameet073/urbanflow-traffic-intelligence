# Module 20: Simulation Engine Engineering

> The physics heart (`packages/core/src/sim`). Believable enough to trust, fast enough for 100× real time, **bit-deterministic** across Node and browsers, and identical for both A/B twins.

---

## 1. Model Overview

| Aspect | Choice |
|---|---|
| Geometry | 8 one-dimensional approaches, `laneLengthM` (default 300 m). Position = distance to stop line (decreasing). |
| Box crossing | Extra 18 m (left lanes 22 m) at reduced speed, then vehicle exits. |
| Time step | `SIM_DT_S = 0.1` s fixed. No variable dt anywhere in `core`. |
| Car following | Intelligent Driver Model (IDM) per vehicle class |
| Signals | Input only: `step(signal: SignalState)`. The simulator never owns a controller. |
| Demand | Per-lane Poisson arrivals from independent seeded streams |
| Emergency | `spawnEms(lane)` with optional filtering (yielding) |
| Incidents | `BLOCKED`, `CAPACITY_DROP`, `DOUBLE_PARKED` with duration |

---

## 2. IDM Reference

Acceleration for follower with speed `v`, desired speed `v0`, gap `s`, approach rate `Δv = v − v_leader`:

```
s*(v, Δv) = s0 + v·T + (v·Δv) / (2·√(a·b))
a_idm     = a · [ 1 − (v/v0)^4 − (s*/s)^2 ]
```

| Param | Default | Notes |
|---|---|---|
| `v0` | `min(speedLimit, type.maxSpeed)` | |
| `T` (time headway) | 1.5 s (bike 1.2, truck 1.8) | |
| `s0` (min gap) | 2 m | |
| `a` | per type (`VEHICLE_SPECS.maxAccel`) | |
| `b` (comfort decel) | per type | |

Implementation rules:
- Use `(v/v0)` squared twice (`x2*x2`), **not** `Math.pow(x, 4)`.
- Clamp `s ≥ 0.1` to avoid division blow-up; clamp `a_idm ≥ −9` (physical limit); speeds `≥ 0`.
- Integrate with explicit Euler/ballistic update: `v' = max(0, v + a·dt)`, `x' = x − (v + v')/2 · dt`.
- Red/yellow: the stop line acts as a **virtual stopped leader** for vehicles that cannot cross.
- Yellow dilemma-zone rule: a vehicle proceeds if it cannot stop at ≤ 3.5 m/s², otherwise it stops.
- **Start-up lost time emerges** from IDM acceleration; do not hard-code it.

---

## 3. Determinism (the part most people get wrong)

### 3.1 Rules (Rule 07)

1. No `Math.random`, `Date.now`, `performance.now`, `setTimeout`, `crypto.getRandomValues` in `core`.
2. All randomness from `splitRng(seed, label)` streams; every consumer has a **named** stream.
3. Iteration order is explicit (indexed loops over fixed lane order). Never rely on `Object.keys` order of dynamic objects, `Set`/`Map` iteration for logic that affects state.
4. **Floating-point portability:** `+ − × ÷` and comparisons are IEEE-754 exact and portable. `Math.sqrt` is correctly rounded in practice on every mainstream engine. **`Math.exp/log/pow/sin/cos` are implementation-approximated by the ECMAScript spec and can differ in the last bit between V8, SpiderMonkey and JavaScriptCore.** Therefore:
   - The simulation uses only `+ − × ÷ sqrt abs min max floor ceil fround`.
   - Exponential inter-arrival times use the deterministic natural-log implementation in `helpers/rng.ts` (`detLn`) rather than `Math.log`.
   - IDM uses repeated multiplication, not `Math.pow`.
5. Typed-array element types are part of the model: choose once (`Float64Array` for position/speed unless a benchmark proves `Float32` is safe), and never mix.
6. State hash: serialise numbers via `DataView` with explicit endianness (`setFloat64(…, true)`), hash with FNV-1a 64 (`helpers/hash.ts`). Hash the **state arrays**, not JSON strings (float formatting differences).

### 3.2 Proof obligations (tests)

| Test | Statement |
|---|---|
| Replay | Same config + same input log ⇒ identical hash across 3 runs (Node) |
| Cross-engine | Same run in Chromium, Firefox, WebKit (Playwright) ⇒ identical hash at t = 30 s and t = 600 s |
| Fair arrivals | Two sims with different signal sequences ⇒ identical arrival timestamps and types per lane |
| Stream independence | Consuming extra draws from `"types:NB-L"` does not change `"arrivals:NB-L"` |
| Snapshot/restore | `restore(snapshot(t))` then N ticks ⇒ same hash as an uninterrupted run (property test over random N) |

---

## 4. Data Layout

Per lane (struct-of-arrays, capacity pre-sized):

```
pos: Float64Array     // m from stop line (decreasing)
vel: Float64Array     // m/s
typ: Uint8Array       // VehicleType index
wait: Float32Array    // seconds stopped/queued (for weighted wait)
stops: Uint8Array     // stop count
t0: Float64Array      // entry sim-time (delay computation)
flags: Uint8Array     // braking, ems, inBox, filtering
order: Int32Array     // indices sorted front→back (maintained incrementally)
free: Int32Array      // free-list of slots
```

- Vehicles are ordered front→back by an index array updated incrementally (insertion at the back; removal at the front); no sorting per tick.
- The **render snapshot** (`snapshot()`) exposes a typed-array view (x, y world coords, type, heading, braking) with zero copies where possible; the worker transfers buffers to the UI.

---

## 5. Demand & Entry Buffer

```
arrival gap  = −ln(u) / rate        (rate = laneDemandVph/3600, u from "arrivals:<lane>")
vehicle type = weighted choice      (from "types:<lane>")
```

- Next arrival is pre-generated lazily from its own stream, so **what the controller does can never change when cars arrive.**
- If there is no room at the entry point: queue the arrival in a per-lane **entry buffer** for ≤ 30 s, then **DENIED** and counted (`denied` per lane). Reports show denied %; > 0.5 % raises a UI warning, because dropped arrivals make delay look artificially good.
- Live edits (`setLaneDemand`, `setModalSplit`, spawn, incident) are appended to an **ordered input log** `{tick, op, args}`; the log + seed + config reproduces the run exactly. When the rate changes, the next arrival time is re-derived from the memoryless property: draw a fresh gap from the new rate at the edit tick.

---

## 6. Emergency Vehicles & Filtering

- `spawnEms(lane)` places the vehicle `emsDetectDistanceM` from the stop line at 15 m/s (54 km/h).
- With `emsFiltering = true` others "yield": the EMS passes the queue at ≤ 8 m/s via the shoulder but cannot enter the box against a non-green.
- Timeline: `tSpawn, tReachStopLine, tExit`; `emsDelayS = actual − free-flow transit`.
- The EVP request is auto-created at the detection distance for simulator-spawned EMS (module 03 §5).

---

## 7. Incidents

| Kind | Effect |
|---|---|
| `BLOCKED` | Virtual stopped obstacle at `positionM`; queue builds behind it; discharge past it = 0 |
| `CAPACITY_DROP` | Reduces desired speed/saturation flow in a segment |
| `DOUBLE_PARKED` | Partial blockage (reduced effective gap) |

`clearIncident` removes the obstacle; the queue must discharge afterwards (test: queue growth ≈ arrival rate during the incident, clears after).

---

## 8. Observation (computed once per tick)

| Field | Definition |
|---|---|
| counts by type | Vehicles currently in lane |
| `queueLengthM` | Distance from stop line to the last vehicle of the contiguous queue (`speed < 1 m/s`) |
| `sumWeightedWaitS` | Σ `priorityWeight × waitS` |
| `maxWaitS` | Max individual wait |
| `arrivalsLast10s`, `dischargedLast10s` | Ring-buffer windows |
| `occupancyPct` | Fraction of lane length occupied by vehicles (+ gaps convention documented) |
| `nearestEmsDistanceM` | Or `null` |

Observation exposes **validity flags** per lane (for chaos/perception-noise tests): a missing/stale reading is **never** interpreted as zero vehicles.

---

## 9. Domain Events (drained by metrics and the Kafka bridge)

`vehicleExited{delayS, stops, waitS, type, lane}` · `vehicleDenied` · `emsMilestone` · `incident` · `signalTransition`. `events()` drains and clears; the producer maps them to Kafka messages.

---

## 10. Required Tests (module 60 has the template)

1. Determinism, fair arrivals (above).
2. **No overlap:** property test over random demand/signals for 10 k ticks — gap ≥ 0, speed ≥ 0.
3. **Red means stop:** no vehicle crosses the stop line on red in 5 min of heavy random demand (except EMS on green).
4. **Flow sanity:** permanent green + saturating demand ⇒ discharge 1 500 – 2 100 veh/h/lane (print the number).
5. **Conservation:** `arrivals = exited + inSystem + denied`.
6. **Performance:** 1 sim-hour × 8 lanes × 900 vph in < 36 s (≥ 100×); print the number.
7. **Incident:** queue growth ≈ arrival rate; clears after `clearIncident`.
8. **Stress:** 1 800 vph on every lane for 10 sim-minutes: no NaN, no negative gaps, denied counted.

---

## 11. Anti-Patterns

| ❌ | ✅ |
|---|---|
| `Math.pow(v/v0, 4)` | `const x = v/v0; const x2 = x*x; x2*x2` |
| `Math.log(u)` for arrivals | `detLn(u)` |
| `lanes.forEach(...)` in the tick | Indexed loop over fixed lane order |
| Dropping arrivals silently when full | Entry buffer → counted DENIED |
| Controller influencing arrival times | Arrivals from independent named streams |
| JSON-hashing state | Hash typed-array bytes |
| Variable dt | Fixed `SIM_DT_S`; fast-forward = more ticks |
