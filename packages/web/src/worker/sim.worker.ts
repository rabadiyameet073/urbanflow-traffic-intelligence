/**
 * Module 31 §1: the simulation worker — an IO shell around `TwinWorld`.
 *
 * Everything in this file is *shell*: wall clock, message plumbing, frame
 * pacing, buffer recycling. None of it can affect the result of a tick, because
 * `performance.now()` only decides **how many** 0.1 s ticks run before the next
 * frame is posted (§1 "Determinism"). That is the whole reason the simulation
 * lives here and the renderer lives on the main thread.
 *
 * Anti-patterns this file exists to avoid (§9):
 *   - simulating on the main thread "just for the demo" — that is what this
 *     replaced, and it is why the dashboard used to jank under 8-lane load;
 *   - queueing every frame when the UI is slow — an unrecycled buffer is
 *     dropped, not queued;
 *   - variable-dt simulation — `accumulatorS` meters fixed steps only.
 */
import {
  FRAME_MAX_VEHICLES,
  SCENARIO_LIBRARY,
  TIMING,
  TwinWorld,
  VEHICLE_STRIDE,
  assertNever,
  parseCommand,
  WORKER_PROTOCOL_VERSION,
} from '@urbanflow/core';
import type {
  EvpEvent,
  FrameEvent,
  HashEvent,
  KpisEvent,
  WorkerCommand,
  WorkerEvent,
} from '@urbanflow/core';

/**
 * Narrow view of the worker global.
 *
 * Declaring it locally (rather than adding the `webworker` lib) keeps this file
 * compiling inside a DOM project — the two libs declare conflicting globals.
 */
interface WorkerScope {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent) => void) | null;
}

const scope = self as unknown as WorkerScope;

/** §1: cap on catch-up work so a stalled tab degrades instead of freezing. */
const MAX_STEPS_PER_FRAME = 40;
const FRAME_INTERVAL_MS = 16;
const KPI_INTERVAL_S = 0.25;
const HASH_INTERVAL_S = 1.0;
const SAFETY_INTERVAL_S = 1.0;
const EVP_INTERVAL_S = 0.25;
const LANE_COUNT = 8;

/** §2.3: two buffers per twin, so one lagging frame is tolerated before dropping. */
const POOL_SIZE = 4;
const FRAME_FLOATS = FRAME_MAX_VEHICLES * VEHICLE_STRIDE;

interface FramePool {
  vehicles: Float32Array[];
  heads: Uint8Array[];
}

const pool: FramePool = { vehicles: [], heads: [] };
for (let i = 0; i < POOL_SIZE; i++) {
  pool.vehicles.push(new Float32Array(FRAME_FLOATS));
  pool.heads.push(new Uint8Array(LANE_COUNT));
}

let world: TwinWorld | null = null;
let paused = true;
let speed = 5;
let accumulatorS = 0;
let lastMs = performance.now();
let lastKpiS = -Infinity;
let lastHashS = -Infinity;
let lastSafetyS = -Infinity;
let lastEvpS = -Infinity;
let invalidCommands = 0;
let droppedFrames = 0;
let reportedDropped = 0;

function post(event: WorkerEvent, transfer?: Transferable[]): void {
  scope.postMessage(event, transfer);
}

function error(code: string, message: string): void {
  post({ v: WORKER_PROTOCOL_VERSION, type: 'error', code, message });
}

// --- Publishing ---

function publish(force = false): void {
  if (!world) return;
  const tSimS = world.tSimS;

  if (force || tSimS - lastKpiS >= KPI_INTERVAL_S) {
    lastKpiS = tSimS;
    const { waiting } = world.queueDepths();
    const event: KpisEvent = {
      v: WORKER_PROTOCOL_VERSION,
      type: 'kpis',
      tSimS,
      kpis: world.kpis(),
      observation: world.observation(),
      waiting,
      control: world.control(),
    };
    post(event);

    const decision = world.decision();
    post({
      v: WORKER_PROTOCOL_VERSION,
      type: 'decision',
      tSimS,
      pressures: decision.pressures,
      currentPhase: decision.currentPhase,
      rule: decision.rule,
    });
  }

  if (force || tSimS - lastEvpS >= EVP_INTERVAL_S) {
    lastEvpS = tSimS;
    const event: EvpEvent = {
      v: WORKER_PROTOCOL_VERSION,
      type: 'evp',
      status: world.evpStatus(),
      counters: world.evpCounters(),
    };
    post(event);
  }

  if (force || tSimS - lastSafetyS >= SAFETY_INTERVAL_S) {
    lastSafetyS = tSimS;
    const safety = world.safety();
    post({
      v: WORKER_PROTOCOL_VERSION,
      type: 'safety',
      conflicts: safety.conflicts,
      violationsPrevented: safety.violationsPrevented,
      violationsPreventedByType: safety.violationsPreventedByType,
      ticks: safety.ticks,
      minGreenSeenS: safety.minGreenSeenS,
      maxGreenSeenS: safety.maxGreenSeenS,
      yellowCompliancePct: safety.yellowCompliancePct,
      allRedCompliancePct: safety.allRedCompliancePct,
    });
  }

  if (force || tSimS - lastHashS >= HASH_INTERVAL_S) {
    lastHashS = tSimS;
    const event: HashEvent = {
      v: WORKER_PROTOCOL_VERSION,
      type: 'hash',
      tSimS,
      stateHash: world.stateHash(),
    };
    post(event);
  }
}

/**
 * Post one frame per twin, transferring the buffers.
 *
 * If the pool is empty the frame is dropped and counted: a UI that cannot keep
 * up must see fewer frames, never a growing backlog (§7).
 */
