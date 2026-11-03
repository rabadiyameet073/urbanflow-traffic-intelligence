# Rule 02 — Gates (inviolable)

Nothing is "done" until the gates say so, and gates are never bypassed.

## Protocol

1. **Per commit/PR:** `pnpm verify` (typecheck, lint, unit, property, BFS, differential, docs check, size) **and** `bash helpers/audit.sh` exit 0.
2. **Per deploy:** `pnpm build && pnpm e2e && pnpm perf` then `scripts/smoke-live.sh` (module 61 §2).
3. **Pre-submission:** module 61 §3 (20-point list) and QA matrix (module 64) all PASS or explicitly cut under Rule 15.
4. Do not skip, `.skip`, loosen thresholds, add retries, or comment out checks to get green. Fix the cause or record a human-approved exception in `docs/AUDIT_LOG.md` with a task.
5. A red gate stops feature work: fix it, or revert the change.
6. "Done" requires evidence: the command, the key output line, the commit. If not run, write **"not verified"**.
7. Gate scripts are themselves code: changes to them need human review (CODEOWNERS).

## Good / Bad

| ✅ | ❌ |
|---|---|
| "`pnpm verify` → 214 passed, BFS 48,213 states, exit 0 @ a1b2c3d" | "Should pass" |
| Flaky test quarantined with a task, root-caused next day | `retry: 3` |

## Enforcement

CI required checks on `main`; `validate-pack.mjs`; agent hand-off message must quote results (module 62 §4).
