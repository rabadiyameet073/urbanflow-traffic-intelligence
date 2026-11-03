# Rule 06 — Safety Kernel Supremacy (inviolable)

The deterministic **Safety Kernel is the only writer of `SignalState`**. Controllers, EVP, the edge and the AI submit *requests*; the Kernel grants, delays or rejects them.

## Protocol

1. Invariants I1–I6 hold in every reachable state: no conflicting greens; min green 7 s; yellow 3.5 s; all-red 2.0 s; max red wait 120 s; watchdog → `FLASH_RED`. Any two different phases conflict.
2. Safety timings (G_MIN, YELLOW, ALL_RED, MAX_RED_WAIT) are **not tunable** by any controller, parameter proposal, UI control or AI output.
3. Controllers return `PhaseRequest`s; they cannot import or hold a mutable `SignalState`.
4. EVP directives are validated by the Kernel (feasibility, clearance) like any request; an accepted EVP never skips yellow or all-red.
5. Failure path: invalid input or stalled controller ⇒ Kernel degrades to `FLASH_RED`, recovers only via `ALL_RED`. Never "best effort" green.
6. Changes under `core/control/kernel/**` require: new/updated property + BFS + differential tests, mutation run (when available), human review (CODEOWNERS), and an ADR if an invariant changes.
7. Safety comments use `// SAFETY: I<n> …`; no `// eslint-disable` or `@ts-ignore` in kernel code.

## Good / Bad

| ✅ | ❌ |
|---|---|
| `kernel.requestPhase('P2_NS_THRU', t)` → may return `{ok:false, code:'MIN_GREEN_ACTIVE'}` | `state.phase = 'P2_NS_THRU'` in a controller |
| AI proposes params; Kernel dry-run rejects `YELLOW_S = 1` | "Safety timing override" feature |

## Enforcement

Type design (read-only `SignalState` view for non-kernel code), `audit.sh` A4, QA-01…06, review checklist §2.1.
