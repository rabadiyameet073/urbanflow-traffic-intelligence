/**
 * MongoDB Connection Manager for UrbanFlow Simulation Intelligence Platform
 * Provides connection pooling, automatic index creation, ping health checks,
 * and resilient in-memory fallback if the database daemon is initializing.
 */
import { MongoClient, Db, Collection } from 'mongodb';
import type {
  SimulationRunDoc,
  LaneTelemetryDoc,
  EvpEventDoc,
  SignalStateDoc,
  AnomalyEventDoc,
  DbStatusResponse,
} from './types.js';

export class MongoManager {
  private static instance: MongoManager | null = null;
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private connectingPromise: Promise<boolean> | null = null;
  private uri: string;
  private dbName: string;
  private isFallbackMode = false;

  // In-memory fallback storage when MongoDB daemon is starting or disconnected
  private fallbackRuns = new Map<string, SimulationRunDoc>();
  private fallbackTelemetry: LaneTelemetryDoc[] = [];
  private fallbackEvp: EvpEventDoc[] = [];
  private fallbackSignals: SignalStateDoc[] = [];
  private fallbackAnomalies: AnomalyEventDoc[] = [];

  private constructor(uri?: string, dbName?: string) {
    this.uri = uri || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
    this.dbName = dbName || process.env.MONGODB_DB_NAME || 'urbanflow';
  }

  public static getInstance(uri?: string, dbName?: string): MongoManager {
    if (!MongoManager.instance) {
      MongoManager.instance = new MongoManager(uri, dbName);
    }
    return MongoManager.instance;
  }

  /**
   * Connect to MongoDB with timeout and resilience
   */
  public async connect(): Promise<boolean> {
    if (this.client && this.db) {
      return true;
    }

    if (this.connectingPromise) {
      return this.connectingPromise;
    }

    this.connectingPromise = (async () => {
      try {
        const client = new MongoClient(this.uri, {
          serverSelectionTimeoutMS: 2500,
          connectTimeoutMS: 3000,
          maxPoolSize: 20,
          minPoolSize: 1,
        });

        await client.connect();
        this.client = client;
        this.db = client.db(this.dbName);
        this.isFallbackMode = false;

        // Initialize indexes
        await this.ensureIndexes();

        // Sync any buffered fallback runs
        if (this.fallbackRuns.size > 0) {
          const runsCol = this.runsCollection();
          if (runsCol) {
            for (const run of this.fallbackRuns.values()) {
              await runsCol.updateOne({ runId: run.runId }, { $set: run }, { upsert: true });
            }
          }
        }

        return true;
      } catch (err) {
        // Fall back gracefully so simulation never halts if DB daemon is offline
        this.isFallbackMode = true;
        this.client = null;
        this.db = null;
        return false;
      } finally {
        this.connectingPromise = null;
      }
    })();

    return this.connectingPromise;
  }

  /**
   * Ensure compound and query indexes exist on collections
   */
  private async ensureIndexes(): Promise<void> {
    if (!this.db) return;
    try {
      const runs = this.db.collection<SimulationRunDoc>('simulation_runs');
      await runs.createIndex({ runId: 1 }, { unique: true });
      await runs.createIndex({ createdAt: -1 });
      await runs.createIndex({ scenarioId: 1, seed: 1 });

      const telemetry = this.db.collection<LaneTelemetryDoc>('lane_telemetry');
      await telemetry.createIndex({ runId: 1, simTimeS: 1, lane: 1 });
      await telemetry.createIndex({ timestamp: -1 });

      const evp = this.db.collection<EvpEventDoc>('evp_events');
      await evp.createIndex({ runId: 1, simTimeS: 1 });
      await evp.createIndex({ emsId: 1 });

      const signals = this.db.collection<SignalStateDoc>('signal_states');
      await signals.createIndex({ runId: 1, simTimeS: 1 });

      const anomalies = this.db.collection<AnomalyEventDoc>('anomaly_events');
      await anomalies.createIndex({ runId: 1, type: 1, detectedAt: -1 });
    } catch {
      // Indexes may already exist or user lacks permission; non-fatal
    }
  }

  /**
   * Ping database and return detailed status
   */
  public async getStatus(): Promise<DbStatusResponse> {
    const isConnected = !!(this.client && this.db);
    let pingLatencyMs: number | null = null;
    let serverInfo: { version?: string; uptime?: number } | undefined;
    let counts = {
      runs: this.fallbackRuns.size,
      telemetry: this.fallbackTelemetry.length,
      evp: this.fallbackEvp.length,
      signals: this.fallbackSignals.length,
      anomalies: this.fallbackAnomalies.length,
    };

    if (isConnected && this.db) {
      try {
        const start = performance.now();
        const adminDb = this.db.admin();
        const pingResult = await adminDb.ping();
        pingLatencyMs = Math.round((performance.now() - start) * 10) / 10;

        try {
          const buildInfo = await adminDb.command({ buildInfo: 1 });
          serverInfo = {
            version: buildInfo.version,
          };
        } catch {
          // Ignore command permission error
        }

        const [rCount, tCount, eCount, sCount, aCount] = await Promise.all([
          this.db.collection('simulation_runs').countDocuments(),
          this.db.collection('lane_telemetry').countDocuments(),
          this.db.collection('evp_events').countDocuments(),
          this.db.collection('signal_states').countDocuments(),
          this.db.collection('anomaly_events').countDocuments(),
        ]);

        counts = {
          runs: rCount,
          telemetry: tCount,
          evp: eCount,
          signals: sCount,
          anomalies: aCount,
        };
      } catch (err) {
        // Failed ping
        this.client = null;
        this.db = null;
        this.isFallbackMode = true;
      }
    } else {
      // Try background connect once
      void this.connect();
    }

    return {
      connected: isConnected,
      status: isConnected ? 'connected' : this.isFallbackMode ? 'fallback_mode' : 'connecting',
      database: this.dbName,
      host: this.uri.replace(/\/\/.*@/, '//***@'), // mask any credentials
      pingLatencyMs,
      collections: counts,
      serverInfo,
      error: !isConnected ? 'MongoDB daemon offline or connecting. Using resilient memory fallback buffer.' : null,
    };
  }

  // --- Collection Accessors ---

  public runsCollection(): Collection<SimulationRunDoc> | null {
    return this.db ? this.db.collection<SimulationRunDoc>('simulation_runs') : null;
  }

  public telemetryCollection(): Collection<LaneTelemetryDoc> | null {
    return this.db ? this.db.collection<LaneTelemetryDoc>('lane_telemetry') : null;
  }

  public evpCollection(): Collection<EvpEventDoc> | null {
    return this.db ? this.db.collection<EvpEventDoc>('evp_events') : null;
  }

  public signalsCollection(): Collection<SignalStateDoc> | null {
    return this.db ? this.db.collection<SignalStateDoc>('signal_states') : null;
  }

  public anomaliesCollection(): Collection<AnomalyEventDoc> | null {
    return this.db ? this.db.collection<AnomalyEventDoc>('anomaly_events') : null;
  }

  // --- Fallback Accessors ---
  public getFallback() {
    return {
      runs: this.fallbackRuns,
      telemetry: this.fallbackTelemetry,
      evp: this.fallbackEvp,
      signals: this.fallbackSignals,
      anomalies: this.fallbackAnomalies,
    };
  }

  /**
   * Graceful close
   */
  public async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
    }
  }
}
