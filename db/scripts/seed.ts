/**
 * Local seed / migration helper for UrbanFlow MongoDB.
 *
 * Indexes are created automatically on connect (`MongoManager.ensureIndexes`),
 * so "migrations" here are just upserts — this script is idempotent and safe to
 * re-run. It writes one demo simulation run plus a few telemetry/EVP/signal
 * documents so the dashboard has something to render against a fresh mongod.
 *
 * Usage:
 *   pnpm --filter @urbanflow/db seed
 *   MONGODB_URI="mongodb://127.0.0.1:27017" MONGODB_DB_NAME="urbanflow" pnpm --filter @urbanflow/db seed
 *
 * Connects to the local MongoDB instance (see docs/runbooks/07-local-mongodb.md).
 * If the daemon is offline, the manager falls back to an in-memory buffer and the
 * seed reports that no durable write happened — start mongod and re-run.
 */
import { MongoManager, SimulationRepository } from '../src/index.js';
import type { LaneTelemetryDoc, EvpEventDoc, SignalStateDoc } from '../src/index.js';

async function main(): Promise<void> {
  const mgr = MongoManager.getInstance();
  const connected = await mgr.connect();
  const repo = new SimulationRepository(mgr);

  if (!connected) {
    console.error(
      '[db:seed] Could not reach MongoDB at the configured MONGODB_URI. ' +
        'Starting a local instance (see docs/runbooks/07-local-mongodb.md) and re-running will write durably.',
    );
    process.exitCode = 1;
    return;
  }

  const now = new Date();
  const runId = `seed-run-${now.toISOString().slice(0, 10)}`;

  await repo.saveRun({
    runId,
    seed: 1001,
    scenarioId: 'north-south-heavy-tide',
    config: {},
    startTime: now.toISOString(),
    endTime: new Date(now.getTime() + 600_000).toISOString(),
    durationS: 600,
    status: 'completed',
    metricsSummary: {
      avgDelayAdaptiveS: 80.28,
      avgDelayFixedS: 106.7,
      losAdaptive: null,
      losFixed: null,
      totalArrivals: 1204,
      totalExited: 1187,
      totalDenied: 17,
      conflicts: 0,
      violationsPrevented: 0,
    },
    createdAt: now,
    updatedAt: now,
  });

  const lanes = ['NB-TR', 'SB-TR', 'EB-TR', 'WB-TR'] as const;
  const telemetry: LaneTelemetryDoc[] = lanes.map((lane, i) => ({
    runId,
    simTimeS: i * 10,
    lane,
    vehicleCount: 12 + i * 5,
    queueLengthM: 30 + i * 12,
    occupancyPct: 40 + i * 6,
    sumWeightedWaitS: 120 + i * 30,
    maxWaitS: 45 + i * 10,
    nearestEmsDistanceM: null,
    timestamp: now,
  }));
  await repo.recordTelemetryBatch(telemetry);

  const evp: EvpEventDoc = {
    runId,
    eventId: `seed-evp-${now.getTime()}`,
    emsId: 'ems-ambulance-01',
    lane: 'NB-TR',
    stage: 'EMS_GREEN',
    distanceM: 120,
    speedMps: 16.5,
    decision: 'accepted',
    simTimeS: 42,
    timestamp: now,
  };
  await repo.recordEvp(evp);

  const signal: SignalStateDoc = {
    runId,
    simTimeS: 42,
    phase: 'P1',
    indication: 'GREEN',
    timeInStateS: 14,
    lanes: {},
    timestamp: now,
  };
  await repo.recordSignalState(signal);

  const status = await mgr.getStatus();
  console.log(
    `[db:seed] Seeded run "${runId}" → db="${status.database}" ` +
      `runs=${status.collections.runs} telemetry=${status.collections.telemetry} ` +
      `evp=${status.collections.evp} signals=${status.collections.signals}`,
  );

  await mgr.close();
}

main().catch((err) => {
  console.error('[db:seed] failed:', err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
