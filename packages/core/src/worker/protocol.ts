/**
 * Module 31 §2: versioned message catalogue between the main thread and the
 * simulation worker.
 *
 * Two rules make this catalogue worth having:
 *
 * 1. **Commands are validated, events are typed.** The main thread is the
 *    untrusted side of this boundary — a stale bundle can post anything — so
 *    every command crosses `WorkerCommandSchema` before it can touch the
 *    simulation. Events travel the other way and are constructed here only.
 * 2. **Everything carries `v`.** A command from a mismatched build is rejected
 *    with `PROTOCOL_VERSION_MISMATCH` rather than half-applied, which is how
 *    the "unknown/invalid ⇒ ignore and count" rule in §2.2 stays honest.
 *
 * Frame buffers (§2.3) are `Float32Array` payloads of stride 6 and can never be
 * zod-validated on the hot path; only their header is checked.
 */
import { z } from 'zod';
import { LANES, SimConfigSchema, VEHICLE_TYPES } from '../contracts.js';
import type { EvpDecisionResponse, EvpStage, LaneId, Observation, SignalState } from '../contracts.js';
import type { MetricsSnapshot } from '../metrics/metrics.js';

export const WORKER_PROTOCOL_VERSION = 1;

const V = z.literal(WORKER_PROTOCOL_VERSION);

// --- 2.3 Frame buffer layout ---

/** `[x, y, headingRad, lengthM, typeIdx, flags]` per vehicle. */
export const VEHICLE_STRIDE = 6;

/**
 * Upper bound on vehicles in one frame: `LANES.length × SimLane capacity`.
 *
 * The engine sizes every lane at 512 slots, so this is the true ceiling and not
 * an estimate. The frame pool is allocated once at this size and never grown.
 */
export const FRAME_MAX_VEHICLES = LANES.length * 512;

export const FRAME_INDEX = {
  X: 0,
  Y: 1,
  HEADING: 2,
  LENGTH_M: 3,
  TYPE: 4,
  FLAGS: 5,
} as const;

/** Bit flags in `FRAME_INDEX.FLAGS`. Mirrors `sim/types.ts` FLAG_* values. */
export const FRAME_FLAG = {
  BRAKING: 1,
  EMS: 2,
  IN_BOX: 4,
  FILTERING: 8,
} as const;

/** One byte per lane, in `LANES` order. */
export const SIGNAL_HEAD = { R: 0, Y: 1, G: 2 } as const;
export type SignalHeadCode = (typeof SIGNAL_HEAD)[keyof typeof SIGNAL_HEAD];

export const FRAME_HEADER = z.object({
  n: z.number().finite().int().nonnegative(),
  tSimS: z.number().finite().nonnegative(),
  tick: z.number().finite().int().nonnegative(),
  tickDtS: z.number().finite().positive(),
});
export type FrameHeader = z.infer<typeof FRAME_HEADER>;

// --- 2.1 Main → Worker (commands) ---

const SeedSchema = z.number().finite().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const InitCommand = z.object({
  v: V,
  type: z.literal('init'),
  scenarioId: z.string().min(1),
  seed: SeedSchema,
  config: SimConfigSchema,
});

export const RunCommand = z.object({
  v: V,
  type: z.literal('run'),
  /** Module 31 §1: the allowed speed set is fixed, not free-form. */
  speed: z.union([z.literal(0.5), z.literal(1), z.literal(5), z.literal(20)]),
});

export const PauseCommand = z.object({ v: V, type: z.literal('pause') });
export const StepCommand = z.object({ v: V, type: z.literal('step') });
export const ResetCommand = z.object({ v: V, type: z.literal('reset'), seed: SeedSchema });

export const SetLaneDemandCommand = z.object({
  v: V,
  type: z.literal('setLaneDemand'),
  lane: z.enum(LANES),
  vph: z.number().finite().min(0).max(1800),
});

export const SetModalSplitCommand = z.object({
  v: V,
  type: z.literal('setModalSplit'),
  split: z.object({
    CAR: z.number().finite().min(0).max(1),
    BIKE: z.number().finite().min(0).max(1),
    BUS: z.number().finite().min(0).max(1),
    TRUCK: z.number().finite().min(0).max(1),
  }),
});

export const SpawnEmsCommand = z.object({
  v: V,
  type: z.literal('spawnEms'),
  lane: z.enum(LANES),
});

/**
 * Inject any vehicle class into a lane, for the lane sandbox (Module 31 §4).
 *
 * `distanceM` is optional rather than defaulted: "enter at the boundary and
 * queue normally" and "appear 120 m upstream" are different experiments, and a
 * default would silently choose one of them for every caller.
 */
export const SpawnVehicleCommand = z.object({
  v: V,
  type: z.literal('spawnVehicle'),
  lane: z.enum(LANES),
  vehicleType: z.enum(VEHICLE_TYPES),
  count: z.number().finite().int().min(1).max(25).default(1),
  distanceM: z.number().finite().min(0).max(800).optional(),
});

