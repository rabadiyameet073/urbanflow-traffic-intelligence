# Preflight Audit Log

Evidence for the checks that were actually executed, recorded at the time they
were run. A check that has not been run is written as **not run** rather than
green — an unverified box is not a passed box.

Environment: Windows 11 22H2, PowerShell, Node via pnpm workspaces, `tsc 5.6.x`.

## 1. Build and Test Gate

| Check | Command | Result |
|---|---|---|
| Monorepo typecheck | `pnpm typecheck` (`tsc -b`) | **exit 0** — core, edge, bench, web all compile under `strict` + `noUncheckedIndexedAccess` |
| Test suite | `pnpm vitest run` | **119 passed, 8 skipped, 0 failed** — 11 files (the skipped file is the gated regression suite; it runs via `pnpm test:regression`, see §6). Earlier figure was 78 tests / 6 files at the time of the first pass |
| Edge gateway suite | `pnpm vitest run packages/edge` | **19 tests, all passing** (~77 ms) |
| Web package typecheck | `npx tsc -p packages/web/tsconfig.json --noEmit` | **exit 0**, 11 source files confirmed via `--listFiles` |
| Core package typecheck | `npx tsc -p packages/core/tsconfig.json --noEmit` | **exit 0** |
| Documentation consistency | `node scripts/docs-check.mjs` | **exit 0** — 8 scenarios and 3 sweep points verified against the artefacts |
| Architectural fitness | `pnpm fitness` (`node scripts/fitness.mjs`) | **7 of 7 pass** — purity, dependency law, no cycles, single `SignalState` writer, 75.69 KiB gz, no secret in the bundle, headers present |
| Web bundle | `pnpm --filter @urbanflow/web build` | **exit 0** — 266.72 KiB raw JS across the main, worker, camera and copilot chunks = **75.69 KiB gzipped**, 33.4 KiB CSS; `dist/_headers`, `dist/robots.txt`, `dist/sitemap.xml` present. The separate `sim.worker-*.js` chunk is the evidence that the simulation is bundled as a Worker |

## 2. Benchmark Regeneration

| Check | Command | Result |
|---|---|---|
| Full benchmark | `npx tsx packages/bench/src/index.ts` | `results.json` and `ems-sweep.json` regenerated |
| Conservation | in-run assertion | `conservationOk: true` for both controllers in all 8 scenarios |
| Kernel conflicts | `SafetyKernel.getMetrics().conflicts` summed | `0` in all 8 scenarios, both controllers |
| Non-finite metrics | runner assertion | no `NaN` / `Infinity` in any published field |

## 3. Integrity Findings (and what they invalidated)

These were discovered during the preflight audit. Findings 1–6 invalidated
previously published numbers, which were regenerated; 7–20 changed behaviour or
claims without moving a published figure, and none of them is a number problem —
each is a place where the code did something other than what the document said.

