# Skill: debug-playbook

**Use when:** Diagnosing a failing test, wrong result, hash mismatch or deployment problem.

**Read first:** `system-design/16`, `quality-and-audits/62`

## Rules

1. Reproduce first with the smallest seed/config; record it.
2. Bisect: git history, then controller vs Kernel vs sim vs render.
3. Hash mismatch: diff per-subsystem hashes tick by tick; suspect non-portable math, RNG stream order, unordered iteration.
4. Check the contracts and units before logic.
5. Fix root cause, add a regression test, note the learning in the task.
6. Two failed attempts → record a blocker (Rule 04).

## Good / Bad

- ✅ Find first diverging tick with per-array hashes.
- ❌ Adding sleeps or retries.

## Landmines

- Browser vs Node float differences usually come from `Math.*` transcendental functions.