export const InjectIncidentCommand = z.object({
  v: V,
  type: z.literal('injectIncident'),
  lane: z.enum(LANES),
  kind: z.enum(['BLOCKED', 'CAPACITY_DROP', 'DOUBLE_PARKED']),
  positionM: z.number().finite().min(0).max(2000),
  durationS: z.number().finite().positive().max(3600),
});

export const ClearIncidentCommand = z.object({
  v: V,
  type: z.literal('clearIncident'),
  lane: z.enum(LANES),
});

export const SetParamsCommand = z.object({
  v: V,
  type: z.literal('setParams'),
  params: SimConfigSchema.partial(),
});

export const RestoreToCommand = z.object({
  v: V,
  type: z.literal('restoreTo'),
  tSimS: z.number().finite().nonnegative(),
});

export const RequestSnapshotCommand = z.object({ v: V, type: z.literal('requestSnapshot') });

/**
 * Operator-initiated preemption. The worker — not the UI — spawns the vehicle
 * and reads its distance back from the simulator, so the plan can never be
 * built from a distance the interface invented.
 */
export const RequestPreemptionCommand = z.object({
  v: V,
  type: z.literal('requestPreemption'),
  lane: z.enum(LANES),
  distanceM: z.number().finite().min(0).max(800).optional(),
});

/**
 * Abandon the running preemption; normal control resumes (Module 03 §5.3).
 */
export const CancelPreemptionCommand = z.object({
  v: V,
  type: z.literal('cancelPreemption'),
});

/**
 * Verify a proposed adaptive-parameter change without applying it (Module 04 §3.4).
 *
 * The bounds are deliberately **not** enforced here: the point of the round trip
 * is to let the domain layer produce the rejection reason ("… is a
 * non-configurable safety parameter"), and a zod failure at this boundary would
 * replace that sentence with a protocol error. The worker validates the shape
 * only — scalars — and the what-if engine decides.
 */
export const VerifyProposalCommand = z.object({
  v: V,
  type: z.literal('verifyProposal'),
  params: z.record(z.string(), z.unknown()),
});

export const PingCommand = z.object({
  v: V,
  type: z.literal('ping'),
  n: z.number().finite().int().nonnegative(),
});

/**
 * Return a transferred frame buffer for reuse (§2.3 ping-pong pool).
 *
 * Without this the worker would allocate a fresh ~98 KB pair every frame; with
 * it, exactly four buffers exist for the lifetime of the worker and a lagging
 * main thread causes *frame drops* rather than unbounded growth.
 */
export const RecycleCommand = z.object({
  v: V,
  type: z.literal('recycle'),
  vehicles: z.custom<Float32Array>((value) => value instanceof Float32Array),
  signalHeads: z.custom<Uint8Array>((value) => value instanceof Uint8Array),
});

export const WorkerCommandSchema = z.discriminatedUnion('type', [
  InitCommand,
  RunCommand,
  PauseCommand,
  StepCommand,
  ResetCommand,
  SetLaneDemandCommand,
  SetModalSplitCommand,
  SpawnEmsCommand,
  SpawnVehicleCommand,
  InjectIncidentCommand,
  ClearIncidentCommand,
  SetParamsCommand,
  RestoreToCommand,
  RequestSnapshotCommand,
  RequestPreemptionCommand,
  CancelPreemptionCommand,
  VerifyProposalCommand,
  RecycleCommand,
  PingCommand,
]);

export type WorkerCommand = z.infer<typeof WorkerCommandSchema>;
export type WorkerCommandType = WorkerCommand['type'];

// --- 2.2 Worker → Main (events) ---

/**
 * One twin's render frame. `vehicles` and `signalHeads` are transferred, and
 * the main thread returns them through `recycle()` so the pool stays bounded.
 */
export interface FrameEvent {
  v: typeof WORKER_PROTOCOL_VERSION;
  type: 'frame';
  twin: 'fixed' | 'adaptive';
  header: FrameHeader;
  vehicles: Float32Array;
  signalHeads: Uint8Array;
}

/** The numbers the dashboard is allowed to display, straight from the accumulator. */
export interface KpiPayload {
  fixed: MetricsSnapshot;
  adaptive: MetricsSnapshot;
}

/**
 * The operator-facing knobs the worker is *actually* running, read back from the
 * live config.
 *
 * The sandbox panel edits these, but it never displays the value it sent: it
 * displays this echo. That is what keeps the view-model invariant in `store.ts`
 * honest — a demand slider whose fill came from local state would drift the
 * moment the worker renormalised a modal split or another tab edited the same
 * lane, and the operator would be reading their own guess rather than a fact
 * (Rule 00).
 */
export interface ControlEcho {
  /** Vehicles per hour per approach lane, as the engine holds it. */
  laneDemandVph: Record<LaneId, number>;
  /** Post-renormalisation fleet mix; AMBULANCE is never sampled, so it is absent. */
  modalSplit: Record<'CAR' | 'BIKE' | 'BUS' | 'TRUCK', number>;
  emsDetectDistanceM: number;
  speedLimitMps: number;
}

