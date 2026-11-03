# Module 02: Domain Model & Frozen Contracts

> **The vocabulary of the system.** `packages/core/src/contracts.ts` is the executable form of this document. If they disagree, fix the disagreement in the same commit (Rule 12).

---

## 1. Entities

```
Intersection ─┬─ 8 × Lane ── N × Vehicle
              ├─ 4 × Phase (partition of the 8 lanes)
              ├─ SignalState  (written only by SafetyKernel)
              ├─ Controller   (Fixed | Adaptive)  → ControlAction (request)
              └─ EvpManager   → EvpDirective (request to kernel)
```

### 1.1 Lanes

| LaneId | Approach | Movement | Phase |
|---|---|---|---|
| `NB-TR` | North-bound | Through + right | `P2_NS_THRU` |
| `NB-L` | North-bound | Dedicated left | `P1_NS_LEFT` |
| `SB-TR` | South-bound | Through + right | `P2_NS_THRU` |
| `SB-L` | South-bound | Dedicated left | `P1_NS_LEFT` |
| `EB-TR` | East-bound | Through + right | `P4_EW_THRU` |
| `EB-L` | East-bound | Dedicated left | `P3_EW_LEFT` |
| `WB-TR` | West-bound | Through + right | `P4_EW_THRU` |
| `WB-L` | West-bound | Dedicated left | `P3_EW_LEFT` |

Any two different phases conflict (`conflictsWith(a, b) === (a !== b)`). The conflict relation is deliberately coarse: it makes the safety proof small and exhaustive.

### 1.2 Vehicle classes

| Type | Length m | Max accel m/s² | Pax | Priority weight | Idle fuel L/h | Fuel |
|---|---:|---:|---:|---:|---:|---|
| `BIKE` | 1.8 | fast start, low top speed | 1 | 1.0 | 0 | — |
| `CAR` | 4.5 | 2.5 | 1.4 | 1.2 | 0.6 | gasoline |
| `BUS` | 12.0 | 1.2 | 45 | 8.5 | 2.0 | diesel |
| `TRUCK` | 16.5 | 0.8 | 1.0 | 2.0 | 1.8 | diesel |
| `AMBULANCE` | 6.5 | 3.5 | n/a | ∞ (preemption) | 0.9 | diesel |

CO₂ factors (assumptions, always shown with an "assumptions" popover): gasoline ≈ 2.31 kg/L, diesel ≈ 2.68 kg/L. `FIRE_ENGINE` is a UI alias of `AMBULANCE` kinematics.

### 1.3 Timing constants (seconds)

| Constant | Value | Note |
|---|---:|---|
| `G_MIN_S` | 7 | **Safety** minimum green (kernel-enforced) |
| `G_MAX_S` | 65 | Maximum normal green (EVP hold may extend to 90) |
| `YELLOW_S` | 3.5 | Never shortened by any caller, including EVP |
| `ALL_RED_S` | 2.0 | Never shortened by any caller, including EVP |
| `PLANNING_WINDOW_S` | 10 | Adaptive re-plan cadence |
| `FIXED_CYCLE_S` | 90 | `2·(10+24) + 4·5.5 = 90` (lefts 10 s, throughs 24 s) |
| `MAX_RED_WAIT_S` | 120 | Anti-starvation bound for a phase with demand |
| `SIM_DT_S` | 0.1 | Simulation tick |

### 1.4 Adaptive parameters (tunable, bounded, zod-validated)

| Param | Default | Bounds | Meaning |
|---|---:|---|---|
| `G_MIN_EFFICIENT_S` | 25 | 12 – 40 | Switching-cost hold. **Not** the safety minimum. |
| `RATIO` | 3 | 1.5 – 6 | Switch if `best > RATIO·cur + FLOOR` |
| `FLOOR` | 8 | 0 – 20 | Absolute pressure floor |
| `GAP_S` | 3 | 1 – 6 | Gap-out: current phase empty this long |
| `alpha, beta, gamma` | 1,1,1 | 0 – 3 | Count / weighted-wait / spillback weights |

Yellow, all-red, `G_MIN_S`, `G_MAX_S`, conflict rules, `MAX_RED_WAIT_S` are **not tunable parameters** and have no setter. AI proposals touching them are rejected by construction.

### 1.5 Pressure

```
Pressure(lane)  = alpha · N + beta · Σ(W_v · wait_v) / 10 + gamma · 10 · queueLengthM / laneLengthM
Pressure(phase) = Σ Pressure(lane) over the phase's lanes
```

---

## 2. Core TypeScript Contracts (shape, not full source)

