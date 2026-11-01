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

/** Coarse conflict relation. Any two different phases conflict. */
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

/**
 * Module 02 §1.2: `FIRE_ENGINE` is a UI/reporting alias of `AMBULANCE` kinematics.
 * It is never a distinct simulation class, so it must never appear in RNG draws.
 */
export const VEHICLE_TYPE_ALIASES: Readonly<Record<string, VehicleType>> = {
  FIRE_ENGINE: 'AMBULANCE',
};

/** Resolve a user-facing or imported type label to a canonical `VehicleType`. */
export function resolveVehicleType(label: string): VehicleType | null {
  const upper = label.trim().toUpperCase();
  if ((VEHICLE_TYPES as readonly string[]).includes(upper)) {
    return upper as VehicleType;
  }
  return VEHICLE_TYPE_ALIASES[upper] ?? null;
}

/**
 * Module 02 §1.2: CO2 factors are assumptions, never measurements.
 * Fuel (L) x factor (kg/L) gives emitted mass; the UI must surface the factors
 * in an "assumptions" popover (Module 41 §6) and in RESULTS.md.
 */
export const CO2_KG_PER_L: Readonly<Record<VehicleSpec['fuelType'], number>> = {
  gasoline: 2.31,
  diesel: 2.68,
  none: 0,
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
  // Module 20 §6: an EMS enters at its detection distance doing 54 km/h, and
  // may pass the queue on the shoulder at no more than 8 m/s while filtering.
  EMS_CRUISE_MPS: 15.0,
  EMS_YIELD_MPS: 8.0,
} as const;

// --- 3a. Level of Service (HCM control-delay scale) ---

export const LOS_GRADES = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
export type LosGrade = typeof LOS_GRADES[number];

/** Upper bound of mean control delay (s/veh) per grade. Grade F is unbounded. */
export const LOS_UPPER_BOUND_S: Readonly<Record<Exclude<LosGrade, 'F'>, number>> = {
  A: 10,
  B: 20,
  C: 35,
  D: 55,
  E: 80,
};

/** Module 02 §4: map mean control delay to an HCM level of service. */
export function computeLos(avgDelayS: number | null): LosGrade | null {
  if (avgDelayS === null || !Number.isFinite(avgDelayS)) return null;
  if (avgDelayS <= LOS_UPPER_BOUND_S.A) return 'A';
  if (avgDelayS <= LOS_UPPER_BOUND_S.B) return 'B';
  if (avgDelayS <= LOS_UPPER_BOUND_S.C) return 'C';
  if (avgDelayS <= LOS_UPPER_BOUND_S.D) return 'D';
  if (avgDelayS <= LOS_UPPER_BOUND_S.E) return 'E';
  return 'F';
}

// --- 4. Adaptive Parameters (Tunable, Bounded) ---