| # | Finding | Effect before fix | Fix |
|---|---|---|---|
| 1 | Inverted IDM leader gap (`leaderPos - pos - leaderLen`) pinned every second vehicle per lane at `pos ≈ 293 m, vel 0` | 55–87 % of arrivals denied; throughput ≈ 438 veh/h | gap corrected to `pos - leaderPos - leaderLen` |
| 2 | `avgDelayS` multiplied the measured mean by `0.9` | delay understated by 10 % | measured `delayS / exits` |
| 3 | `throughputVph` hard-coded to `{1850, 1980}` | fictitious | `exits / simSeconds * 3600` |
| 4 | `kernelConflicts` hard-coded to `0` | unverifiable claim | summed from the kernel's own counter |
| 5 | EVP sweep initialised delays to `18.0` / `9.5` / `2.5` and derived TIGHT from arithmetic | three identical sweep rows with zero-width CIs | physical spawn + `EvpDirective.planStatus` |
| 6 | `docs/RESULTS.md` claimed "Fixed 79.48 vs Adaptive 117.25 = −55.9 %, Adaptive Wins" | self-contradictory | regenerated from artefacts; parity rows retained |
| 7 | `README.md` and ADR 0007 claimed "Canvas 2D rendered in a Web Worker with transferable buffers"; `grep 'new Worker' packages/web/src` returned **0 matches**, and physics ran in `requestAnimationFrame` on the main thread | a headline architectural claim with no code behind it | implemented Module 31 for real (`core/worker/*`, `core/sim/geometry.ts`, `web/worker/*`); the claim is now true rather than deleted |
| 8 | `SimEngine` shallow-copied its config, so both twins shared one `laneDemandVph` and one `modalSplit` object | an edit to one twin silently changed the other, and the caller's object | each engine copies its nested records in the constructor |
| 9 | Time-travel replay rebuilt from the *mutated* config and re-applied logged edits | one extra RNG draw per re-armed lane, so a scrub produced a different future than the run it was reproducing | rebuilds start from a `baseConfig` captured at construction |
| 10 | `index.html`, `sitemap.xml` and `robots.txt` published `urbanflow.pages.dev`; `wrangler.toml` `ALLOWED_ORIGINS` and `docs/DEPLOY.md` say `urbanflow-ai.pages.dev` | wrong canonical URL, and a `og:image` that would 404 | aligned all three to the name the Worker's CORS list requires |
| 11 | `EvpManager.reject` called `new Date()` inside `packages/core` while the accept path used a fixed simulated epoch | a rejected request carried a different clock from an accepted one, and two runs of one seed produced different audit records (Rule 07) | one `serverTimeAt(simTimeS)` helper for both branches, asserted by a test |
| 12 | A second EVP request overwrote `activeEms` without a word | the vehicle the operator was watching disappeared from the plan | same-phase requests share the running plan; conflicting ones get `PREEMPTION_ACTIVE` |
| 13 | `evaluateProposalWhatIf` documented cloning the simulation state; it built both arms from `t = 0` on `seed + 100` | the UI's what-if was described as something it was not, and it ran on an arrival stream unrelated to the scenario on screen | docstring corrected, dead `simTimeS` read removed, both arms now use the scenario's own seed |
| 14 | The adaptive rule shown in the explainability panel was whatever the controller had decided, even while an EVP directive was in force | the panel explained a decision that was not the one governing the signal | `TwinWorld` records `EVP` as the rule in force for those ticks, and the panel has copy for it |
| 15 | `platform_specifications.test.ts` asserted `typeof res.approved === 'boolean'` | a test that could not fail, guarding the 3 % approval gate | replaced by four assertions covering the neutral, out-of-bounds and kernel-violation paths |
| 16 | `ChaosEngine.injectPerceptionNoise` drew from `Math.random()` inside `packages/core`; `ControlLoopWatchdog` timed fail-safe latency with `performance.now()`; `toNtcip1202Status` and `createDebugBundle` stamped `new Date()`, and the bundle read `navigator` | the perception-noise curve could not be reproduced from any seed (Rule 00), the recorded fail-safe latency was JS scheduling jitter rather than control latency, and three timestamp fields disagreed about which clock they were on (ADR-001) | one simulated-clock helper (`helpers/sim-clock.ts`), an injected RNG stream, and simulated-time latency; a test asserts the noise replays and that it still perturbs |
| 17 | `control/what_if.ts` and `vision/camera_mode.ts` imported through the barrel `../index.js`, which re-exports them | two real import cycles, invisible because nothing checked (Module 10 §3.4) | both import from the defining modules; `pnpm fitness` fails the build on any cycle |
| 18 | The `safety` worker event forwarded only `{conflicts, violationsPrevented, ticks}`, collapsing the kernel's per-kind breakdown and its four gauges into one integer | Module 16 §4.1 lists those gauges as audit-panel metrics; they existed in the kernel and could not be displayed | the event carries them verbatim and the Audit panel renders them |
| 19 | `SimEngine` rebuilt the pre-first-tick `SignalState` literal itself; `createDebugBundle` defaulted `appVersion` to a hard-coded `'v1.0.0'` | a second writer of `SignalState` (Module 13 §2 E1), and a fabricated build identifier in a bug report | `INITIAL_SIGNAL_STATE` is defined once beside the type and copied; `appVersion` is required from the caller |
| 20 | `EvpManager` returned a decision per request but kept no counters, and `getStatus()` is `null` once a plan ends | Module 16 §4.1 lists `evp.requests{accepted,rejected,reason}` and `evp.shortfallS` as audit-panel metrics; a refusal was visible only for as long as the plan that refused it existed, then vanished | decisions are counted once per request (an idempotent replay returns the cached response before the counters), by reason, with their shortfalls; they cross the worker boundary and render in the Audit panel |

## 4. Gateway Behaviour Verified by Test

Each row corresponds to an assertion in `packages/edge/test/edge.test.ts`.

| Behaviour | Expected |
|---|---|
| `/api/health` body shape | `status`, `version`, `time`, `aiProviders`, `budget`, `aiCostUsdToday` |
| `/api/health` caching | `Cache-Control: public, max-age=5` |
| All other routes | `Cache-Control: no-store` |
| Disallowed origin | `403 ORIGIN_FORBIDDEN`, **no** `Access-Control-Allow-Origin` |
| Allowed origin preflight | `204`, `Vary: Origin` present |
| Unknown path | `404 NOT_FOUND` |
| Known path, wrong method | `405 METHOD_NOT_ALLOWED` with `Allow` header |
| `text/plain` body | `415 UNSUPPORTED_MEDIA_TYPE` |
| Body over the size limit | `413 PAYLOAD_TOO_LARGE` |
| Valid signed EVP | `200`, `decision: "accepted"` |
| Replayed nonce | `409 NONCE_REPLAY` |
| Bad HMAC | `401 BAD_SIGNATURE` |
| Stale timestamp | `401 TIMESTAMP_SKEW` |
| Over the per-source rate limit | `429 RATE_LIMITED` with `Retry-After` |
| Lane not in the contract | `422 UNKNOWN_LANE` |
| Implausible speed | `422 IMPLAUSIBLE_SPEED` |
| Copilot without `window` | `400` with the documented envelope |
| Chat request to force a green | refusal text, no signal change |
| Advisory | projects a validated diagnosis; no model call |
| Replay round-trip | `POST` then `GET` returns the same entry; unknown id `404` |
| WebSocket without a DO binding | `503` |

