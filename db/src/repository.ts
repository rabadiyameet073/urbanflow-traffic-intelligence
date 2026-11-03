/**
 * MongoDB Data Repository for UrbanFlow Simulation System
 * Implements high-throughput operations for Runs, Telemetry, EVP, Signals, and Anomalies.
 */
import { MongoManager } from './client.js';
import type {
  SimulationRunDoc,
  LaneTelemetryDoc,
  EvpEventDoc,
  SignalStateDoc,
  AnomalyEventDoc,
} from './types.js';

export class SimulationRepository {
  private mgr: MongoManager;

  constructor(mgr = MongoManager.getInstance()) {
    this.mgr = mgr;
  }

  /**
   * Save or update a simulation run record
   */
  public async saveRun(run: SimulationRunDoc): Promise<SimulationRunDoc> {
    const col = this.mgr.runsCollection();
    if (col) {
      // `createdAt` must appear only in $setOnInsert, never in $set — MongoDB
      // rejects an update that writes the same path through both operators.
      const { createdAt: _createdAt, ...runFields } = run;
      await col.updateOne(
        { runId: run.runId },
        {
          $set: {
            ...runFields,
            updatedAt: new Date(),
          },
          $setOnInsert: {
            createdAt: run.createdAt || new Date(),
          },
        },
        { upsert: true },
      );
    } else {
      // In-memory fallback
      const fallback = this.mgr.getFallback().runs;
      fallback.set(run.runId, {
        ...run,
        updatedAt: new Date(),
      });
    }
    return run;
  }

  /**
   * List recent simulation runs with pagination
   */
  public async listRuns(limit = 20, skip = 0): Promise<{ runs: SimulationRunDoc[]; total: number }> {
    const col = this.mgr.runsCollection();
    if (col) {
      const [runs, total] = await Promise.all([
        col.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
        col.countDocuments(),
      ]);
      return { runs, total };
    } else {
      const all = Array.from(this.mgr.getFallback().runs.values()).sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      );
      return {
        runs: all.slice(skip, skip + limit),
        total: all.length,
      };
    }
  }

  /**
   * Retrieve a simulation run by ID
   */
  public async getRun(runId: string): Promise<SimulationRunDoc | null> {
    const col = this.mgr.runsCollection();
    if (col) {
      return col.findOne({ runId });
    } else {
      return this.mgr.getFallback().runs.get(runId) ?? null;
    }
  }

  /**
   * Record a batch of lane telemetry observations
   */
  public async recordTelemetryBatch(records: LaneTelemetryDoc[]): Promise<number> {
    if (!records.length) return 0;
    const col = this.mgr.telemetryCollection();
    if (col) {
      const result = await col.insertMany(records, { ordered: false });
      return result.insertedCount;
    } else {
      const fallback = this.mgr.getFallback().telemetry;
      fallback.push(...records);
      // Keep last 10,000 in memory
      if (fallback.length > 10000) {
        fallback.splice(0, fallback.length - 10000);
      }
      return records.length;
    }
  }

  /**
   * Query telemetry records for a run, optionally filtered by lane
   */
  public async getTelemetry(runId: string, lane?: string, limit = 500): Promise<LaneTelemetryDoc[]> {
    const col = this.mgr.telemetryCollection();
    if (col) {
      const filter: Record<string, unknown> = { runId };
      if (lane) filter.lane = lane;
      return col.find(filter).sort({ simTimeS: 1 }).limit(limit).toArray();
    } else {
      return this.mgr
        .getFallback()
        .telemetry.filter((t) => t.runId === runId && (!lane || t.lane === lane))
        .slice(-limit);
    }
  }

  /**
   * Record an Emergency Vehicle Preemption (EVP) event
   */
  public async recordEvp(event: EvpEventDoc): Promise<EvpEventDoc> {
    const col = this.mgr.evpCollection();
    if (col) {
      await col.insertOne(event);
    } else {
      this.mgr.getFallback().evp.push(event);
    }
    return event;
  }

  /**
   * Query EVP events for a run
   */
  public async getEvpEvents(runId: string): Promise<EvpEventDoc[]> {
    const col = this.mgr.evpCollection();
    if (col) {
      return col.find({ runId }).sort({ simTimeS: 1 }).toArray();
    } else {
      return this.mgr.getFallback().evp.filter((e) => e.runId === runId);
    }
  }

  /**
   * Record a signal state transition
   */
  public async recordSignalState(signal: SignalStateDoc): Promise<SignalStateDoc> {
    const col = this.mgr.signalsCollection();
    if (col) {
      await col.insertOne(signal);
    } else {
      this.mgr.getFallback().signals.push(signal);
    }
    return signal;
  }

  /**
   * Record an anomaly event
   */
  public async recordAnomaly(anomaly: AnomalyEventDoc): Promise<AnomalyEventDoc> {
    const col = this.mgr.anomaliesCollection();
    if (col) {
      await col.insertOne(anomaly);
    } else {
      this.mgr.getFallback().anomalies.push(anomaly);
    }
    return anomaly;
  }

  /**
   * Export an entire run package including metadata, events, and telemetry
   */
  public async exportRunBundle(runId: string): Promise<Record<string, unknown> | null> {
    const run = await this.getRun(runId);
    if (!run) return null;

    const [telemetry, evp, signals] = await Promise.all([
      this.getTelemetry(runId, undefined, 2000),
      this.getEvpEvents(runId),
      this.getSignals(runId, 500),
    ]);

    return {
      run,
      telemetrySampleCount: telemetry.length,
      telemetry,
      evpEvents: evp,
      signalStates: signals,
      exportedAt: new Date().toISOString(),
    };
  }

  public async getSignals(runId: string, limit = 500): Promise<SignalStateDoc[]> {
    const col = this.mgr.signalsCollection();
    if (col) {
      return col.find({ runId }).sort({ simTimeS: 1 }).limit(limit).toArray();
    } else {
      return this.mgr.getFallback().signals.filter((s) => s.runId === runId).slice(-limit);
    }
  }
}
