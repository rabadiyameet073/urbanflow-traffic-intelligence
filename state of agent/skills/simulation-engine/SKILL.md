# Skill: simulation-engine

**Use when:** Working in packages/core/src/sim or metrics.

**Read first:** `backend-engineering/20`, Rule 07, `platform-specifications/02`

## Rules

1. IDM car-following with per-vehicle parameters from seeded streams; fixed `SIM_DT = 0.1 s`.
2. State in struct-of-arrays typed arrays; indexed loops; no allocation per tick.
3. Spawn via Poisson arrivals from a named RNG stream; record inputs for replay.
4. Every tick order is fixed: arrivals → controllers' requests → Kernel → vehicle update → metrics.
5. Conservation: spawned = on-road + exited + dropped(counted).
6. Expose `stateHash()` and `snapshot()/restore()`.

## Good / Bad

- ✅ `for (let i=0;i<n;i++){ … }` over `Float32Array`s.
- ❌ `vehicles.forEach` with object allocation.

## Landmines

- Avoid `Math.pow/exp/log`; use `detLn` and algebraic forms.
- Adding an RNG draw changes every later random number; use split streams.
