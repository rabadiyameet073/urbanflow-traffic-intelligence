/**
 * Module 02 & Module 22: Domain Model & Frozen Contracts
 * Source of truth for UrbanFlow AI domain models, constants, and Zod schemas.
 */
import { z } from 'zod';

export const SCHEMA_VERSION = 1;

// --- 1. Lanes and Phases ---

export const LANES = [
  'NB-TR', 'NB-L',
  'SB-TR', 'SB-L',
  'EB-TR', 'EB-L',
  'WB-TR', 'WB-L',
] as const;

export type LaneId = typeof LANES[number];

export const PHASES = [
  'P1_NS_LEFT',
  'P2_NS_THRU',
  'P3_EW_LEFT',
  'P4_EW_THRU',
] as const;

export type PhaseId = typeof PHASES[number];

export const PHASE_LANES: Record<PhaseId, readonly [LaneId, LaneId]> = {
  P1_NS_LEFT: ['NB-L', 'SB-L'],
  P2_NS_THRU: ['NB-TR', 'SB-TR'],
  P3_EW_LEFT: ['EB-L', 'WB-L'],
  P4_EW_THRU: ['EB-TR', 'WB-TR'],
};

export const LANE_TO_PHASE: Record<LaneId, PhaseId> = {
  'NB-L': 'P1_NS_LEFT',
  'SB-L': 'P1_NS_LEFT',
  'NB-TR': 'P2_NS_THRU',
  'SB-TR': 'P2_NS_THRU',
  'EB-L': 'P3_EW_LEFT',
  'WB-L': 'P3_EW_LEFT',
  'EB-TR': 'P4_EW_THRU',
  'WB-TR': 'P4_EW_THRU',
};

/** Coarse conflict relation: any two different phases conflict. */
export function conflictsWith(a: PhaseId, b: PhaseId): boolean {
  return a !== b;
}

// --- 2. Vehicle Types & Kinematic Specs ---

export const VEHICLE_TYPES = ['BIKE', 'CAR', 'BUS', 'TRUCK', 'AMBULANCE'] as const;
export type VehicleType = typeof VEHICLE_TYPES[number];

export interface VehicleSpec {
  type: VehicleType;
  lengthM: number;
  maxAccel: number;       // m/s^2
  comfortDecel: number;   // m/s^2 (b in IDM)
  maxSpeedMps: number;    // m/s
  timeHeadwayT: number;   // seconds (T in IDM)
  minGapS0: number;       // meters (s0 in IDM)
  pax: number;
  priorityWeight: number;
  idleFuelLPerHour: number;
  fuelType: 'gasoline' | 'diesel' | 'none';
}

export const VEHICLE_SPECS: Record<VehicleType, VehicleSpec> = {
  BIKE: {
    type: 'BIKE',
    lengthM: 1.8,
    maxAccel: 3.0,
    comfortDecel: 2.5,
    maxSpeedMps: 7.0,
    timeHeadwayT: 1.2,
    minGapS0: 1.5,
    pax: 1,
    priorityWeight: 1.0,
    idleFuelLPerHour: 0.0,
    fuelType: 'none',
  },
  CAR: {
    type: 'CAR',
    lengthM: 4.5,
    maxAccel: 2.5,
    comfortDecel: 2.0,
    maxSpeedMps: 13.9, // 50 km/h
    timeHeadwayT: 1.5,
    minGapS0: 2.0,
    pax: 1.4,
    priorityWeight: 1.2,
    idleFuelLPerHour: 0.6,
    fuelType: 'gasoline',
  },
  BUS: {
    type: 'BUS',
    lengthM: 12.0,
    maxAccel: 1.2,
    comfortDecel: 1.5,
    maxSpeedMps: 11.1, // 40 km/h
    timeHeadwayT: 1.5,
    minGapS0: 2.5,
    pax: 45.0,
    priorityWeight: 8.5,
    idleFuelLPerHour: 2.0,
    fuelType: 'diesel',
  },
  TRUCK: {
    type: 'TRUCK',
    lengthM: 16.5,
    maxAccel: 0.8,
    comfortDecel: 1.2,
    maxSpeedMps: 11.1,
    timeHeadwayT: 1.8,
    minGapS0: 3.0,
    pax: 1.0,
    priorityWeight: 2.0,
    idleFuelLPerHour: 1.8,
    fuelType: 'diesel',
  },
  AMBULANCE: {
    type: 'AMBULANCE',
    lengthM: 6.5,
    maxAccel: 3.5,
    comfortDecel: 2.5,
    maxSpeedMps: 15.0, // 54 km/h
    timeHeadwayT: 1.2,
    minGapS0: 2.0,
    pax: 2.0,
    priorityWeight: 1000.0, // High priority preemption
    idleFuelLPerHour: 0.9,
    fuelType: 'diesel',
  },
};

// --- 3. Timing Constants (seconds) ---

