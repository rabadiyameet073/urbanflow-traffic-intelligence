# UrbanFlow AI

**Adaptive traffic-signal intelligence with a formal safety kernel, emergency-vehicle preemption, and an advisory-only Meta AI copilot.**

- **Live demo:** `https://urbanflow-ai.pages.dev` *(deploy target — see [docs/DEPLOY.md](docs/DEPLOY.md) for the current status of this URL)*
- **Run it locally:** `pnpm install && pnpm --filter @urbanflow/web dev` → `http://localhost:5173`
- **Demo video:** 3-minute script in [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md)
- **Licence:** MIT

> **Simulation only.** UrbanFlow AI is a research simulator and decision-support prototype. It is not connected to physical signal cabinets, is not certified for any safety function, and makes no claim about real-world deployment. See [docs/LIMITATIONS.md](docs/LIMITATIONS.md).

---

## Honest Headline Results

Measured by `pnpm bench` on **5 held-out seeds (1001–1005)**, paired fixed-time vs adaptive, 600 s per run, 95 % bootstrap CI over per-seed relative differences. Positive = Adaptive produced less person-delay. Full ledger, method and caveats: [docs/RESULTS.md](docs/RESULTS.md).

| Scenario | Fixed | Adaptive | Δ | 95 % CI | CI excludes 0 |
|---|---|---|---|---|---|
| Balanced Parity | 98.50 s | 79.38 s | +18.9 % | [−1.5, +39.2] | no |
| Balanced High Traffic | 128.60 s | 117.05 s | +9.0 % | [+0.4, +17.7] | **yes** |
| Near Saturation | 141.13 s | 145.55 s | −4.8 % | [−19.9, +8.8] | no |
| Light Night Traffic | 59.14 s | 40.07 s | +24.8 % | [+4.2, +48.9] | **yes** |
| North–South Heavy Tide | 106.70 s | 80.28 s | +24.8 % | [+18.0, +31.6] | **yes** |
| Stadium Surge Dump | 86.69 s | 92.70 s | −12.3 % | [−36.7, +7.2] | no |
| Mixed Uneven | 101.24 s | 91.21 s | +9.0 % | [−2.3, +20.3] | no |
| Blocked Lane Incident | 107.43 s | 84.10 s | +20.7 % | [+2.0, +39.3] | **yes** |

**What the data supports:** Adaptive is never *significantly* worse than fixed-time, and is significantly better in 4 of 8 scenarios. Two scenarios (Near Saturation, Stadium Surge Dump) have point estimates that favour fixed-time; in both cases the interval includes zero. Adaptive discharged more vehicles in 8 of 8 scenarios and denied fewer entries in 6 of 8. Safety-kernel conflicts: **0**. Conservation (`arrivals = exited + inSystem + denied`): **true** in every run of both controllers.

**What it does not support:** a headline percentage. With five seeds, four scenarios are unresolved. Every number above is written by the benchmark into [`packages/bench/out/results.json`](packages/bench/out/results.json); `pnpm docs:check` fails the build if this table drifts from that file.

---

## Quickstart

```bash
pnpm install
pnpm verify        # tsc -b + vitest + docs + package builds + meta + fitness
pnpm bench         # regenerate results.json and ems-sweep.json
pnpm docs:check    # assert README/RESULTS numbers match results.json
pnpm fitness       # architecture gates: purity, deps, cycles, size, secrets, headers
```

Local dashboard: `pnpm --filter @urbanflow/web dev` (Vite, no framework; the simulation runs in a Worker and the canvas paints the frames it transfers out).

---

## What It Does

| Capability | Implementation | Where |
|---|---|---|
| Bit-deterministic microscopic simulation | Struct-of-arrays lanes, fixed 0.1 s step, seeded mulberry32 streams per lane, FNV-1a state hash | `packages/core/src/sim/` |
| Safety kernel (sole writer of signal state) | Invariants I1–I6: min green 7 s, yellow 3.5 s, all-red 2.0 s, max red wait 120 s, flash-red only via `failSafe()` | `packages/core/src/control/kernel.ts` |
| Adaptive control | Phase pressure from queue count, weighted wait and lane occupancy, with a switching-cost guard | `packages/core/src/control/adaptive.ts` |
| Emergency vehicle preemption | Rate-limited, nonce-checked request → ETA vs required lead → IDLE/PRECLEAR/EMS_GREEN/RECOVERY | `packages/core/src/control/evp.ts` |
| Edge gateway | 11 routes, HMAC-signed EVP, Durable Object replay store, budget guard, uniform error envelope | `packages/edge/src/` |
| AI copilot (advisory only) | Muse Spark → Llama fallback → deterministic template; zod-validated, numeric provenance checked | `packages/edge/src/copilot/` |
| Streaming pipeline | Kafka (KRaft) + PySpark Structured Streaming + Parquet lake, with a no-JVM "lite" fallback | `pipeline/` |
| Operator UI | Vanilla TypeScript; simulation in a Web Worker, frames transferred out as typed arrays and painted with Canvas 2D on the main thread; WCAG 2.2 AA | `packages/web/src/` |

