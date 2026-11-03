# Skill: adaptive-controller

**Use when:** Changing the adaptive controller or its parameters.

**Read first:** `platform-specifications/03`, `backend-engineering/25`, Rule 00

## Rules

1. Pressure per phase from lane queue, wait time, vehicle weights (modal split) per module 02.
2. Switch rule: efficiency hold ≥ `G_MIN_EFFICIENT` (default 25 s, range 12–40) and `otherPressure > RATIO×current + FLOOR` (RATIO 3, FLOOR 8); gap-out with GAP 3.
3. Fairness: starvation guard before MAX_RED_WAIT; the Kernel remains final authority.
4. Tune on train seeds only; evaluate on held-out; keep the tuning log.
5. Parameter ranges are enforced by zod; safety timings are not parameters.
6. The controller emits requests and a human-readable reason for the decision ledger.

## Good / Bad

- ✅ `request(P4_EW_THRU, reason:'EW pressure 31 > 3×9+8')`
- ❌ Switching every 7 s because the minimum allows it.

## Landmines

- A naive adaptive controller can be worse than fixed-time; switching cost is the reason for the hold.