export const TIMING = {
  G_MIN_S: 7.0,              // Safety minimum green
  G_MAX_S: 65.0,             // Maximum normal green
  EVP_HOLD_MAX_S: 90.0,      // Max green duration when holding for EVP
  YELLOW_S: 3.5,             // Inviolable yellow
  ALL_RED_S: 2.0,            // Inviolable all-red
  PLANNING_WINDOW_S: 10.0,   // Re-plan cadence
  FIXED_CYCLE_S: 90.0,       // 2*(10 + 24) + 4*(3.5 + 2.0) = 68 + 22 = 90 s
  FIXED_LEFT_GREEN_S: 10.0,  // P1 and P3 green duration in fixed-time
  FIXED_THRU_GREEN_S: 24.0,  // P2 and P4 green duration in fixed-time
  MAX_RED_WAIT_S: 120.0,     // Anti-starvation bound
  SIM_DT_S: 0.1,             // Fixed physics tick
  BOX_CROSSING_THRU_M: 18.0, // Box crossing distance for through lanes
  BOX_CROSSING_LEFT_M: 22.0, // Box crossing distance for left lanes
  MAX_ENTRY_BUFFER_WAIT_S: 30.0, // Max wait in entry buffer before DENIED
} as const;

// --- 4. Adaptive Parameters (Tunable, Bounded) ---

export const AdaptiveParamsSchema = z.object({
  G_MIN_EFFICIENT_S: z.number().min(12).max(40).default(25),
  RATIO: z.number().min(1.5).max(6).default(3.0),
  FLOOR: z.number().min(0).max(20).default(8.0),
  GAP_S: z.number().min(1).max(6).default(3.0),
  alpha: z.number().min(0).max(3).default(1.0),
  beta: z.number().min(0).max(3).default(1.0),
  gamma: z.number().min(0).max(3).default(1.0),
});

export type AdaptiveParams = z.infer<typeof AdaptiveParamsSchema>;

export const DEFAULT_ADAPTIVE_PARAMS: AdaptiveParams = {
  G_MIN_EFFICIENT_S: 25.0,
  RATIO: 3.0,
  FLOOR: 8.0,
  GAP_S: 3.0,
  alpha: 1.0,
  beta: 1.0,
  gamma: 1.0,
};

// --- 5. Signals & Controller Actions ---

export const SIGNAL_INDICATIONS = ['GREEN', 'YELLOW', 'ALL_RED', 'FLASH_RED'] as const;
export type SignalIndication = typeof SIGNAL_INDICATIONS[number];
export type LaneSignal = 'G' | 'Y' | 'R';

export interface SignalState {
  phase: PhaseId | null;
  indication: SignalIndication;
  timeInStateS: number;
  lanes: Record<LaneId, LaneSignal>;
}

export interface ControlAction {
  requestedPhase: PhaseId | null;
  reason: string;
  pressures?: Record<PhaseId, number>;
}

export interface Controller {
  readonly id: string;
  decide(obs: Observation): ControlAction;
  reset(): void;
}

// --- 6. Observations & Telemetry ---

export interface LaneObservation {
  laneId: LaneId;
  vehicleCount: number;
  queueLengthM: number;
  sumWeightedWaitS: number;
  maxWaitS: number;
  arrivalsLast10s: number;
  dischargedLast10s: number;
  occupancyPct: number;
  nearestEmsDistanceM: number | null;
  valid: boolean;
}

export interface Observation {
  simTimeS: number;
  lanes: Record<LaneId, LaneObservation>;
  signal: SignalState;
  activeIncidents: Array<{ lane: LaneId; kind: IncidentKind; positionM: number }>;
}

// --- 7. Emergency Vehicles & Incidents ---

export const INCIDENT_KINDS = ['BLOCKED', 'CAPACITY_DROP', 'DOUBLE_PARKED'] as const;
export type IncidentKind = typeof INCIDENT_KINDS[number];

export const EvpRequestSchema = z.object({
  id: z.string(),
  lane: z.enum(LANES),
  distanceM: z.number().min(20).max(800),
  speedMps: z.number().min(3).max(35),
  tRequestS: z.number(),
  nonce: z.string(),
  source: z.string(),
});

export type EvpRequest = z.infer<typeof EvpRequestSchema>;

export const SignedEvpSchema = EvpRequestSchema.extend({
  ts: z.number(), // epoch ms
  signature: z.string(),
});

export type SignedEvp = z.infer<typeof SignedEvpSchema>;

export type EvpDecisionReason =
  | 'BAD_SIGNATURE'
  | 'TIMESTAMP_SKEW'
  | 'NONCE_REPLAY'
  | 'RATE_LIMITED'
  | 'STORM_GUARD'
  | 'IMPLAUSIBLE_SPEED'
  | 'IMPLAUSIBLE_DISTANCE'
  | 'UNKNOWN_LANE'
  | 'INVALID_REQUEST';

export interface EvpDecisionResponse {
  id: string;
  decision: 'accepted' | 'rejected';
  reason: EvpDecisionReason | null;
  serverTime: string;
}

export type EvpStage = 'IDLE' | 'PRECLEAR' | 'EMS_GREEN' | 'RECOVERY';

