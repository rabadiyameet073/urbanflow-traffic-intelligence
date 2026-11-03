# Contributing

This repository is a hackathon submission, but the rules below are the ones that
kept it honest and are worth keeping if it continues.

## Before You Change Anything

```bash
pnpm install
pnpm verify        # tsc -b + vitest + docs:check + package builds
```

`pnpm verify` is the gate. A change that does not pass it is not finished, no
matter how good the demo looks.

## The Four Rules That Are Not Negotiable

1. **Only the safety kernel writes `SignalState`.**
   Controllers, the EVP manager, the copilot and the UI emit requests. If you
   find yourself constructing a `SignalState` outside `control/kernel.ts`, the
   design has been violated, not extended.

2. **Numbers come from artefacts, never from memory.**
   Any figure in `README.md`, `docs/RESULTS.md`, the UI or the video is
   produced by `pnpm bench` and quoted from `packages/bench/out/*.json`.
   `pnpm docs:check` fails the build when a document drifts from the artefact.
   Never run the benchmark and then hand-edit the JSON.

3. **`core` stays pure.**
   No `Math.random`, no `Date.now`, no `performance.now`, no DOM, no network in
   `packages/core`. Determinism is what makes paired seeds meaningful. If you
   need randomness, take it from `splitRng(seed, streamName)`.

4. **Contracts are the source of truth.**
   Wire types come from zod schemas in `packages/core/src/contracts.ts`.
   Adding a field means adding it to the schema first, then letting the types
   propagate. Hand-written parallel interfaces drift; schemas do not.

## Adding a Metric

1. Add it to the metric schema in `contracts.ts`.
2. Compute it in `metrics/metrics.ts` from simulation state, not from a
   running guess.
3. Add it to `ScenarioResult` in `packages/bench/src/runner.ts`.
4. Regenerate: `pnpm bench`.
5. Only then may it appear in a document — with its CI if it is comparative.

## Adding a Route

Follow the existing order and reuse the helpers in `http/index.ts`. A new route
must: pass the origin gate, declare its methods so `405` is distinguishable from
`404`, validate its body with a zod schema, and return the shared envelope
`{ error: { code, message }, requestId }` on failure. Do not hand-roll JSON
responses.

## Code Style

- TypeScript strict, `noUncheckedIndexedAccess` on. Index into arrays with a
  guard or an explicit assertion — never assume.
- Comments explain *why*, in one or two lines. If a line is wrong in a way that
  is easy to reintroduce, say what the wrong version was and what it broke.
- No `innerHTML` in the UI, no inline `style=` attributes, no hard-coded
  colours: use `element.style.setProperty` for geometry and design tokens for
  everything else.
- Prefer deleting a helper over exporting an unused one.

## Review (Module 63)

Review order, high value first: correctness and safety (I1–I6, determinism,
the AI boundary), then contracts and boundaries, design, tests, security,
performance, accessibility, docs — style last, and only what the linters
cannot enforce. Self-review the diff before requesting review; remove debug
code.

Comment prefixes and what they block:

| Prefix | Blocks merge? |
|---|---|
| `blocker:` (Rule/safety/correctness violation) | Yes |
| `issue:` (likely defect or missing test) | Yes |
| `question:` | Until answered |
| `suggestion:` / `nit:` / `praise:` | No |

Agent-generated diffs get extra scrutiny for hallucinated APIs, over-broad
`catch`, tests that assert the implementation instead of the requirement,
silent scope creep, and invented numbers or URLs.

Merge requires: `pnpm verify` and `bash helpers/audit.sh` green
(`audit.sh` currently reports known `AUDIT-OK()` exceptions for human review,
see `docs/LIMITATIONS.md` #35), no unresolved `blocker`/`issue`, `tasks.json`
updated, and human maintainer approval for changes touching
`packages/core/src/control/`, `contracts.ts`, `edge/src/security/`,
`edge/src/do/`, or `.github/` — `.github/CODEOWNERS` pins those paths once the
human fills in the real handle.

## Commit Messages

`<scope>: <what changed>` where scope is the package (`core`, `edge`, `web`,
`bench`, `docs`, `pipeline`). Body states the evidence: test name, benchmark
delta, or the audit check that motivated it.

Examples from this repository's history:

```
core: fix inverted IDM leader gap that froze every second vehicle
bench: replace fabricated throughput with measured values
edge: make nonce insertion atomic so replays cannot race
```

## What Not to Commit

- `.env` or any real secret. `.env.example` only.
- `node_modules`, `dist`, `.tsbuildinfo`.
- A hand-edited benchmark artefact. Regenerate it.
- A document number that no JSON contains.

## Reporting a Problem

For a safety or security issue, see [SECURITY.md](SECURITY.md) instead of
opening a public issue.
