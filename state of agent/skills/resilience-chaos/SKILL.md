# Skill: resilience-chaos

**Use when:** Implementing degradation, fault injection or chaos mode.

**Read first:** `system-design/13`, Rule 06

## Rules

1. Degradation ladder: full → AI template → no edge (core only) → offline → Kernel FLASH_RED; each rung has a UI state and a test.
2. Fault injection toggles: drop telemetry, delay/duplicate requests, stall controller, kill AI provider, corrupt inputs.
3. Every failure maps to a visible, honest status; never silent.
4. Timeouts, retries with jitter, circuit breakers on external calls.
5. Chaos runs are seeded and recorded; soak for 24 simulated hours.
6. Recovery returns through ALL_RED.

## Good / Bad

- ✅ `chaos.stallController(30)` → watchdog → FLASH_RED → recover.
- ❌ Catch-all that hides outages.

## Landmines

- Chaos tools must be disabled or clearly marked in the public demo.
