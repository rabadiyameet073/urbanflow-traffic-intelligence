# UrbanFlow AI — Safety Case & Invariant Proofs

> **The One Architecture Rule:** The deterministic controller and the Safety Kernel decide signals. The data pipeline only observes and stores. AI only advises.

---

## 1. Safety Kernel Invariants (I1 – I6)

The Safety Kernel is the **sole writer** of `SignalState` across the entire codebase.

| ID | Formal Invariant | Verification Method | Enforcement |
|---|---|---|---|
| **I1** | No two lanes belonging to different phases are non-red simultaneously ($\forall a, b \in \text{Lanes}, \text{Phase}(a) \neq \text{Phase}(b) \implies \neg (\text{NonRed}(a) \land \text{NonRed}(b))$). | ConflictMonitor assertion every tick + Exhaustive BFS | `SafetyViolationError` in tests; forces `failSafe()` in production |
| **I2** | Every `GREEN` $\to$ different-`GREEN` transition passes through `YELLOW` for exactly 3.5 s ($\pm dt$) then `ALL_RED` for exactly 2.0 s ($\pm dt$). | Property-based testing | State machine hard constraint |
| **I3** | Normal green duration is bounded strictly within $[G_{\min}, G_{\max}] = [7.0\,\text{s}, 65.0\,\text{s}]$ (extended up to 90 s only under active EVP hold). | Parameter clamping | Hard transition check |
| **I4** | Anti-starvation bound: any phase with queued demand is guaranteed service within $120.0\,\text{s}$ ($+60\,\text{s}$ grace following EVP recovery). | Continuous red wait tracking | Kernel forced switch |
| **I5** | Yellow (3.5 s) and All-Red (2.0 s) intervals cannot be shortened or bypassed by any caller, including emergency preemption. | Code structure | Inviolable state transition timer |
| **I6** | `FLASH_RED` is entered only via `failSafe()`; recovery to normal operation requires passing through `ALL_RED` before serving the baseline fixed phase. | State machine transition check | Recovery sequencing |

---

## 2. Watchdog & Reversion Timing

- The simulated watchdog expects a periodic heartbeat from the control loop on every 0.1s tick.
- If a deadline is missed or perception data is corrupted, `failSafe()` transitions the signal heads to `FLASH_RED` within a single simulation tick (100 ms).
- Signal recovery calls `recover()`, enforcing a full 2.0-second `ALL_RED` clearance before restoring the baseline fixed-time controller.
