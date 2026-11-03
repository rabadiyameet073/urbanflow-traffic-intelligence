# Rule 07 — Determinism and Purity (inviolable)

`@urbanflow/core` is a pure, deterministic library. Same seed + config + inputs ⇒ the same state hash on every machine, browser and run. This is what makes benchmarks, replay, share links and the safety case credible.

## Protocol

1. No `Math.random`, `Date`, `performance`, timers, DOM, `fetch`, `crypto`, Node APIs in `core` (tsconfig `lib` excludes DOM; ESLint bans them).
2. Randomness only from the seeded `mulberry32` with **named split streams** (`arrivals`, `vehicleSpec`, `behavior`, `evp`); adding a stream never reorders existing ones.
3. No `Math.pow/exp/log/sin/cos/…` or `**` in sim/control paths (engine-dependent last-bit differences). Use `detLn` and basic `+ − × ÷ sqrt` only (module 20).
4. Fixed timestep `SIM_DT = 0.1 s`; rendering uses an accumulator and never feeds wall time into state.
5. Iterate in fixed index order; never rely on object key or `Set/Map` insertion order for results.
6. State hash = FNV-1a 64 over typed-array bytes; golden hashes updated **only** with an explained reason in the commit body.
7. Recorded inputs (requests, EVP) are part of the replay log; replay must reproduce the hash.
8. Cross-engine test (Node + headless Chromium) runs in CI.

## Good / Bad

| ✅ | ❌ |
|---|---|
| `const r = rng.arrivals(); if (r < p) spawn()` | `if (Math.random() < p)` |
| `detLn(x)` | `Math.log(x)` in IDM/pressure |

## Enforcement

`audit.sh` A1–A3, QA-07…10, determinism property tests, review checklist §2.1.