function postFrames(): void {
  if (!world) return;

  for (const twin of ['fixed', 'adaptive'] as const) {
    const vehicles = pool.vehicles.pop();
    const heads = pool.heads.pop();
    if (!vehicles || !heads) {
      droppedFrames++;
      continue;
    }

    const header = world.packFrame(twin, vehicles, heads);
    const event: FrameEvent = {
      v: WORKER_PROTOCOL_VERSION,
      type: 'frame',
      twin,
      header,
      vehicles,
      signalHeads: heads,
    };
    post(event as WorkerEvent, [vehicles.buffer, heads.buffer]);
  }
}

// --- Clock ---

function frame(): void {
  const now = performance.now();
  const dtWallS = Math.min(0.25, (now - lastMs) / 1000);
  lastMs = now;

  if (!paused && world) {
    accumulatorS += dtWallS * speed;

    let steps = 0;
    while (accumulatorS >= TIMING.SIM_DT_S && steps < MAX_STEPS_PER_FRAME) {
      world.tick();
      accumulatorS -= TIMING.SIM_DT_S;
      steps++;
    }

    if (accumulatorS >= TIMING.SIM_DT_S) {
      // Overloaded: keep at most one tick of debt so recovery is immediate
      // rather than a minute of silent catch-up.
      accumulatorS = TIMING.SIM_DT_S;
    }

    if (steps > 0) publish();
  }

  postFrames();
  setTimeout(frame, FRAME_INTERVAL_MS);
}

// --- Commands ---

function handle(command: WorkerCommand): void {
  switch (command.type) {
    case 'init': {
      const known = SCENARIO_LIBRARY.some((scenario) => scenario.id === command.scenarioId);
      if (!known) {
        // Not fatal: the config is fully specified, the label is cosmetic. Say so
        // rather than silently pretending the scenario exists (Rule 00).
        error('UNKNOWN_SCENARIO', `scenario "${command.scenarioId}" is not in the library`);
      }
      world = new TwinWorld(command.scenarioId, command.seed, command.config);
      paused = true;
      speed = 5;
      accumulatorS = 0;
      lastMs = performance.now();
      lastKpiS = -Infinity;
      lastHashS = -Infinity;
      lastSafetyS = -Infinity;
      lastEvpS = -Infinity;
      publish(true);
      postFrames();
      break;
    }

    case 'run':
      if (!world) return;
      speed = command.speed;
      paused = false;
      break;

    case 'pause':
      paused = true;
      publish(true);
      break;

    case 'step':
      if (!world) return;
      world.tick();
      publish(true);
      break;

    case 'reset':
      if (!world) return;
      world.reset(command.seed);
      accumulatorS = 0;
      publish(true);
      postFrames();
      break;

    case 'setLaneDemand':
      world?.setLaneDemand(command.lane, command.vph);
      publish(true);
      break;

    case 'setModalSplit':
      world?.setModalSplit(command.split);
      publish(true);
      break;

    case 'spawnEms':
      world?.spawnEms(command.lane);
      publish(true);
      break;

    case 'spawnVehicle':
      world?.spawnVehicle(command.lane, command.vehicleType, command.count, command.distanceM);
      publish(true);
      break;

    case 'injectIncident':
      world?.injectIncident(command.kind, command.lane, command.positionM, command.durationS);
      publish(true);
      break;

    case 'clearIncident':
      world?.clearIncident(command.lane);
      publish(true);
      break;

    case 'setParams':
      world?.setParams(command.params);
      publish(true);
      break;

    case 'restoreTo':
      if (!world) return;
      world.restoreTo(command.tSimS);
      accumulatorS = 0;
      publish(true);
      postFrames();
      break;

    case 'requestSnapshot':
      if (!world) return;
      post({
        v: WORKER_PROTOCOL_VERSION,
        type: 'snapshot',
        tSimS: world.tSimS,
        seed: world.seed,
        config: world.simAdaptive.config,
      });
      break;

    case 'requestPreemption': {
      if (!world) return;
      const result = world.requestPreemption(command.lane);
      post({ v: WORKER_PROTOCOL_VERSION, type: 'preemptionResult', result });
      publish(true);
      break;
    }

    case 'cancelPreemption':
      world?.cancelPreemption();
      publish(true);
      break;

    case 'verifyProposal': {
      if (!world) return;
      // Deliberately synchronous. The what-if runs 5 simulated minutes twice and
      // finishes inside this message turn, so an approved verdict can never be
      // applied to a world that has moved on since it was computed.
      const result = world.verifyProposal(command.params);
      post({ v: WORKER_PROTOCOL_VERSION, type: 'proposalVerified', result });
      break;
    }

    case 'recycle':
      pool.vehicles.push(command.vehicles);
      pool.heads.push(command.signalHeads);
      break;

    case 'ping':
      post({ v: WORKER_PROTOCOL_VERSION, type: 'pong', n: command.n });
      break;

    default:
      // Module 50 §5: exhaustive switch with a never-check. All 19 command
      // variants are handled above; a new protocol command without an arm
      // here stops compiling rather than being silently ignored.
      return assertNever(command);
  }
}

scope.onmessage = (event: MessageEvent): void => {
  const parsed = parseCommand(event.data);
  if (!parsed.ok) {
    invalidCommands++;
    // §2.2: report the count, not a flood of errors — a skewed client would
    // otherwise generate one message per rejected command.
    if (invalidCommands - reportedDropped >= 10) {
      reportedDropped = invalidCommands;
      post({ v: WORKER_PROTOCOL_VERSION, type: 'dropped', count: invalidCommands });
    }
    return;
  }
  handle(parsed.command);
};

setTimeout(frame, FRAME_INTERVAL_MS);
