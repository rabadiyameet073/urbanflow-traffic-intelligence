# Skill: safety-kernel

**Use when:** Any change touching the Kernel, ConflictMonitor, watchdog or request validation.

**Read first:** `platform-specifications/03`, `system-design/13`, Rule 06

## Rules

1. Kernel is a small explicit state machine: GREEN → YELLOW → ALL_RED → GREEN, plus FLASH_RED.
2. Validate requests: known phase, not already active, min green elapsed, no pending conflicting request; return reason codes.
3. ConflictMonitor re-checks invariants every tick independent of the state machine; any breach → FLASH_RED.
4. Watchdog: if no valid tick/decision within the limit → FLASH_RED; recover only via ALL_RED.
5. Keep the reference model (≤ 80 lines) in tests; differential test every change.
6. Every branch is tested; mutation testing targets this directory.

## Good / Bad

- ✅ `return {ok:false, code:'MIN_GREEN_ACTIVE', retryAfterS}`
- ❌ Letting a controller flip phase directly.

## Landmines

- Timer comparisons on floats: use tick counters (integers) for durations.
- Request ordering ties must be deterministic.
