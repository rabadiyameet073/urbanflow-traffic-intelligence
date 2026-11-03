# Skill: evp-preemption

**Use when:** Working on emergency vehicle detection, planning, or the EVP gateway.

**Read first:** `platform-specifications/03`, `backend-engineering/21`, `system-design/14`

## Rules

1. Detection distance is a parameter (default 300 m; sweep 150/300/500). 150 m can be infeasible: ETA 10 s < ≈13.5 s needed.
2. Queue Flush Planner estimates the time to clear vehicles ahead; classify ACCEPTED / TIGHT / INFEASIBLE / REJECTED with reasons.
3. Plan runs through the Kernel: yellow and all-red are never skipped.
4. Edge requests are HMAC-signed, nonce-checked, time-bounded and schema-validated.
5. Model ambulance filtering (vehicles yield) and report results as a sweep, not a single number.
6. Restore normal operation with a recovery plan and fairness catch-up.

## Good / Bad

- ✅ Show TIGHT with the numbers behind it.
- ❌ Promising preemption when feasibility fails.

## Landmines

- Replay protection needs durable nonce storage (Durable Object SQLite).
- Clock skew: use a tolerance window and server time.