export const AdaptiveParamsSchema = z.object({
  G_MIN_EFFICIENT_S: z.number().finite().min(12).max(40).default(25),
  RATIO: z.number().finite().min(1.5).max(6).default(3.0),
  FLOOR: z.number().finite().min(0).max(20).default(8.0),
  GAP_S: z.number().finite().min(1).max(6).default(3.0),
  alpha: z.number().finite().min(0).max(3).default(1.0),
  beta: z.number().finite().min(0).max(3).default(1.0),
  gamma: z.number().finite().min(0).max(3).default(1.0),
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

/**
 * The canonical boot state: no phase active, every lane red.
 *
 * Module 13 §2 E1 says no code outside the Safety Kernel writes a `SignalState`.
 * The simulator still needs *something* to render before the first kernel tick, so
 * the one state that exists before any decision is defined here — with the type —
 * rather than rebuilt by each consumer. After the first tick only
 * `SafetyKernel.buildSignalState()` produces one.
 *
 * Callers must copy it (`{ ...INITIAL_SIGNAL_STATE, lanes: { ...INITIAL_SIGNAL_STATE.lanes } }`)
 * rather than share the reference, or two engines end up aliasing one object.
 */
export const INITIAL_SIGNAL_STATE: Readonly<SignalState> = Object.freeze({
  phase: null,
  indication: 'ALL_RED' as const,
  timeInStateS: 0,
  lanes: Object.freeze({
    'NB-TR': 'R', 'NB-L': 'R',
    'SB-TR': 'R', 'SB-L': 'R',
    'EB-TR': 'R', 'EB-L': 'R',
    'WB-TR': 'R', 'WB-L': 'R',
  }) as Record<LaneId, LaneSignal>,
});

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

// Module 55 §2 rule 3: every numeric carries `.finite()` plus bounds. The
// bounds already reject ±Infinity in practice; `.finite()` makes the intent
// explicit and closes the one unbounded field below from accepting Infinity.
export const EvpRequestSchema = z.object({
  id: z.string(),
  lane: z.enum(LANES),
  distanceM: z.number().finite().min(20).max(800),
  speedMps: z.number().finite().min(3).max(35),
  tRequestS: z.number().finite(),
  nonce: z.string(),
  source: z.string(),
});

export type EvpRequest = z.infer<typeof EvpRequestSchema>;

export const SignedEvpSchema = EvpRequestSchema.extend({
  ts: z.number().finite(), // epoch ms
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
  /** Another preemption is already in progress on a different phase (§5.3). */
  | 'PREEMPTION_ACTIVE'
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
  seed: z.number().finite().int().default(42),
  laneDemandVph: z.record(z.enum(LANES), z.number().finite().min(0).max(1800)).default({
    'NB-TR': 450, 'NB-L': 150,
    'SB-TR': 450, 'SB-L': 150,
    'EB-TR': 450, 'EB-L': 150,
    'WB-TR': 450, 'WB-L': 150,
  }),
  modalSplit: z.record(z.enum(VEHICLE_TYPES), z.number().finite().min(0).max(1)).default({
    CAR: 0.82,
    BIKE: 0.08,
    BUS: 0.04,
    TRUCK: 0.06,
    AMBULANCE: 0.0,
  }),
  durationS: z.number().finite().positive().default(3600),
  laneLengthM: z.number().finite().positive().default(300),
  speedLimitMps: z.number().finite().positive().default(13.9),
  emsDetectDistanceM: z.number().finite().min(100).max(800).default(300),
  emsFiltering: z.boolean().default(true),
});

export type SimConfig = z.infer<typeof SimConfigSchema>;

/**
 * A bounded, partial edit to a *running* configuration (Module 31 §2.1 `setParams`).
 *
 * `laneDemandVph` and `modalSplit` are partial because an operator edits one
 * lane or one vehicle class at a time. Re-arming untouched lanes would consume
 * their RNG streams and shuffle arrivals nobody asked about.
 */
export type SimConfigPatch = Partial<Omit<SimConfig, 'laneDemandVph' | 'modalSplit'>> & {
  laneDemandVph?: Partial<Record<LaneId, number>>;
  modalSplit?: Partial<Record<VehicleType, number>>;
};

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

/**
 * Module 02 §3: the six frozen Kafka topics with their key, partition count
 * and retention. Rule 12 §1 makes this list the single definition — the
 * Makefile, the Spark job and the edge gateway must use these exact names and
 * never re-type them. `vehicle-events` is retired (Module 06 conflict 12).
 */
export const KAFKA_TOPICS = {
  /** Per-vehicle/per-lane observations. */
  laneTelemetry: { name: 'lane-telemetry', key: 'intersectionId:lane', partitions: 3, retentionMs: 3_600_000 },
  /** Signal transitions (ordered). */
  signalState: { name: 'signal-state', key: 'intersectionId', partitions: 1, retentionMs: 3_600_000 },
  /** EVP lifecycle. */
  emergencyEvents: { name: 'emergency-events', key: 'intersectionId', partitions: 1, retentionMs: 3_600_000 },
  /** 10 s window aggregates (Spark output). */
  laneMetrics: { name: 'lane-metrics', key: 'intersectionId:lane', partitions: 3, retentionMs: 3_600_000 },
  /** BLOCKAGE / DEMAND_SURGE / SIGNAL_STUCK / EMS_DELAYED. */
  anomalyEvents: { name: 'anomaly-events', key: 'intersectionId', partitions: 1, retentionMs: 3_600_000 },
  /** Unknown `schemaVersion` and schema failures (24 h retention). */
  dlq: { name: 'dlq', key: 'topic', partitions: 1, retentionMs: 86_400_000 },
} as const;

export type KafkaTopicName = (typeof KAFKA_TOPICS)[keyof typeof KAFKA_TOPICS]['name'];

/**
 * Module 02 §3: deterministic event id `<runId>:<tick>:<lane|na>:<kind>`.
 * Replays and duplicates are detectable *because* the id is a pure function of
 * the run inputs — never mix wall time into an eventId.
 */
export function makeEventId(
  runId: string,
  tick: number,
  lane: LaneId | 'na',
  kind: string,
): string {
  return `${runId}:${tick}:${lane}:${kind}`;
}

/**
 * Module 16 §2: run identifier format `run<seed>-<scenario>-<yyyymmddHHMM>`.
 * Pure by construction: the IO shell (producer, bench, recorder) reads the wall
 * clock and passes the compact stamp in — `core` never does (Rule 07).
 */
export function makeRunId(seed: number, scenarioId: string, stampYyyyymmddHHmm: string): string {
  return `run${seed}-${scenarioId}-${stampYyyyymmddHHmm}`;
}

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
    priorityLevel: z.number().finite(),
    speedKmh: z.number().finite(),
    distanceToStopLineMeters: z.number().finite(),
    waitingTimeSeconds: z.number().finite(),
  }),
  laneMetrics: z.object({
    currentQueueLengthMeters: z.number().finite(),
    occupancyPercent: z.number().finite(),
  }),
});

export type LaneTelemetryPayload = z.infer<typeof LaneTelemetryPayloadSchema>;

export const SignalStatePayloadSchema = KafkaEnvelopeSchema.extend({
  phase: z.enum(PHASES).nullable(),
  indication: z.enum(SIGNAL_INDICATIONS),
  timeInStateS: z.number().finite(),
  lanes: z.record(z.enum(LANES), z.enum(['G', 'Y', 'R'])),
});

export type SignalStatePayload = z.infer<typeof SignalStatePayloadSchema>;

export const LaneMetricsPayloadSchema = KafkaEnvelopeSchema.extend({
  windowStart: z.string(),
  windowEnd: z.string(),
  approachLane: z.enum(LANES),
  vehicleCount: z.number().finite().int(),
  weightedDelay: z.number().finite(),
  maxQueueM: z.number().finite(),
  avgSpeedKmh: z.number().finite().nullable(),
  dischargeCount: z.number().finite().int(),
  pressureIndex: z.number().finite(),
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

