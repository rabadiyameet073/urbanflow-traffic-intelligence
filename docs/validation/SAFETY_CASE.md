# UrbanFlow AI — Safety Case & Invariant Proofs

> **The One Architecture Rule:** The deterministic controller and the Safety Kernel decide signals. The data pipeline only observes and stores. AI only advises.

---

## 1. Safety Kernel Invariants (I1 – I6)

The Safety Kernel is the **sole writer** of `SignalState` across the entire codebase.

| ID | Formal Invariant | Enforced by | Asserted by a test |
|---|---|---|---|
| **I1** | No two lanes belonging to different phases are non-red simultaneously ($\forall a, b \in \text{Lanes}, \text{Phase}(a) \neq \text{Phase}(b) \implies \neg (\text{NonRed}(a) \land \text{NonRed}(b))$). | Conflict monitor inside the kernel; a detected conflict forces `failSafe()` | **Yes** — `core.test.ts` "enforces Invariant I1: no conflicting non-red indications" |
| **I2** | Every `GREEN` $\to$ different-`GREEN` transition passes through `YELLOW` for exactly 3.5 s ($\pm dt$) then `ALL_RED` for exactly 2.0 s ($\pm dt$). | State-machine hard constraint | **Yes** — `core.test.ts` "enforces Invariant I2: transitions pass through yellow (3.5s) and all-red (2.0s)" |
| **I3** | Normal green duration is bounded within $[G_{\min}, G_{\max}] = [7.0\,\text{s}, 65.0\,\text{s}]$ (extended up to 90 s only under active EVP hold). | Parameter clamping on the request type | **No** — no test asserts the green bounds directly |
| **I4** | Anti-starvation: any phase with queued demand is served within $120.0\,\text{s}$ ($+60\,\text{s}$ grace after EVP recovery). | Continuous red-wait tracking and a kernel-forced switch | **No** — this is the largest evidence gap in the safety case. See `TEST_REPORT.md` QA-03 |
| **I5** | Yellow (3.5 s) and All-Red (2.0 s) cannot be shortened or bypassed by any caller, including emergency preemption. | Structural: the request type has no field that could express a shorter interval, so the operation is unrepresentable rather than merely rejected | **Indirectly** — I2's test covers the timing; the "no caller can ask" property is a type-level guarantee |
| **I6** | `FLASH_RED` is entered only via `failSafe()`; recovery requires passing through `ALL_RED` before serving the baseline fixed phase. | State-machine transition check | **Yes** — `core.test.ts` I6 plus four watchdog tests in `system_design.test.ts` |

---

## 2. Watchdog & Reversion Timing

- The simulated watchdog expects a periodic heartbeat from the control loop on every 0.1s tick.
- If a deadline is missed or perception data is corrupted, `failSafe()` transitions the signal heads to `FLASH_RED` within a single simulation tick (100 ms).
- Signal recovery calls `recover()`, enforcing a full 2.0-second `ALL_RED` clearance before restoring the baseline fixed-time controller.

---

## 3. What This Case Does Not Prove

A safety case that lists only its strengths is not a safety case. The following
claims are **not** made, and a reviewer should treat them as open:

1. **I3 and I4 have no automated evidence.** The bounds are enforced by code
   paths that were reviewed by hand. No test drives a lane past 120 s of red, so
   the anti-starvation property is an argument, not a measurement.
2. **"No conflict" is checked at phase granularity.** The kernel models four
   coarse phases. It does not model permissive-protected left-turn conflicts,
   pedestrian crossings, or right-turn-on-red interactions. A conflict outside
   that model would not be detected.
3. **The watchdog is a software watchdog.** Its 100 ms reversion is measured in
   the simulation loop. It is not a hardware conflict monitor unit and cannot
   substitute for one.
4. **Nothing here is certified.** No third-party assessment, no formal
   verification tool, no DoT sign-off. The invariants are enforced and partly
   tested; they are not independently assured.
5. **Determinism is a property of one implementation.** The state hash is
   asserted bit-identical across runs of this engine, not across runtimes
   (see `TEST_REPORT.md` QA-08, not run).

## 4. Reproducing the Evidence

```bash
npx vitest run packages/core     # I1, I2, I6, watchdog, determinism
pnpm bench                       # kernel conflicts: 0 across 8 scenarios, both controllers
```

`pnpm bench` writes `integrity.kernelConflicts` from the kernel's own counter,
summed across both controllers in every scenario. It is not asserted by the
benchmark itself — the number is read back from the component that would have to
increment it.