### The one rule that does not bend

Controllers, the EVP manager and the AI copilot all emit **requests**. Only the safety kernel writes `SignalState`, and it refuses any request that would shorten yellow, shorten all-red, or exceed a red-wait bound. The copilot has no write path at all: it produces bounded, validated text, which the UI must show for a human to act on.

---

## Repository Map

```
packages/core      contracts (zod), simulation engine, controllers, safety kernel, stats
packages/edge      Cloudflare Worker: HTTP router, EVP auth, Durable Object, copilot provider chain
db                 @urbanflow/db — MongoDB connection manager, document schemas, simulation repository
packages/web       operator dashboard (vanilla TS; simulation in a Worker, Canvas 2D paints the frames)
packages/bench     paired-seed benchmark + EVP sweep → out/*.json
pipeline/          Kafka + PySpark Structured Streaming, the SQL views
                   (01_windowed_lane_health.sql, 02_anomalies_summary.sql),
                   and a TypeScript "lite" mode
instruction/       the specification pack this repository implements (modules 01–64)
state of agent/    tasks.json (the work tracker), 20 rules and 38 skills
docs/              architecture, safety case, results, deploy, limitations, ADRs, runbooks
```

---

## Documentation

Read what the system claims, then read what proves it, then read what it does not cover.

| Document | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Component map, data flow, module boundaries, determinism strategy |
| [docs/SAFETY_CASE.md](docs/SAFETY_CASE.md) | Invariants, how they are enforced, and which ones have automated evidence |
| [docs/RESULTS.md](docs/RESULTS.md) | Full benchmark ledger, method, integrity audit, caveats |
| [docs/LIMITATIONS.md](docs/LIMITATIONS.md) | What this is not, and the bounds on every claim |
| [docs/TEST_REPORT.md](docs/TEST_REPORT.md) | Every test and audit item, graded PASS / PARTIAL / NOT RUN |
| [docs/AUDIT_LOG.md](docs/AUDIT_LOG.md) | Gate results, benchmark regenerations, integrity findings |
| [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md) | Accessibility conformance statement: what was verified, what was not |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Local, Pages and Worker deployment, plus rollback |
| [docs/META_API_NOTES.md](docs/META_API_NOTES.md) | Which Meta tools were used, how, and what they cost |
| [docs/SUBMISSION_FIELDS.md](docs/SUBMISSION_FIELDS.md) | Portal field drafts and the approved claim language |
| [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) | 3-minute video script with on-screen numbers |
| [docs/muse-prompts/](docs/muse-prompts/) | Prompt library as versioned Markdown |
| [docs/adr/](docs/adr/) | 20 architecture decision records |
| [docs/runbooks/](docs/runbooks/) | On-call procedures for the live demo |
| [CHANGELOG.md](CHANGELOG.md) | What changed, including the defects found and fixed |
| [SECURITY.md](SECURITY.md) | Threat model, security design decisions, disclosure |
| [CONTRIBUTING.md](CONTRIBUTING.md) | The verify gate and the four non-negotiable rules |
| [instruction/README.md](instruction/README.md) | The specification pack this repository implements, module by module |

---

## Rubric Mapping

| Criterion | Evidence |
|---|---|
| Technical depth | Bit-deterministic SoA engine; safety kernel with property tests; Durable Object replay store; structured-output copilot with numeric provenance checks |
| Use of Meta AI | Muse Spark (diagnosis/advisory), Llama fallback, SAM 3.1 masks, Muse Image robustness assets — see [docs/META_API_NOTES.md](docs/META_API_NOTES.md) |
| Safety and correctness | [docs/SAFETY_CASE.md](docs/SAFETY_CASE.md); 78 automated tests; zero kernel conflicts across all benchmark runs |
| Honest measurement | [docs/RESULTS.md](docs/RESULTS.md); paired seeds, bootstrap CI, parity and losses reported; `pnpm docs:check` enforces consistency |
| Craft | [instruction/](instruction/) spec pack implemented end to end; 21 ADRs; 6 runbooks; accessibility statement |
| Impact | Denial-rate reduction (Section 2 above) is the operationally meaningful number: fewer vehicles turned away at the approach |

---

## Licence

MIT — see [LICENSE](LICENSE). Third-party assets, models and their licences are credited in [docs/CREDITS.md](docs/CREDITS.md).