export interface EvpDirective {
  stage: EvpStage;
  targetPhase: PhaseId;
  planStatus: 'OK' | 'TIGHT';
  shortfallS: number;
  activeEmsId: string;
}

// --- 8. Simulation Config ---

export const SimConfigSchema = z.object({
  seed: z.number().int().default(42),
  laneDemandVph: z.record(z.enum(LANES), z.number().min(0).max(1800)),
  modalSplit: z.record(z.enum(VEHICLE_TYPES), z.number().min(0).max(1)),
  durationS: z.number().positive().default(3600),
  laneLengthM: z.number().positive().default(300),
  speedLimitMps: z.number().positive().default(13.9),
  emsDetectDistanceM: z.number().min(100).max(800).default(300),
  emsFiltering: z.boolean().default(true),
});

export type SimConfig = z.infer<typeof SimConfigSchema>;

export const DEFAULT_SIM_CONFIG: SimConfig = {
  seed: 42,
  laneDemandVph: {
    'NB-TR': 450, 'NB-L': 150,
    'SB-TR': 450, 'SB-L': 150,
    'EB-TR': 450, 'EB-L': 150,
    'WB-TR': 450, 'WB-L': 150,
  },
  modalSplit: {
    CAR: 0.82,
    BIKE: 0.08,
    BUS: 0.04,
    TRUCK: 0.06,
    AMBULANCE: 0.0,
  },
  durationS: 3600,
  laneLengthM: 300,
  speedLimitMps: 13.9,
  emsDetectDistanceM: 300,
  emsFiltering: true,
};

// --- 9. Domain Events ---

export type DomainEvent =
  | {
      kind: 'vehicleExited';
      simTimeS: number;
      lane: LaneId;
      vehicleType: VehicleType;
      delayS: number;
      stops: number;
      waitS: number;
      pax: number;
    }
  | {
      kind: 'vehicleDenied';
      simTimeS: number;
      lane: LaneId;
      vehicleType: VehicleType;
    }
  | {
      kind: 'emsMilestone';
      simTimeS: number;
      emsId: string;
      lane: LaneId;
      milestone: 'spawned' | 'detected' | 'stopLineReached' | 'boxExited';
      delayS?: number;
    }
  | {
      kind: 'incident';
      simTimeS: number;
      action: 'started' | 'cleared';
      lane: LaneId;
      incidentKind: IncidentKind;
      positionM: number;
    }
  | {
      kind: 'signalTransition';
      simTimeS: number;
      phase: PhaseId | null;
      indication: SignalIndication;
    };

// --- 10. Kafka & Wire Event Envelopes ---

export const KafkaEnvelopeSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  eventId: z.string(),
  timestamp: z.string(),
  intersectionId: z.string(),
  controller: z.enum(['fixed', 'adaptive']).optional(),
});

export const LaneTelemetryPayloadSchema = KafkaEnvelopeSchema.extend({
  approachLane: z.enum(LANES),
  vehicle: z.object({
    vehicleId: z.string(),
    type: z.enum(VEHICLE_TYPES),
    priorityLevel: z.number(),
    speedKmh: z.number(),
    distanceToStopLineMeters: z.number(),
    waitingTimeSeconds: z.number(),
  }),
  laneMetrics: z.object({
    currentQueueLengthMeters: z.number(),
    occupancyPercent: z.number(),
  }),
});

export type LaneTelemetryPayload = z.infer<typeof LaneTelemetryPayloadSchema>;

export const SignalStatePayloadSchema = KafkaEnvelopeSchema.extend({
  phase: z.enum(PHASES).nullable(),
  indication: z.enum(SIGNAL_INDICATIONS),
  timeInStateS: z.number(),
  lanes: z.record(z.enum(LANES), z.enum(['G', 'Y', 'R'])),
});

export type SignalStatePayload = z.infer<typeof SignalStatePayloadSchema>;

export const LaneMetricsPayloadSchema = KafkaEnvelopeSchema.extend({
  windowStart: z.string(),
  windowEnd: z.string(),
  approachLane: z.enum(LANES),
  vehicleCount: z.number().int(),
  weightedDelay: z.number(),
  maxQueueM: z.number(),
  avgSpeedKmh: z.number().nullable(),
  dischargeCount: z.number().int(),
  pressureIndex: z.number(),
  runId: z.string(),
});

export type LaneMetricsPayload = z.infer<typeof LaneMetricsPayloadSchema>;

export const ANOMALY_TYPES = [
  'BLOCKAGE',
  'DEMAND_SURGE',
  'SIGNAL_STUCK',
  'EMS_DELAYED',
] as const;

export type AnomalyType = typeof ANOMALY_TYPES[number];

export const AnomalyEventPayloadSchema = KafkaEnvelopeSchema.extend({
  type: z.enum(ANOMALY_TYPES),
  lane: z.enum(LANES),
  severity: z.enum(['info', 'warning', 'critical']),
  evidence: z.array(z.string()),
  windowStart: z.string(),
  windowEnd: z.string(),
  detectedAt: z.string(),
  runId: z.string(),
});

export type AnomalyEventPayload = z.infer<typeof AnomalyEventPayloadSchema>;