## 5. Not Run

Recorded explicitly so the gap is visible rather than assumed:

| Check | Status | Why |
|---|---|---|
| `bash helpers/audit.sh` (instruction-pack audit) | **not run — attempted 2026-11-02, result discarded** | This machine has no bash on PATH. Running it under Git's `sh.exe` completed but every `grep` invocation failed with "command not found", so each rule printed PASS vacuously — a vacuous pass is not evidence. The Node equivalents that do genuinely run are `pnpm fitness` (7/7) and `pnpm check:meta` (25/25) |
| `gitleaks detect --log-opts=--all` | **not run** | not installed in this environment; must be run by a human before publishing history |
| Live URL smoke (`scripts/smoke-live.sh`) | **not run** | no deployment was performed from this environment |
| Playwright E2E (E1–E10) | **not run** | browser automation out of scope for this pass |
| Kafka + Spark live pipeline (`make up`) | **not run** | requires Docker; not installed here. The unit + contract suite runs without it (§6) |
| Lighthouse / performance budget | **not run** | requires a built and served bundle |
| Screen-reader walkthrough | **not run** | no assistive technology available here; see [ACCESSIBILITY.md](ACCESSIBILITY.md) |
| `make demo` in Lite mode on a clean machine | **not run** | pipeline requires Docker; the lite path is unit-tested only |
| Judge Q&A dry run by a second person | **not run** | requires a second person |
| `node instruction/helpers/validate-pack.mjs` | **exit 1, not applicable as shipped** | the script resolves links relative to one pack root, but this repository keeps the modules in `instruction/` and `state of agent/` at the root. Run against the repo root it reports 331 problems, of which every one is a layout artefact (`state%20of%20agent/...` links, per-ADR README requirements) except two pre-existing `figs/*.png` links in the vendored source brief. Its `tasks.json` checks — counts, unique IDs, status values, dependency closure, one `in_progress`, `next_up` is a task — pass with no findings |

No item in this section may be marked complete without a log, a report or a
screenshot filed beside it.

## 6. Full-System Verification Pass (2026-11-02)
| Check | Command | Result |
|---|---|---|
| Regression gate | `pnpm test:regression` | **8 passed** in 107 s wall — 8 scenarios × 10 seeds × 20 sim-min, floor "adaptive not > 5 % worse than fixed" met in every scenario; 160 sim-min simulated in ≈ 90× real time |
| Debug-bundle replay e2e | `pnpm repro tmp-bundle.json` (cwd `packages/bench`) | **[Repro SUCCESS] — state hash bit-identical: `6e1d5ab2ec5d0994`**. Bundle was produced outside the browser from a real `TwinWorld` run (seed 42, 1,000 ticks) carrying 3 logged edits (setLaneDemand, setAdaptiveParams, requestPreemption EVP), `conflicts: 0`; the temporary bundle and generator were deleted after the run |
| Pipeline tests (first live execution) | `cd pipeline; python -m pytest` | **51 passed in 0.54 s** (Python 3.12.10) — unit + contract suite, no Docker needed. Caveat: running bare `pytest` from the repo root additionally *errors at collection* on the Spark integration tests (`pyspark` not installed); the supported invocation is from `pipeline/` or via `make test`, and the Kafka integration path remains unrun here (LIMITATIONS 21) |
| Eval dataset generation | `pnpm eval:gen -- --force` | **30 labelled incidents** written to `evals/fixtures/incidents.json` across the 7 classes, driven by the real deterministic simulator |
| Eval replay report | `pnpm eval:replay` | report at `evals/out/report.md` — **heuristic: top-1 23.3 % · top-2 40.0 % · severity 36.7 % · cost $0.0000**; `llama-fallback` and `muse-spark` rows omitted (no recorded fixtures — `pnpm eval:live` needs `META_API_KEY`); regression floor not recordable while the primary source has no measured answers, and the harness reports that as "no floor recorded" rather than inventing one (Rule 00) |
| Eval-harness repair | code change, then re-runs above | `evals/generate.mjs` crashed on a fresh clone (missing `fixtures/responses/` directory before the `.gitkeep` write) — fixed with `mkdirSync(recursive)`; the three `eval:*` scripts ran under bare `node`, which cannot load the TypeScript sources reached through `@urbanflow/core` package exports — switched to `tsx` (repo-existing dependency, same range as `packages/bench` uses) |
| Worker protocol suite expansion | `pnpm vitest run worker_protocol` | **32 passed** — includes the new Approve-&-Apply, EVP-timeline and debug-bundle blocks; this is where the `restoreTo` future-loss bug was found and fixed (high-water mark `maxReachedTick`; see LIMITATIONS 17/18 context) |
| Full gate | `pnpm verify` | **exit 0** — typecheck, 119+8 vitest, docs:check, build, check:meta 25/25, fitness 7/7 |
