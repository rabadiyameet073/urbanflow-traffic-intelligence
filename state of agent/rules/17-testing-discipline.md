# Rule 17 — Testing Discipline (inviolable)

Tests are the evidence behind every claim. Safety code gets the full verification ladder.

## Protocol

1. Bug fixes start with a failing test; features ship with tests in the same commit.
2. Safety code (Kernel, EVP validation, HMAC, schema validators) needs unit + property + (Kernel) exhaustive BFS + differential tests; mutation testing when scheduled.
3. Tests are deterministic: seeded RNG, injected clock, no real network. A flaky test is quarantined within the hour (with a task) and fixed within the day. No retries to hide flakiness.
4. Property-test failures log the seed and shrunk counter-example and become permanent regression tests.
5. Never weaken, delete or `.skip` a test to get green. Changing a test requires a reason in the commit body.
6. No live model/API calls in CI; AI paths use recorded fixtures and adversarial cases.
7. Float assertions use tolerances; state-hash equality is exact; snapshots only for contracts/templates/wire formats.
8. Coverage targets (kernel 100 % branch, controllers ≥ 95 %, core ≥ 90 %) are smoke alarms; mutation score and invariants matter more.
9. Test reports are generated from tool output (`docs/TEST_REPORT.md`).

## Good / Bad

| ✅ | ❌ |
|---|---|
| fast-check run with logged seed, shrunk case added as regression | "Passed once locally" |
| Fix `Math.random` source of flake | `retry: 3` |

## Enforcement

CI required checks, QA matrix (module 64), review checklist §2.4, `audit.sh` A1 for test helpers in `core`.
