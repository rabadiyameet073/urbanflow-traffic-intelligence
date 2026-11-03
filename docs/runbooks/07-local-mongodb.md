# Runbook 07: Install & Use a Local MongoDB (Windows)

UrbanFlow already ships full MongoDB integration; nothing here is new code to
write — this is the setup that makes the app talk to a **real** database instead
of its in-memory fallback. Two consumers already exist:

- **Edge gateway** (`packages/edge/src/db/`): stores simulation runs, lane
  telemetry, EVP events, signal states and anomaly events; exposed at `/api/db/*`
  and in the UI's "MongoDB Persistence" panel.
- **Spark pipeline** (`pipeline/spark/urbanflow/mongo_sink.py`): optional mirror
  of the 10-second `lane_metrics` + `anomalies` into MongoDB, **alongside** the
  Parquet lake (ADR-0008 keeps Parquet authoritative). Disabled unless `MONGO_URI`
  is set.

> Per project policy these commands are for **you** to run; the agent only adds
> code/config.

## 1. Install MongoDB Community on Windows

1. Download the Windows MSI from the MongoDB Community Server page
   (https://www.mongodb.com/try/download/community), version **7.0.x**.
2. Run the installer, choose **Complete**, and tick **"Install MongoDB as a
   Service"**. The service (`MongoDB`) starts automatically and listens on
   `127.0.0.1:27017`.
   - To start/stop manually: `net start MongoDB` / `net stop MongoDB`
     (PowerShell as Administrator), or Services → "MongoDB".
3. (Optional) Install **MongoDB Compass** for a GUI, or use `mongosh`:
   `mongosh --url mongodb://127.0.0.1:27017 --eval "db.adminCommand('ping')"`

Verify it is reachable: `mongosh --quiet --eval "db.adminCommand({ ping: 1 })"`
should print `{ ok: 1 }`.

## 2. Use it from the Edge gateway (browser/UI)

The edge runs under Node via the repo's dev runner, which loads `.env` and
defaults `MONGODB_URI=mongodb://127.0.0.1:27017`.

```
copy .env.example .env
pnpm install                       # installs the `mongodb` driver
pnpm --filter @urbanflow/edge build
node scripts/dev-edge.mjs          # gateway on http://localhost:8787
```

Confirm the connection (not fallback):

```
curl http://localhost:8787/api/db/status
```

- `"connected": true` → it is using your local MongoDB.
- `"status": "fallback_mode"` → the driver reached no server: check the MongoDB
  service is running and `MONGODB_URI` matches. The app still works in-memory.

Then use the UI panel (Save Run to MongoDB / Fetch runs) or:

```
curl "http://localhost:8787/api/db/runs?limit=5"
```

## 3. Use it from the Spark pipeline (analytics mirror)

Only if you want the 10-second aggregates in MongoDB. It is **opt-in**: with no
`MONGO_URI` the pipeline behaves exactly as before (Parquet + Kafka).

The pipeline runs inside Docker, so it reaches a host-local `mongod` through
`host.docker.internal` (mapped via `extra_hosts` in `docker-compose.yml`).

```
cd pipeline
# Point the mirror at the host MongoDB; the compose file passes it through.
echo MONGO_URI=mongodb://host.docker.internal:27017 >> .env
make up            # starts Kafka + Spark; pyspark image now includes pymongo
```

Watch for the mirror line in the job log:

```
mongo mirror batch <id>: <n> metrics, <m> anomalies
```

Read it back (from the host):

```
mongosh urbanflow --quiet --eval "db.lane_metrics.countDocuments()"
mongosh urbanflow --quiet --eval "db.anomalies.findOne()"
```

### Prefer Docker instead of a local install?

Skip Section 1 and run Mongo as an opt-in profile:

```
docker compose --profile mongo up -d
# then set for the spark service:
echo MONGO_URI=mongodb://mongo:27017 >> .env
```

Do **not** combine this with a local `mongod` on 27017 — the profile publishes
the same host port and they will conflict.

## 4. Verification checklist

- `db.adminCommand({ ping: 1 })` → `{ ok: 1 }`.
- `/api/db/status` → `connected: true` (edge path).
- Pipeline log shows `mongo mirror batch …` (only when `MONGO_URI` is set).
- MongoDB has the expected databases/collections: edge → `urbanflow`
  (`simulation_runs`, `lane_telemetry`, `evp_events`, `signal_states`,
  `anomaly_events`); pipeline mirror → `lane_metrics`, `anomalies` (same db).

## 5. Rollback

- Edge: stop the MongoDB service, or leave `MONGODB_URI` unset — the gateway
  falls back to in-memory automatically, no crash.
- Pipeline: set `MONGO_URI=` (empty) and rebuild/`make up`; the mirror disables
  and Parquet remains the source of truth. No pipeline data is lost — the mirror
  never replaced the lake write.

## Notes

- The mirror writes are **idempotent** (`_id` = `run|lane|window_start` for
  metrics, detector `event_id` for anomalies), so replaying a micro-batch after a
  restart overwrites its own rows rather than duplicating them.
- The mirror is **best-effort**: a MongoDB outage is logged and skipped; it never
  fails the streaming query or advances a bad checkpoint.
