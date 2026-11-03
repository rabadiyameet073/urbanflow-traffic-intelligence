# ADR-0021: MongoDB persistence consolidated into a shared `@urbanflow/db` package
- Status: Accepted
- Date: 2026-11-02
- Deciders: UrbanFlow Architecture Team

## Context
The MongoDB persistence code (connection manager, document schemas, and the
simulation repository) originally lived inside `packages/edge/src/db`. Only the
edge gateway imported it, but the store is conceptually a cross-cutting concern:
the dashboard, the pipeline mirror, and future services all revolve around the
same serving store. Keeping it buried in one package made it look "scattered" and
meant the schema types could not be reused without importing all of `edge`.

The repository enforces a dependency law in `scripts/fitness.mjs` (`checks.deps`):
packages never import each other **except** the pure `core` (ADR-0001). A shared
`db` package therefore required an explicit, auditable change to that law.

## Options
- (a) Leave the code inside `packages/edge/src/db` (status quo). Cheapest, but the
  store stays non-shareable and visually scattered.
- (b) Promote it to a root-level `@urbanflow/db` workspace package and relax the
  fitness dependency law so exactly two packages (`core` and `db`) are shareable.
- (c) A root `db/` folder holding only configs/docs/seeds, with runtime code left
  in `edge`. Partial consolidation; no rule change needed.

## Decision
Adopt option (b). Create `db/` as a composite workspace package (`@urbanflow/db`)
that owns `mongodb` as its dependency and depends only on `@urbanflow/core` for
shared types. `@urbanflow/edge` consumes it via `import { MongoManager,
SimulationRepository } from '@urbanflow/db'` and no longer lists `mongodb` itself.
The fitness gate is updated so `db` is shareable across packages and may itself
only import `core`; the `db/src` tree is now scanned by both `deps` and `cycles`.

## Consequences
- Positive: One canonical home for persistence code and document schemas; reusable
  without importing `edge`; local seed/migration script ships with the package.
- Positive: The dependency law is now *explicit about* the shared layer instead of
  accidentally forbidding it.
- Negative: The "only `core` is shareable" invariant is weakened to "`core` and
  `db`". This is a deliberate, bounded exception recorded here — not a general
  opening of cross-package imports.
- Note: MongoDB is the operational **serving store**; Parquet/HDFS remains the
  analytical source of truth (ADR-0008). The Python mirror
  (`pipeline/spark/urbanflow/mongo_sink.py`) is a separate runtime and shares the
  server, not this package.
- Note: The native `mongodb` driver runs under Node/`tsx` (dev edge, seed) and the
  Worker in-memory fallback path; it is not a true Cloudflare Worker runtime
  dependency.

## Evidence
- `db/package.json`, `db/tsconfig.json`, `db/src/{types,client,repository,index}.ts`
- `packages/edge/package.json` (`@urbanflow/db` added, `mongodb` removed) and
  `packages/edge/src/index.ts` (single import repointed).
- `scripts/fitness.mjs` `PKG_SRC`/`SHAREABLE` and the `deps`/`cycles`/`resolveSpecifier`
  updates. `node scripts/fitness.mjs --only=deps,cycles` passes.
- `pnpm-workspace.yaml` and root `tsconfig.json` register the `db` project.
