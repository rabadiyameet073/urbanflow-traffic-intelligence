# Module 60: Testing Strategy

> Tests are the evidence behind every claim in the safety case and the README. A claim without an executable test is an opinion.

---

## 1. The Pyramid (and where each risk is caught)

| Layer | Tooling | Scope | Gate |
|---|---|---|---|
| **Unit** | Vitest, pytest | Pure functions: IDM step, pressure, scoring, EWMA, canonical JSON, HMAC | `pnpm test` / `pytest` on every commit |
| **Property** | fast-check, Hypothesis | Kernel invariants I1–I6, determinism, schema round-trips, window aggregation | `pnpm verify` (CI: 200 runs; nightly: 5,000) |
| **Exhaustive** | Vitest + BFS | Kernel state graph over a bounded model (all request/tick sequences to depth N) | `pnpm verify` |
| **Differential** | Vitest | Production kernel vs a tiny independent reference model on random traces | `pnpm verify` |
| **Mutation** | Stryker (kernel only, optional) | Does the suite fail when a safety line is altered? | Pre-submission; cut-line item |
| **Contract** | Vitest | zod schemas ↔ JSON Schema ↔ Spark schema parity; golden wire fixtures | `pnpm verify` |
| **Integration** | Vitest + Miniflare, pytest + local Spark | Edge routes, DO nonce store, Spark job on fixtures | CI / `make test` |
| **E2E** | Playwright | Real browser: load, run, EVP, Judge Mode, keyboard-only, offline | `pnpm e2e` |
| **Visual** | Playwright screenshots | Control-room layout, tokens, themes | `pnpm e2e` (baselines reviewed by a human) |
| **Accessibility** | axe + manual | Zero serious/critical; keyboard + screen-reader pass | `pnpm e2e` + checklist |
| **Performance** | Vitest bench, Lighthouse, Playwright trace | Sim speed, frame p95, bundle size | `pnpm perf` |
| **Chaos/Soak** | Custom harness | Fault injection; 24-sim-hour run | Nightly + pre-submission |
| **Live smoke** | `scripts/smoke-live.sh` | Deployed URL: health, one EVP, one diagnosis, headers | After each deploy |

---

## 2. Rules

1. **Test behaviour, not implementation.** Assert on outputs/invariants; refactors must not break tests.
2. **Deterministic by construction.** Seeded RNG, injected clocks; a flaky test is a bug: quarantine within the hour, fix within the day, never "retry until green".
3. **Arrange–Act–Assert**; one logical assertion per test; names state behaviour.
4. **Property tests must log the failing seed and shrunk counter-example**; when found, convert it into a permanent regression test.
5. **Safety code gets the full ladder** (unit → property → exhaustive → differential → mutation). Non-safety code needs unit + one higher layer where it matters.
6. **Floating-point assertions** use tolerances (`toBeCloseTo`, relative 1e-9) **except** state-hash equality, which is exact.
7. **No network in unit tests.** Fakes for Meta API (record/replay fixtures), Kafka (in-memory), clock.
8. **Test data lives in `fixtures/`** with a README on regeneration; large fixtures are generated, not committed.
9. **Coverage is a smoke alarm, not a goal.** Targets: kernel 100 % branch, controllers ≥ 95 %, core ≥ 90 %, edge ≥ 85 %, web logic ≥ 70 %. Mutation score on kernel ≥ 85 % when run.
10. **A bug fix starts with a failing test.**
11. **Snapshots only for contracts/templates/wire formats**; never for simulation floats.
12. **Tests are code:** typed, linted, reviewed, no `any`, no commented-out cases, `.todo` requires a linked task.

---

## 3. Kernel Verification Ladder (detail)

### 3.1 Property tests (fast-check)

```ts
it('never emits conflicting greens', () => {
  fc.assert(fc.property(arbRequestSequence(), (seq) => {
    const k = createKernel(CONFIG);
    for (const step of seq) {
      k.requestPhase(step.phase, step.t);
      k.tick(step.dt);
      expect(conflictingGreens(k.state())).toBe(false);        // I1
      expect(minGreenRespected(k.trace())).toBe(true);          // I2
    }
  }), { numRuns: 200, seed: SEED });
});
```