export interface KpisEvent {
  v: typeof WORKER_PROTOCOL_VERSION;
  type: 'kpis';
  tSimS: number;
  kpis: KpiPayload;
  /** Measured lanes, so the UI never re-derives a number from a buffer. */
  observation: Observation;
  /** Per-lane count of vehicles below 1 m/s, in `LANES` order. */
  waiting: number[];
  /** Current control values, so the sandbox panel renders the worker's truth. */
  control: ControlEcho;
}

export interface DecisionEvent {
  v: typeof WORKER_PROTOCOL_VERSION;
  type: 'decision';
  tSimS: number;
  pressures: Record<string, number>;
  currentPhase: SignalState['phase'];
  rule: string;
}

export interface SafetyEvent {
  v: typeof WORKER_PROTOCOL_VERSION;
  type: 'safety';
  conflicts: number;
  violationsPrevented: number;
  /** Per-kind breakdown, so the audit panel can name what was prevented. */
  violationsPreventedByType: Record<string, number>;
  ticks: number;
  /** Module 16 §4.1 gauges. Forwarded verbatim from `SafetyKernel.getMetrics()`. */
  minGreenSeenS: number;
  maxGreenSeenS: number;
  yellowCompliancePct: number;
  allRedCompliancePct: number;
}

export interface HashEvent {
  v: typeof WORKER_PROTOCOL_VERSION;
  type: 'hash';
  tSimS: number;
  stateHash: string;
}

export interface EvpEvent {
  v: typeof WORKER_PROTOCOL_VERSION;
  type: 'evp';
  status: {
    stage: EvpStage;
    planStatus: 'OK' | 'TIGHT';
    shortfallS: number;
    activeEmsId: string;
  } | null;
  /**
   * Module 16 §4.1. Present even while `status` is null, because the useful
   * question — how many requests were accepted or refused, and why — is asked
   * after a preemption has ended.
   */
  counters: {
    accepted: number;
    rejected: number;
    rejectedByReason: Record<string, number>;
    shortfallsS: number[];
  };
}

export interface SnapshotEvent {
  v: typeof WORKER_PROTOCOL_VERSION;
  type: 'snapshot';
  tSimS: number;
  seed: number;
  config: unknown;
}

export interface PreemptionResultEvent {
  v: typeof WORKER_PROTOCOL_VERSION;
  type: 'preemptionResult';
  result: EvpDecisionResponse;
}

/** Verdict from the digital-twin what-if; nothing has been applied. */
export interface ProposalVerifiedEvent {
  v: typeof WORKER_PROTOCOL_VERSION;
  type: 'proposalVerified';
  result: {
    approved: boolean;
    reason: string;
    improvementPct: number;
    currentPersonDelayS: number;
    proposedPersonDelayS: number;
    kernelViolations: number;
  };
}

export interface ErrorEvent {
  v: typeof WORKER_PROTOCOL_VERSION;
  type: 'error';
  code: string;
  message: string;
}

export interface PongEvent {
  v: typeof WORKER_PROTOCOL_VERSION;
  type: 'pong';
  n: number;
}

export interface DroppedEvent {
  v: typeof WORKER_PROTOCOL_VERSION;
  type: 'dropped';
  /** How many inbound commands were rejected as invalid since the last report. */
  count: number;
}

export type WorkerEvent =
  | FrameEvent
  | KpisEvent
  | DecisionEvent
  | SafetyEvent
  | HashEvent
  | EvpEvent
  | SnapshotEvent
  | PreemptionResultEvent
  | ProposalVerifiedEvent
  | ErrorEvent
  | PongEvent
  | DroppedEvent;

/**
 * Shape guard for inbound events.
 *
 * The main thread does not re-validate buffers (they are ours), but a stale
 * worker — for example one restored from the bfcache across a deploy — can post
 * a different version, and silently rendering its frames would be worse than
 * dropping them.
 */
export function isWorkerEvent(value: unknown): value is WorkerEvent {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { v?: unknown; type?: unknown };
  return candidate.v === WORKER_PROTOCOL_VERSION && typeof candidate.type === 'string';
}

/**
 * Parse a command, reporting why it failed instead of throwing.
 *
 * §2.2: in development an invalid message should be visible; in production it
 * is counted and ignored. Returning a result keeps that choice at the call site.
 */
export function parseCommand(
  value: unknown,
): { ok: true; command: WorkerCommand } | { ok: false; message: string } {
  const parsed = WorkerCommandSchema.safeParse(value);
  if (parsed.success) return { ok: true, command: parsed.data };
  const first = parsed.error.issues[0];
  const where = first?.path.join('.') ?? 'command';
  return { ok: false, message: `${where}: ${first?.message ?? 'invalid'}` };
}

/** Convenience wrapper so every command is built with the current version. */
export function command<T extends WorkerCommand['type'], P extends object>(
  type: T,
  payload: P,
): { v: typeof WORKER_PROTOCOL_VERSION; type: T } & P {
  return { v: WORKER_PROTOCOL_VERSION, type, ...payload };
}

/** Lane ids in frame order, re-exported so the renderer cannot drift from `LANES`. */
export const FRAME_LANE_ORDER: readonly LaneId[] = LANES;