```ts
export type LaneId = 'NB-TR'|'NB-L'|'SB-TR'|'SB-L'|'EB-TR'|'EB-L'|'WB-TR'|'WB-L';
export type VehicleType = 'BIKE'|'CAR'|'BUS'|'TRUCK'|'AMBULANCE';
export type PhaseId = 'P1_NS_LEFT'|'P2_NS_THRU'|'P3_EW_LEFT'|'P4_EW_THRU';
export type SignalIndication = 'GREEN'|'YELLOW'|'ALL_RED'|'FLASH_RED';

export interface SignalState {
  phase: PhaseId | null;
  indication: SignalIndication;
  timeInStateS: number;
  lanes: Record<LaneId, 'G'|'Y'|'R'>;
}

export interface SimConfig {
  seed: number;
  laneDemandVph: Record<LaneId, number>;      // 0..1800
  modalSplit: Record<VehicleType, number>;    // sums to 1; AMBULANCE excluded from random spawn
  durationS: number;
  laneLengthM: number;                        // default 300
  speedLimitMps: number;                      // default 13.9
  emsDetectDistanceM: number;                 // default 300; sweep 150/300/500
  emsFiltering: boolean;                      // default true
}

export interface ControlAction { requestedPhase: PhaseId | null; reason: string; pressures?: Record<PhaseId, number>; }
export interface Controller { id: string; decide(obs: Observation): ControlAction; }

export interface EvpRequest {
  id: string; lane: LaneId; distanceM: number; speedMps: number;
  tRequestS: number; nonce: string; source: string;
}
```

Rules for the file:
- Exported `const` arrays/records plus derived union types (`as const`), never parallel hand-maintained lists.
- Every public symbol has JSDoc.
- A **contracts snapshot test** fails on any unintended change.
- Zod schema exists for every event, config and request that crosses a trust boundary.

---

## 3. Event Contracts (Kafka topics and WebSocket messages)

All events carry `schemaVersion: 1`, `intersectionId`, ISO-8601 UTC `timestamp`, and a **deterministic** `eventId` (`<runId>:<tick>:<lane|na>:<kind>`) so replays and duplicates are detectable.

| Topic | Key | Partitions | Retention | Purpose |
|---|---|---:|---|---|
| `lane-telemetry` | `intersectionId:lane` | 3 | 1 h | Per-vehicle/per-lane observations |
| `signal-state` | `intersectionId` | 1 | 1 h | Signal transitions (ordered) |
| `emergency-events` | `intersectionId` | 1 | 1 h | EVP lifecycle |
| `lane-metrics` | `intersectionId:lane` | 3 | 1 h | 10 s window aggregates (Spark output) |
| `anomaly-events` | `intersectionId` | 1 | 1 h | BLOCKAGE / DEMAND_SURGE / SIGNAL_STUCK / EMS_DELAYED |
| `dlq` | `topic` | 1 | 24 h | Unknown `schemaVersion`, schema failures |

`lane-telemetry` payload (from the platform document, normalised):

```json
{
  "schemaVersion": 1,
  "eventId": "run42:1203:NB-TR:telemetry",
  "timestamp": "2026-10-27T10:30:00.120Z",
  "intersectionId": "INT_042_MARKET_5TH",
  "controller": "adaptive",
  "approachLane": "NB-TR",
  "vehicle": {
    "vehicleId": "veh_ambulance_911", "type": "AMBULANCE", "priorityLevel": 1,
    "speedKmh": 54.2, "distanceToStopLineMeters": 85.0, "waitingTimeSeconds": 0.0
  },
  "laneMetrics": { "currentQueueLengthMeters": 32.5, "occupancyPercent": 65.0 }
}
```

`controller` (`fixed|adaptive`) is a required field added by the playbook so both twins can share one topic. Topic names are **exactly** the six above; the earlier spec's `vehicle-events` is retired.

---

## 4. Metrics Contract

| Metric | Definition | Unit |
|---|---|---|
| `avgDelayS` | Mean (travel time − free-flow time) of exited vehicles | s/veh |
| `personDelayS` | Σ(delay × pax) / Σ pax | s/person |
| `busDelayS`, `bikeDelayS` | Per-class mean delay (equity metrics) | s |
| `throughputVph` | Exited vehicles per hour | veh/h |
| `maxQueueM` | Max over lanes and time | m |
| `stopsPerVeh` | Mean number of stops | count |
| `emsDelayS` | Actual transit − free-flow transit | s |
| `idleFuelL`, `co2Kg` | From idle seconds × factors (assumptions) | L, kg |
| `deniedEntries` | Arrivals denied after 30 s entry buffer | count and % |
| `los` | HCM scale: A ≤10, B ≤20, C ≤35, D ≤55, E ≤80, F >80 s | letter |

Conservation law, asserted in tests and shown in the audit panel: `arrivals = exited + inSystem + denied`.

---

## 5. Change Procedure for Contracts

1. Open a task (Rule 04) titled `contracts: <change>`.
2. Edit `contracts.ts` **and** this module in the same commit.
3. Update zod schemas, fixtures, Kafka/Spark schemas (`pipeline/spark`), edge schemas, and the snapshot test.
4. Bump `schemaVersion` only for a breaking wire change; add a dead-letter path for the old version.
5. Record an ADR if the change alters an invariant.