Generators: random request storms, EVP bursts, jittered `dt`, forced-fail injections, reordered/duplicated requests.

### 3.2 Exhaustive BFS

Discretise time to the 0.5 s grid within a bounded horizon; explore every reachable `(phase, subState, timer, pending)` tuple under the full request alphabet; assert I1–I6 in every state and that every state can reach ALL_RED within bounded time (liveness-lite). Record the explored-state count in `docs/TEST_REPORT.md`.

### 3.3 Differential testing

A ≤ 80-line reference model (obviously correct, slow, no optimisations) must produce identical `SignalState` sequences for the same inputs across 10,000 random traces.

### 3.4 Mutation testing

Mutate comparison operators, constants (G_MIN, YELLOW, ALL_RED), boolean guards, early returns in `control/kernel/**` only. Surviving mutants are triaged: add a test or document why the mutant is equivalent.

---

## 4. Simulation & Controller Tests

| Test | Assertion |
|---|---|
| Determinism | Same seed + config → identical `stateHash` after N ticks, across 3 runs **and** in Node + headless Chromium |
| Fixed-step invariance | Hash independent of render frame rate (accumulator test) |
| Conservation | Vehicles spawned = on-road + exited (+ dropped, counted) |
| No overlap/negative gap | Min bumper gap ≥ 0 for all ticks under stress seeds |
| Controller contract | Controllers emit **requests only**; never touch `SignalState` (type-level + runtime spy) |
| Fairness | No lane waits > MAX_RED_WAIT in the standard scenario |
| EVP | All outcome classes (ACCEPTED/TIGHT/INFEASIBLE/REJECTED…) reproduced with fixtures; queue-flush plan reduces ETA miss |
| Replay | Recording → replay reproduces the same hash |

---

## 5. Edge, Pipeline & AI Tests

- **Edge:** HMAC valid/invalid/expired/replayed; body-size limits; CORS; rate-limit; DO hibernation resume; every error code in the catalogue reachable and tested.
- **Pipeline:** window aggregation on fixed fixture (expected Parquet rows); watermark late-data case; DLQ routing; anomaly rule TP/TN/boundary; Lite mode equals full mode on the same fixture.
- **AI (offline, deterministic):** schema validation of recorded model outputs; **adversarial fixtures** (prompt injection, out-of-range params, extra keys, truncated JSON) must all end in a safe fallback; template fallback is exercised on every CI run; **no live model calls in CI**.
- **LLM evals** (module 24): labelled situations → expected diagnosis class; tracked score; regression threshold.

---

## 6. E2E Scenarios (Playwright)

| # | Scenario |
|---|---|
| E1 | Cold load → first frame < 2 s on throttled profile; no console errors |
| E2 | Run Fixed vs Adaptive same seed; KPIs update; compare view shows CI |
| E3 | Inject EVP via UI; banner, countdown, Kernel reason codes visible; ambulance clears |
| E4 | Judge Mode runs the scripted tour end to end |
| E5 | Keyboard-only: all controls reachable, focus visible, no traps |
| E6 | `prefers-reduced-motion` + `forced-colors` variants render and function |
| E7 | Offline (service worker/static) core mode works; Edge banner shows "unavailable" gracefully |
| E8 | AI down → template fallback labelled; app unaffected |
| E9 | Share link reproduces the same hash |
| E10 | 320 px, 768 px, 1440 px layouts: no horizontal scroll, controls usable |

Each E-scenario retries 0 times in CI; trace/video retained on failure.

---

## 7. Test Report (generated)

`pnpm test:report` writes `docs/TEST_REPORT.md`: commit, date, tool versions, suite counts, coverage, BFS state count, mutation score, property-test seeds, E2E results, Lighthouse scores. Numbers are copied from machine output, never typed.

---

## 8. Anti-Patterns

| ❌ | ✅ |
|---|---|
| `retry: 3` to hide flakiness | Fix determinism |
| Asserting floats with `===` | Tolerance or hash |
| Mocking the thing under test | Fake only boundaries |
| Test depends on wall clock/network | Inject clock; recorded fixtures |
| Huge snapshot of simulation output | Invariants + hash |
| Coverage-chasing trivial getters | Mutation score on safety code |
| "Works on my machine" E2E | CI-run, throttled, headless |
