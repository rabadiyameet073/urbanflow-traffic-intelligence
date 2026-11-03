# Skill: benchmarking-statistics

**Use when:** Running or reporting benchmarks.

**Read first:** `backend-engineering/25`, Rule 00

## Rules

1. Paired seeds: same arrivals for Fixed and Adaptive; difference per seed.
2. Bootstrap 95 % CI (seeded) over seed-level differences; report median and CI.
3. Train seeds 1–100 for tuning; held-out 1001–1050 for claims; never mix.
4. 8 scenarios; include ones where Adaptive ties or loses.
5. `results.json` has a schema, tool versions, commit and input hash; docs are generated from it.
6. Re-run must reproduce numbers exactly.

## Good / Bad

- ✅ `Δ person-delay: −x.x % [CI a, b] (n=50)`
- ❌ Averaging over seeds with unequal arrivals.

## Landmines

- Do not report p-hacked best scenarios; declare the scenario list in advance.
- Bootstrap RNG must be seeded.
