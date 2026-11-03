/**
 * MongoDB Document Types and Schemas for UrbanFlow Simulation System
 */
import type {
  LaneId,
  VehicleType,
  SignalIndication,
  LaneSignal,
  PhaseId,
  EvpStage,
  AnomalyType,
  SimConfig,
  LosGrade,
} from '@urbanflow/core';

export interface SimulationRunDoc {
  runId: string;
  seed: number;
  scenarioId: string;
  config: Partial<SimConfig>;
  startTime: string;
  endTime?: string;
  durationS: number;
  status: 'running' | 'completed' | 'terminated';
  metricsSummary?: {
    avgDelayAdaptiveS: number | null;
    avgDelayFixedS: number | null;
    losAdaptive: LosGrade | null;
    losFixed: LosGrade | null;
    totalArrivals: number;
    totalExited: number;
    totalDenied: number;
    conflicts: number;
    violationsPrevented: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface LaneTelemetryDoc {
  runId: string;
  simTimeS: number;
  lane: LaneId;
  vehicleCount: number;
  queueLengthM: number;
  occupancyPct: number;
  sumWeightedWaitS: number;
  maxWaitS: number;
  nearestEmsDistanceM: number | null;
  timestamp: Date;
}

export interface EvpEventDoc {
  runId: string;
  eventId: string;
  emsId: string;
  lane: LaneId;
  stage: EvpStage;
  distanceM: number;
  speedMps: number;
  decision: 'accepted' | 'rejected';
  reason?: string | null;
  shortfallS?: number;
  simTimeS: number;
  timestamp: Date;
}

export interface SignalStateDoc {
  runId: string;
  simTimeS: number;
  phase: PhaseId | null;
  indication: SignalIndication;
  timeInStateS: number;
  lanes: Record<LaneId, LaneSignal>;
  timestamp: Date;
}

export interface AnomalyEventDoc {
  runId: string;
  type: AnomalyType;
  lane: LaneId;
  severity: 'info' | 'warning' | 'critical';
  evidence: string[];
  simTimeS?: number;
  detectedAt: Date;
}

export interface DbStatusResponse {
  connected: boolean;
  status: 'connected' | 'connecting' | 'disconnected' | 'fallback_mode';
  database: string;
  host: string;
  pingLatencyMs: number | null;
  collections: {
    runs: number;
    telemetry: number;
    evp: number;
    signals: number;
    anomalies: number;
  };
  serverInfo?: {
    version?: string;
    uptime?: number;
  };
  error?: string | null;
}
