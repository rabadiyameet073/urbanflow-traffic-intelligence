# Skill: performance-budgets

**Use when:** Profiling, optimising or reviewing performance.

**Read first:** `system-design/15`, Rule 14

## Rules

1. Measure first: headless sim speed, frame time p95, bundle size, Lighthouse.
2. Optimise the measured bottleneck; attach before/after numbers.
3. Keep hot loops allocation-free; transfer buffers; throttle DOM updates to ≤ 10 Hz.
4. Lazy-load Copilot and Camera Mode code.
5. Budgets fail CI; do not raise them without an ADR.

## Good / Bad

- ✅ Frame p95 14 ms → 11 ms after buffer pooling.
- ❌ Micro-optimising without a profile.

## Landmines

- Dev-mode performance is meaningless; measure production builds.
