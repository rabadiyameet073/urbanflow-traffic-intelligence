# Module 03: Traffic Control Specification

> Normative behaviour of the Safety Kernel, Fixed-time controller, Adaptive controller and EVP. Tests in `packages/core` encode every statement here.

---

## 1. Why the Adaptive Controller Is Not "Just Pressure"

Each phase change wastes ≈ 7.5 s (3.5 yellow + 2.0 all-red + ≈ 2.0 start-up lost time). A controller that switches whenever pressure differs, with only the 7 s safety minimum, **thrashes** under balanced demand: a rough sanity model showed it 2–3× *worse* than fixed-time at balanced 450/150 and 700/200 veh/h/lane. The fix is a **switching-cost-aware rule**. The published numbers must come from `pnpm bench`, never from that sanity model (see module 25).

---

## 2. Safety Kernel

### 2.1 State machine

```
GREEN(phase) ──request/forced──▶ YELLOW(3.5 s) ──▶ ALL_RED(2.0 s) ──▶ GREEN(next)
        any ──failSafe()──▶ FLASH_RED ──recover()──▶ ALL_RED(2.0 s) ──▶ GREEN(baseline fixed phase)
```

API (the only mutation surface):

```ts
kernel.step(request: ControlAction | null, evp: EvpDirective | null, dtS: number): SignalState
kernel.failSafe(): void
kernel.recover(): void
kernel.violationsPrevented: Record<ViolationType, number>
```

### 2.2 Invariants (`assertInvariants(prev, next)` — one readable function, shared by prod and tests)

| ID | Invariant |
|---|---|
| **I1** | No two lanes belonging to different phases are non-red at the same time. |
| **I2** | Every GREEN→different-GREEN passes `YELLOW` for exactly 3.5 s (±dt) then `ALL_RED` for exactly 2.0 s (±dt). |
| **I3** | Normal green lasts ≥ `G_MIN_S` and ≤ `G_MAX_S`; EVP may truncate the minimum (documented) and extend to 90 s. |
| **I4** | A phase with demand never waits more than `MAX_RED_WAIT_S` (+60 s grace after EVP recovery). |
| **I5** | `YELLOW` and `ALL_RED` can never be shortened by any caller, including EVP. |
| **I6** | `FLASH_RED` is entered only via `failSafe()`; exit only via `recover()` through `ALL_RED`. |

Illegal requests are **clamped, counted and explained** (`violationsPrevented[type]`, reason string for the UI) — never silently dropped, never executed.

### 2.3 ConflictMonitor

Runs every tick on the *output* state. In tests/dev: throws `SafetyViolationError`. In production mode: increments a counter and forces `failSafe()`. The UI shows **"0 conflicts in N ticks"**.

---

## 3. Fixed-Time Controller (baseline)

- 4 phases, 90 s cycle: lefts 10 s green, throughs 24 s green, each + 3.5 yellow + 2.0 all-red.
- Optional legacy 2-phase NS/EW 40/40 s comparator.
- Cycle length asserted at `90.0 ± 0.1 s` in simulation.

---

## 4. Adaptive Controller

Decision cadence: **re-plan every `PLANNING_WINDOW_S` (10 s) boundary or on a threshold event**; hold logic runs every tick.

```
every tick (dt = 0.1 s):
  if EVP directive active             → follow EVP state machine
  if phaseTime < G_MIN_S              → hold                         # safety (kernel-enforced)
  every 10 s or on event: compute pressure[phase]
  cur = pressure[current]; best = argmax over phases with demand, excluding current
  if phaseTime >= G_MAX_S and best has demand                → switch
  if phaseTime < G_MIN_EFFICIENT_S                           → hold  # switching-cost guard
  if current empty ≥ GAP_S and best has demand               → switch
  if best.pressure > RATIO·cur + FLOOR                       → switch
  else hold
```

