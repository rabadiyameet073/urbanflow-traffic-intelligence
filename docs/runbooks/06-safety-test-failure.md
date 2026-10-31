# Runbook 06: Safety Test Failure (Stop-The-Line Procedure)

## Trigger
- Any unit, property, or differential safety test fails in CI or local verification (`packages/core/test/core.test.ts` or `ConflictMonitor`).
- `kernel.conflicts > 0` detected in any simulation tick.

## Immediate Actions
1. **P0 Stop-The-Line:**
   - **Never weaken or disable a safety test to make CI green (Rule 17).**
   - Halt all feature commits and PR merges immediately.
2. **Bisect & Identify Fault:**
   - Run `git bisect` between last known green commit and HEAD to locate the regression.
3. **Analyze Kernel Invariant State:**
   - Inspect the state dump from `ConflictMonitor.assertInvariants()`.
   - Check which invariant was violated:
     - I1: Conflicting greens / non-red indications across different phases.
     - I2: Yellow truncated before 3.5s.
     - I3: Minimum green truncated before 7.0s.
     - I4: Starvation wait exceeded 120s.
     - I5: All-red truncated before 2.0s.
     - I6: Illegal transition exiting FLASH_RED without passing through ALL_RED.
4. **Fix Safety Kernel Sole Mutator:**
   - Fix the state machine logic in `packages/core/src/control/kernel.ts`.
5. **Add Regression Mutant Test:**
   - Add a test reproducing the exact failure sequence before declaring resolution.
