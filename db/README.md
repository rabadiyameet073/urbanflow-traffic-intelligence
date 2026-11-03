# `@urbanflow/db` — MongoDB persistence layer

This package is the **single home for all database code** in UrbanFlow: the
MongoDB connection manager, the document (schema) types, and the simulation data
repository. It was consolidated here from `packages/edge/src/db` so the runtime
store is one package import away rather than scattered across the monorepo. See
[ADR-0021](../docs/adr/0021-shared-db-package.md).

> **Scope note.** This is the **TypeScript / edge + Node** store. The Python
> analytics mirror lives separately in [`pipeline/spark/urbanflow/mongo_sink.py`](../pipeline/spark/urbanflow/mongo_sink.py)
> (uses `pymongo`, driven by `MONGO_URI`). It cannot import this TS package —
> they are different runtimes that simply share one MongoDB server.

## Structure

```
db/
  src/
    types.ts        # MongoDB document interfaces (SimulationRunDoc, LaneTelemetryDoc,
                    #   EvpEventDoc, SignalStateDoc, AnomalyEventDoc, DbStatusResponse)
    client.ts       # MongoManager — singleton pool, auto index creation, ping/status,
                    #   resilient in-memory fallback when the daemon is offline
    repository.ts   # SimulationRepository — runs, telemetry, EVP, signals, anomalies CRUD
    index.ts        # public barrel (the only thing consumers import)
  scripts/
    seed.ts         # idempotent local seed / "migration" helper
  package.json      # name: @urbanflow/db ; deps: mongodb + @urbanflow/core (types only)
  tsconfig.json     # composite project, mirrors the other packages
```

## How it is consumed

`@urbanflow/edge` imports the two classes and exposes them over HTTP under
`/api/db/*` (status, runs, telemetry, EVP, signals, export). The web dashboard
never talks to Mongo directly — it calls those routes (`packages/web/src/state/store.ts`).

```ts
import { MongoManager, SimulationRepository } from '@urbanflow/db';

const mgr = MongoManager.getInstance();
await mgr.connect();               // returns false and falls back to memory if offline
const repo = new SimulationRepository(mgr);
await repo.saveRun({ /* SimulationRunDoc */ });
```

## Configuration

The entry point reads two environment variables (defined in the root
[`.env.example`](../.env.example) and passed to the edge runtime by
[`scripts/dev-edge.mjs`](../scripts/dev-edge.mjs)):

| Variable | Default | Purpose |
|---|---|---|
| `MONGODB_URI` | `mongodb://127.0.0.1:27017` | Connection string (local `mongod` or Atlas) |
| `MONGODB_DB_NAME` | `urbanflow` | Database name |

If the daemon is unreachable, `MongoManager` transparently buffers writes in
memory and `getStatus()` reports `status: "fallback_mode"` — the simulation never
halts because of the database.

## Running locally

1. **Start MongoDB** — see [docs/runbooks/07-local-mongodb.md](../docs/runbooks/07-local-mongodb.md)
   (host `mongod`, or `docker compose --profile mongo up` inside `pipeline/`).
2. **Install the workspace link** (after this package was added):

   ```bash
   pnpm install
   ```

3. **Seed** (idempotent; safe to re-run). Indexes are created automatically on
   connect by `MongoManager.ensureIndexes()`, so "migrations" here are upserts:

   ```bash
   pnpm --filter @urbanflow/db seed
   ```

4. **Bring up the gateway** and verify the store is reachable:

   ```bash
   pnpm build            # or pnpm --filter @urbanflow/edge build
   pnpm dev:edge         # loads .env, runs on http://localhost:8787
   curl http://localhost:8787/api/db/status
   ```

## Verification gates this package must satisfy

`@urbanflow/db` is scanned by the architecture fitness gate
([`scripts/fitness.mjs`](../scripts/fitness.mjs)):

- **deps** — `db` may only import `@urbanflow/core`; it is itself shareable
  (`edge` imports it). Importing `web`/`edge`/`bench` from `db` fails the build.
- **cycles** — `db/src/index.ts` must not create an import cycle. Do not write a
  literal `from '@urbanflow/...'` inside comments here (the scanner reads raw source).

Run them directly:

```bash
node scripts/fitness.mjs --only=deps,cycles
```

## Design decisions

- **Parquet/HDFS remains the analytical source of truth** ([ADR-0008](../docs/adr/0008-parquet-lake-default-storage.md)).
  MongoDB is the low-latency **operational serving store** for recent state the
  dashboard queries without opening the lake.
- **Resilient, best-effort writes**: a DB outage degrades to memory, never to a
  stuck simulation.