Additional rules:
- Phases with **zero demand are skipped**; if all are empty, **rest** on the last phase (or all-red-rest if configured) — no needless cycling.
- Every decision returns `{requestedPhase, reason, pressures}`; the *rule that fired* is machine-readable (`RATIO`, `GAP_OUT`, `MAX_GREEN`, `EVP`, `HOLD_EFFICIENCY`, `HOLD_SAFETY`) — this feeds the explainability panel and the AI `explainDecision`.
- All tunables live in one `AdaptiveParams` object with zod bounds; defaults are *starting points*. **Final values come from tuning on train seeds and are reported on held-out seeds.**

Acceptance (smoke, Task 3): balanced 450/150 — adaptive not worse than fixed by > 10 %; NS-heavy 800/150 — better by > 15 %; average adaptive phase duration under balanced demand ≥ 15 s.

---

## 5. Emergency Vehicle Preemption

### 5.1 Validation (reject + count; rejections never flicker signals)

| Check | Rule |
|---|---|
| Speed | `speedMps ∈ [3, 35]` |
| Distance | `distanceM ∈ [20, 800]` |
| Duplicate `id` | Idempotent: return the same decision |
| Duplicate `nonce` | Replay ⇒ reject |
| Rate limit | ≤ 1 request / 10 s / `source` |
| Unknown lane | Reject |
| Storm guard | > 20 requests / 10 s overall ⇒ ignore new requests for 30 s, keep serving accepted ones |

### 5.2 Planning

```
ETA               = distanceM / speedMps                       (recomputed every tick from real position)
queueFlushS       = START_UP_LOST(2.0) + 2.0 × vehiclesAheadInLane
requiredLeadS     = (conflicts ? YELLOW_S + ALL_RED_S : 0) + PRECLEAR_S(8) + queueFlushS
plan              = ETA ≥ requiredLeadS ? OK : TIGHT (start immediately, report shortfallS)
```

**Worked example (why 150 m is not enough):** 150 m at 15 m/s ⇒ ETA 10 s; required ≈ 3.5 + 2.0 + 8 = 13.5 s + queue flush. The plan is `TIGHT`; the sweep (150/300/500 m) is a first-class result, not an afterthought.

### 5.3 State machine

`IDLE → PRECLEAR → EMS_GREEN → RECOVERY → IDLE`

- If the EMS approach phase is already green: keep it (extend to EVP hold ≤ 90 s). No switching.
- `EMS_GREEN` holds until the vehicle exits the box + 2 s, or 90 s timeout.
- `RECOVERY` (60 s, tunable): boost interrupted phases, guarantee each ≥ `G_MIN_S`, then resume. No phase waits more than `MAX_RED_WAIT_S + 60 s`, even after repeated EVPs.
- Multiple EMS: priority by earliest required-lead deadline; same-phase requests served together; a conflicting second request waits until the first exits.
- `cancelRequest(id)` returns to normal control **through** yellow/all-red if needed.

### 5.4 Timeline events (UI + audit)

`requested → accepted|rejected(reason) → preclear_started → green_granted → vehicle_exited → recovery_done`, each with sim-time and wall-time.

---

## 6. Fail-Safe & Watchdog (simulated)

- `Watchdog` expects a heartbeat from the control loop every tick; a missed deadline calls `failSafe()` ⇒ `FLASH_RED` within one tick.
- `recover()` ⇒ `ALL_RED` 2.0 s ⇒ baseline fixed-time phase.
- Claim only the **measured** simulated reversion time. Do not claim a 200 ms hardware property.

---

## 7. Demand Fairness & Benchmark Integrity

- Arrivals per lane: Poisson from `splitRng(seed, "arrivals:<lane>")`; vehicle types from `splitRng(seed, "types:<lane>")`. Identical regardless of controller or lane fullness.
- Full lane ⇒ entry buffer ≤ 30 s ⇒ **DENIED**, counted per lane and reported (never silently dropped).
- Live edits (`setLaneDemand`, `setModalSplit`, spawns, incidents) are recorded in an ordered **input log** keyed by tick, applied to **both** twins, enabling exact replay and shareable links.
