# Skill: testing-property-based

**Use when:** Writing property, exhaustive or differential tests.

**Read first:** `quality-and-audits/60`, Rule 17

## Rules

1. Write generators for the input space (request storms, EVP bursts, jittered dt, faults).
2. State the invariant first, then the property.
3. Log the seed; convert shrunk failures into regression tests.
4. Bounded exhaustive BFS over the Kernel state graph; record the state count.
5. Differential: production Kernel vs ≤ 80-line reference over 10⁴ random traces.
6. Mutation testing triages survivors.

## Good / Bad

- ✅ `fc.assert(fc.property(arbReq, p => !conflictingGreens(run(p))), {seed})`
- ❌ Examples-only tests for the Kernel.

## Landmines

- Generators that are too narrow give false confidence; include illegal and extreme inputs.
