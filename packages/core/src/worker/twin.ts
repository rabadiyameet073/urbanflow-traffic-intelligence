/**
 * Module 31 §5: the twin world — both simulations, stepped in lockstep.
 *
 * This class is deliberately **pure**: no `postMessage`, no timers, no
 * wall-clock reads. The worker shell owns the clock; this owns the physics.
 * That split is what lets the whole thing be unit-tested in Node, and it is why
 * "Simulating on the main thread just for the demo" is not a viable shortcut
 * here — there is no thread in this file to put it on.
 *
 * Every user edit is recorded in the input log with the tick it was applied at,
 * and applied to *both* twins at that same tick (§5). Time travel is then
 * implemented as replay rather than memory snapshots: the world is rebuilt from
 * the seed and the log, which is exact because a tick's result depends only on
 * the seed, the log and the tick count.
 */
import { AdaptiveController } from '../control/adaptive.js';
import { EvpManager } from '../control/evp.js';
import { FixedTimeController } from '../control/fixed.js';
import { SafetyKernel } from '../control/kernel.js';
import { evaluateProposalWhatIf } from '../control/what_if.js';
import type { WhatIfEvaluationResult } from '../control/what_if.js';
import { MetricsAccumulator } from '../metrics/metrics.js';
import type { MetricsSnapshot } from '../metrics/metrics.js';
import { SimEngine } from '../sim/engine.js';
import { vehicleWorld } from '../sim/geometry.js';
import { LANES, TIMING, VEHICLE_SPECS } from '../contracts.js';
import type {
  ControlAction,
  EvpDecisionResponse,
  IncidentKind,
  LaneId,
  Observation,
  SimConfig,
  SignalState,
  VehicleType,
} from '../contracts.js';
import {
  FRAME_INDEX,
  FRAME_MAX_VEHICLES,
  SIGNAL_HEAD,
  VEHICLE_STRIDE,
} from './protocol.js';
import type { ControlEcho, FrameHeader, WorkerCommand } from './protocol.js';

export type TwinName = 'fixed' | 'adaptive';

export interface TwinKpis {
  fixed: MetricsSnapshot;
  adaptive: MetricsSnapshot;
}

interface LogEntry {
  tick: number;
  command: WorkerCommand;
}

/** A lane edit that must be replayed exactly during time travel. */
type ReplayableCommand = WorkerCommand;

/**
 * Both simulations share one seed and one config, so any difference in the
 * output is attributable to the controller and nothing else (Module 25 §1).
 */
export class TwinWorld {
  public scenarioId: string;
  public seed: number;

  public simFixed: SimEngine;
  public simAdaptive: SimEngine;
  public kernelFixed: SafetyKernel;
  public kernelAdaptive: SafetyKernel;
  public ctrlFixed: FixedTimeController;
  public ctrlAdaptive: AdaptiveController;
  public metricsFixed = new MetricsAccumulator();
  public metricsAdaptive = new MetricsAccumulator();
  public evpAdaptive = new EvpManager();

  /** Incidents this world created, so `clearIncident` can find them by lane. */
  private readonly incidentIds = new Map<LaneId, string[]>();

  /** Replayable edits, in application order. Never mutated by time travel (§6). */
  private inputLog: LogEntry[] = [];

  /**
   * The configuration the world was launched with.
   *
   * `SimEngine.applyParams` mutates a config in place, so `simAdaptive.config`
   * reflects every edit ever applied. Rebuilding from it would bake the edits
   * into the *initial* state and then apply them a second time from the log —
   * one extra RNG draw per re-armed lane, and a different future. Replay must
   * start from the launch config and let the log do the editing.
   */
  private readonly baseConfig: SimConfig;

  private lastAction: ControlAction | null = null;

  /**
   * The rule actually in force this tick, for the explainability panel.
   *
   * Module 03 §4 lists `EVP` as one of the machine-readable rules. It is not a
   * rule the adaptive controller can return — preemption is a directive applied
   * by the kernel — so it is recorded here. Reporting the adaptive reason while
   * an ambulance is holding the green would make the panel explain a decision
   * that was not the one in force.
   */
  private lastRule = 'HOLD_NORMAL';
  private signalFixed: SignalState;
  private signalAdaptive: SignalState;

  constructor(scenarioId: string, seed: number, config: SimConfig) {
    this.scenarioId = scenarioId;
    this.seed = seed;
    this.baseConfig = {
      ...config,
      laneDemandVph: { ...config.laneDemandVph },
      modalSplit: { ...config.modalSplit },
    };
    this.simFixed = new SimEngine({ ...config, seed });
    this.simAdaptive = new SimEngine({ ...config, seed });
    this.kernelFixed = new SafetyKernel();
    this.kernelAdaptive = new SafetyKernel();
    this.ctrlFixed = new FixedTimeController();
    this.ctrlAdaptive = new AdaptiveController();
    this.signalFixed = this.simFixed.observe().signal;
    this.signalAdaptive = this.simAdaptive.observe().signal;
  }

  // --- Clock ---

  public get tSimS(): number {
    return this.simAdaptive.simTimeS;
  }

  public get tickCount(): number {
    return this.simAdaptive.tickCount;
  }

  /**
   * Advance both twins by exactly one fixed tick.
   *
   * The order is fixed and identical for both twins: observe → decide → request
   * → kernel writes the signal → physics → metrics. The kernel is the only
   * writer of `SignalState` (Rule 06), so the controller and the EVP manager
   * both produce *inputs* here, never signal state.
   */
  public tick(): void {
    const obsFixed = this.simFixed.observe();
    const actionFixed = this.ctrlFixed.decide(obsFixed);
    this.signalFixed = this.kernelFixed.step(actionFixed, null, TIMING.SIM_DT_S);
    this.simFixed.step(this.signalFixed);
    this.metricsFixed.ingest(this.simFixed.drainEvents());

    const obsAdaptive = this.simAdaptive.observe();

    // Emergency vehicle preemption logic: automatically trigger immediate preemption
    // whenever an ambulance enters any approach lane (bypassing normal cycle).
    // Bind the plan to the ambulance already in the lane (by id) rather than
    // spawning a fresh one, so a detected EMS preempts for *itself*.
    if (this.evpAdaptive.getStatus() === null || this.evpAdaptive.getStatus()?.stage === 'RECOVERY') {
      for (const lane of LANES) {
        const laneObs = obsAdaptive.lanes[lane];
        if (laneObs && laneObs.nearestEmsDistanceM !== null && laneObs.nearestEmsDistanceM !== undefined) {
          const existingEmsId = this.simAdaptive.nearestEmsId(lane);
          this.submitPreemption(lane, laneObs.nearestEmsDistanceM, existingEmsId ?? undefined);
          break;
        }
      }
    }

    this.lastAction = this.ctrlAdaptive.decide(obsAdaptive);
    const directive = this.evpAdaptive.step(obsAdaptive, TIMING.SIM_DT_S);
    // The kernel gets the controller's own request plus the directive, unchanged:
    // substituting `directive.targetPhase` here would keep forcing the EMS phase
    // during RECOVERY and the interrupted phases would never get their turn.
    this.lastRule = directive === null ? this.lastAction.reason : 'EVP';
    this.signalAdaptive = this.kernelAdaptive.step(
      this.lastAction,
      directive,
      TIMING.SIM_DT_S,
    );
    this.simAdaptive.step(this.signalAdaptive);
    this.metricsAdaptive.ingest(this.simAdaptive.drainEvents());
  }

  // --- Edits (recorded, then applied to both twins) ---

  /** Hard reset: launch config, new seed, cleared input log. */
  public reset(seed: number): void {
    this.buildWorlds(seed);
    this.inputLog = [];
  }

  public setLaneDemand(lane: LaneId, vph: number): void {
    this.record({ v: 1, type: 'setLaneDemand', lane, vph });
    // Only the edited lane is re-armed: touching the other seven would consume
    // their RNG streams and shuffle arrivals the operator never asked about.
    this.simFixed.applyParams({ laneDemandVph: { [lane]: vph } });
    this.simAdaptive.applyParams({ laneDemandVph: { [lane]: vph } });
  }

  public setModalSplit(split: Record<'CAR' | 'BIKE' | 'BUS' | 'TRUCK', number>): void {
    this.record({ v: 1, type: 'setModalSplit', split });
    // Both engines renormalise the same complete split identically, so no
    // pre-normalisation is needed and neither engine reads the other's config.
    this.simFixed.applyParams({ modalSplit: split });
    this.simAdaptive.applyParams({ modalSplit: split });
  }

  public spawnEms(lane: LaneId, distanceM?: number): string {
    this.record({ v: 1, type: 'spawnEms', lane, distanceM });
    return this.spawnEmsInternal(lane, distanceM);
  }

  /**
   * Inject `count` vehicles of `type` into `lane` (Module 31 §4 lane controls).
   *
   * Both twins get them, exactly as an ambulance does: an injection that only
   * appeared on one side would stop the two columns being a comparison of
   * controllers and start being a comparison of traffic.
   */
  public spawnVehicle(lane: LaneId, type: VehicleType, count = 1, distanceM?: number): string[] {
    this.record({ v: 1, type: 'spawnVehicle', lane, vehicleType: type, count, distanceM });
    return this.spawnVehicleInternal(lane, type, count, distanceM);
  }

  /** Spawn without logging. Shared by the live path and replay. */
  private spawnVehicleInternal(
    lane: LaneId,
    type: VehicleType,
    count: number,
    distanceM?: number,
  ): string[] {
    this.simFixed.spawnVehicle(lane, type, count, distanceM);
    return this.simAdaptive.spawnVehicle(lane, type, count, distanceM);
  }

  private spawnEmsInternal(lane: LaneId, distanceM?: number): string {
    this.simFixed.spawnEms(lane, distanceM);
    return this.simAdaptive.spawnEms(lane, distanceM);
  }

  public injectIncident(
    kind: IncidentKind,
    lane: LaneId,
    positionM: number,
    durationS: number,
  ): string {
    this.record({ v: 1, type: 'injectIncident', lane, kind, positionM, durationS });
    this.simFixed.setIncident(kind, lane, positionM, durationS);
    const id = this.simAdaptive.setIncident(kind, lane, positionM, durationS);
    const ids = this.incidentIds.get(lane) ?? [];
    ids.push(id);
    this.incidentIds.set(lane, ids);
    return id;
  }

  public clearIncident(lane: LaneId): void {
    this.record({ v: 1, type: 'clearIncident', lane });
    for (const sim of [this.simFixed, this.simAdaptive]) {
      for (const id of this.incidentIds.get(lane) ?? []) sim.clearIncident(id);
    }
    this.incidentIds.delete(lane);
  }

  public setParams(patch: Partial<SimConfig>): void {
    this.record({ v: 1, type: 'setParams', params: patch });
    this.simFixed.applyParams(patch);
    this.simAdaptive.applyParams(patch);
  }

  /**
   * Operator preemption, Module 03.
   *
   * The distance comes from the simulator, not from the caller: the vehicle is
   * spawned first, then its measured distance is read back and used to build
   * the request. A plan built on a client-supplied distance would be fiction.
   */
  public requestPreemption(lane: LaneId, distanceM?: number): EvpDecisionResponse {
    this.record({ v: 1, type: 'requestPreemption', lane, distanceM });
    return this.submitPreemption(lane, distanceM);
  }

  /** Spawn + request, without logging. Shared by the live path and replay. */
  private submitPreemption(
    lane: LaneId,
    targetDistanceM?: number,
    existingEmsId?: string,
  ): EvpDecisionResponse {
    const simTimeS = this.simAdaptive.simTimeS;
    // If vehicle is already spawned in the twins, reuse its emsId rather than duplicating
    const emsId = existingEmsId ?? this.spawnEmsInternal(lane, targetDistanceM);
    const laneObs = this.simAdaptive.observe().lanes[lane];
    const distanceM = Math.min(
      800,
      Math.max(20, laneObs?.nearestEmsDistanceM ?? (targetDistanceM ?? this.simAdaptive.config.emsDetectDistanceM)),
    );

    return this.evpAdaptive.submitRequest(
      {
        id: emsId,
        lane,
        distanceM,
        // An *assumed* approach speed, not a measured one: the vehicle has just
        // entered the entry buffer and has no velocity yet. The ETA it produces
        // is replaced by a measured distance every step in `EvpManager.step`.
        speedMps: 12.5,
        tRequestS: simTimeS,
        nonce: `${emsId}:${Math.round(simTimeS * 10)}`,
        source: 'operator-console',
      },
      simTimeS,
    );
  }

  /**
   * Abandon the running preemption (Module 03 §5.3).
   *
   * Logged like every other edit, because a cancelled preemption changes the
   * future: an unlogged cancel would make `restoreTo` replay a different world
   * from the one the operator watched.
   */
  public cancelPreemption(): boolean {
    this.record({ v: 1, type: 'cancelPreemption' });
    return this.cancelActiveEms();
  }

  private cancelActiveEms(): boolean {
    const status = this.evpAdaptive.getStatus();
    if (status === null) return false;
    return this.evpAdaptive.cancelRequest(status.activeEmsId);
  }

  /**
   * Digital-twin what-if for a proposed parameter change (Module 04 §3.4).
   *
   * Read-only: it clones the current config into two fresh engines and returns a
   * verdict. Nothing here can reach `SignalState`, which is the point — a
   * proposal is verified before a human is offered an Approve button.
   */
  public verifyProposal(params: Record<string, unknown>): WhatIfEvaluationResult {
    return evaluateProposalWhatIf(this.simAdaptive, this.ctrlAdaptive.params, params);
  }

  // --- Time travel (§6) ---

  /**
   * Rebuild to `tSimS` by replaying the input log.
   *
   * Replay rather than snapshot because a tick is a pure function of
   * `(seed, log, tickCount)`: the result is bit-identical without needing to
   * serialise several hundred typed arrays and the closure state of sixteen RNG
   * streams. The cost is O(ticks) per scrub, which at 0.1 s ticks is one
   * millisecond of work per simulated minute.
   */
  public restoreTo(tSimS: number): void {
    const targetTick = Math.max(0, Math.min(Math.round(tSimS / TIMING.SIM_DT_S), this.tickCount));

    this.buildWorlds(this.seed);

    let logIndex = 0;
    while (this.tickCount < targetTick) {
      while (logIndex < this.inputLog.length && this.inputLog[logIndex]!.tick === this.tickCount) {
        this.replay(this.inputLog[logIndex]!.command);
        logIndex++;
      }
      this.tick();
    }

    // Commands recorded at exactly the target tick belong to that tick's state.
    while (logIndex < this.inputLog.length && this.inputLog[logIndex]!.tick === this.tickCount) {
      this.replay(this.inputLog[logIndex]!.command);
      logIndex++;
    }
  }

  // --- Read models ---

  public signal(twin: TwinName): SignalState {
    return twin === 'fixed' ? this.signalFixed : this.signalAdaptive;
  }

  public kpis(): TwinKpis {
    return {
      fixed: this.metricsFixed.snapshot(this.simFixed),
      adaptive: this.metricsAdaptive.snapshot(this.simAdaptive),
    };
  }

  /**
   * The control values the worker is actually running.
   *
   * Both twins share one config object per engine and receive every edit at the
   * same tick, so reading the adaptive side is not a choice between two truths —
   * it is the same truth. The panel renders this echo instead of the value it
   * sent, because the engine renormalises a modal split and clamps a demand,
   * and an operator should never be shown a number the simulator rejected
   * (Rule 00).
   */
  public control(): ControlEcho {
    const config = this.simAdaptive.config;
    const laneDemandVph = {} as Record<LaneId, number>;
    for (const lane of LANES) {
      laneDemandVph[lane] = config.laneDemandVph[lane] ?? 0;
    }
    return {
      laneDemandVph,
      modalSplit: {
        CAR: config.modalSplit.CAR ?? 0.82,
        BIKE: config.modalSplit.BIKE ?? 0.08,
        BUS: config.modalSplit.BUS ?? 0.04,
        TRUCK: config.modalSplit.TRUCK ?? 0.06,
      },
      emsDetectDistanceM: config.emsDetectDistanceM,
      speedLimitMps: config.speedLimitMps,
    };
  }

  public safety(): {
    conflicts: number;
    violationsPrevented: number;
    violationsPreventedByType: Record<string, number>;
    ticks: number;
    minGreenSeenS: number;
    maxGreenSeenS: number;
    yellowCompliancePct: number;
    allRedCompliancePct: number;
  } {
    const metrics = this.kernelAdaptive.getMetrics();
    const violations = Object.values(metrics.violationsPrevented).reduce((a, b) => a + b, 0);
    // Module 16 §4.1: the kernel already tracks these gauges; they were being
    // summed into one integer at this boundary and lost. Forwarded as-is.
    return {
      conflicts: metrics.conflicts,
      violationsPrevented: violations,
      violationsPreventedByType: { ...metrics.violationsPrevented },
      ticks: metrics.ticks,
      minGreenSeenS: metrics.minGreenSeenS,
      maxGreenSeenS: metrics.maxGreenSeenS,
      yellowCompliancePct: metrics.yellowCompliancePct,
      allRedCompliancePct: metrics.allRedCompliancePct,
    };
  }

  public decision(): {
    pressures: Record<string, number>;
    currentPhase: SignalState['phase'];
    rule: string;
  } {
    return {
      pressures: (this.lastAction?.pressures ?? {}) as Record<string, number>,
      currentPhase: this.signalAdaptive.phase,
      rule: this.lastRule,
    };
  }

  public stateHash(): string {
    return this.simAdaptive.stateHash();
  }

  /**
   * Measured lane state for one twin.
   *
   * Sent to the main thread so the dashboard never re-derives a queue length or
   * a wait time from a render buffer — a number shown to an operator must come
   * from the same observer the kernel uses (Rule 00).
   */
  public observation(twin: TwinName = 'adaptive'): Observation {
    return (twin === 'fixed' ? this.simFixed : this.simAdaptive).observe();
  }

  public evpStatus(): ReturnType<EvpManager['getStatus']> {
    return this.evpAdaptive.getStatus();
  }

  /** Module 16 §4.1 EVP counters. Read separately because they outlive a plan. */
  public evpCounters(): ReturnType<EvpManager['getCounters']> {
    return this.evpAdaptive.getCounters();
  }

  public queueDepths(): { queueM: number[]; waiting: number[] } {
    const queueM: number[] = [];
    const waiting: number[] = [];

    for (const laneId of LANES) {
      const lane = this.simAdaptive.lanes[laneId];
      let deepest = 0;
      let stopped = 0;
      // Contiguous run from the stop line, the same definition the observer
      // reports (Module 20 §8). Counting every stopped vehicle would show a
      // queue behind a moving one.
      for (let i = 0; i < lane.count; i++) {
        const slot = lane.order[i] as number;
        if ((lane.vel[slot] as number) >= 1.0) break;
        stopped++;
        const pos = lane.pos[slot] as number;
        if (pos > deepest) deepest = pos;
      }
      queueM.push(deepest);
      waiting.push(stopped);
    }

    return { queueM, waiting };
  }

  /**
   * Pack one twin into `out` as `[x, y, headingRad, lengthM, typeIdx, flags]`.
   *
   * `out` must hold at least `FRAME_MAX_VEHICLES * VEHICLE_STRIDE` floats; the
   * worker shell owns a ping-pong pair of exactly that size.
   */
  public packFrame(twin: TwinName, out: Float32Array, heads: Uint8Array): FrameHeader {
    const sim = twin === 'fixed' ? this.simFixed : this.simAdaptive;
    let n = 0;

    for (let laneIdx = 0; laneIdx < LANES.length; laneIdx++) {
      const laneId = LANES[laneIdx]!;
      const lane = sim.lanes[laneId];

      for (let i = 0; i < lane.count; i++) {
        if (n >= FRAME_MAX_VEHICLES) break;
        const slot = lane.order[i] as number;
        const world = vehicleWorld(laneId, lane.pos[slot] as number);
        const base = n * VEHICLE_STRIDE;

        out[base + FRAME_INDEX.X] = world.x;
        out[base + FRAME_INDEX.Y] = world.y;
        out[base + FRAME_INDEX.HEADING] = world.headingRad;
        out[base + FRAME_INDEX.LENGTH_M] = VEHICLE_SPECS[lane.getVehicleType(slot)].lengthM;
        out[base + FRAME_INDEX.TYPE] = lane.typ[slot] as number;
        out[base + FRAME_INDEX.FLAGS] = lane.flags[slot] as number;
        n++;
      }

      const indication = this.signal(twin).lanes[laneId];
      heads[laneIdx] =
        indication === 'G' ? SIGNAL_HEAD.G : indication === 'Y' ? SIGNAL_HEAD.Y : SIGNAL_HEAD.R;
    }

    return { n, tSimS: sim.simTimeS, tick: sim.tickCount, tickDtS: TIMING.SIM_DT_S };
  }

  // --- Internals ---

  private buildWorlds(seed: number): void {
    const config = this.baseConfig;
    this.seed = seed;
    this.simFixed = new SimEngine({ ...config, seed });
    this.simAdaptive = new SimEngine({ ...config, seed });
    this.kernelFixed = new SafetyKernel();
    this.kernelAdaptive = new SafetyKernel();
    this.ctrlFixed = new FixedTimeController();
    this.ctrlAdaptive = new AdaptiveController();
    this.metricsFixed = new MetricsAccumulator();
    this.metricsAdaptive = new MetricsAccumulator();
    this.evpAdaptive = new EvpManager();
    this.incidentIds.clear();
    this.lastAction = null;
    this.lastRule = 'HOLD_NORMAL';
    this.signalFixed = this.simFixed.observe().signal;
    this.signalAdaptive = this.simAdaptive.observe().signal;
  }

  private record(command: ReplayableCommand): void {
    this.inputLog.push({ tick: this.tickCount, command });
  }

  /** Re-apply a logged command without logging it again. */
  private replay(command: ReplayableCommand): void {
    switch (command.type) {
      case 'setLaneDemand':
        this.simFixed.applyParams({ laneDemandVph: { [command.lane]: command.vph } });
        this.simAdaptive.applyParams({ laneDemandVph: { [command.lane]: command.vph } });
        break;
      case 'setModalSplit':
        this.simFixed.applyParams({ modalSplit: command.split });
        this.simAdaptive.applyParams({ modalSplit: command.split });
        break;
      case 'spawnEms':
        this.spawnEmsInternal(command.lane);
        break;
      case 'spawnVehicle':
        this.spawnVehicleInternal(
          command.lane,
          command.vehicleType,
          command.count,
          command.distanceM,
        );
        break;
      case 'requestPreemption':
        this.submitPreemption(command.lane);
        break;
      case 'cancelPreemption':
        this.cancelActiveEms();
        break;
      case 'injectIncident': {
        this.simFixed.setIncident(
          command.kind,
          command.lane,
          command.positionM,
          command.durationS,
        );
        const id = this.simAdaptive.setIncident(
          command.kind,
          command.lane,
          command.positionM,
          command.durationS,
        );
        const ids = this.incidentIds.get(command.lane) ?? [];
        ids.push(id);
        this.incidentIds.set(command.lane, ids);
        break;
      }
      case 'clearIncident':
        for (const sim of [this.simFixed, this.simAdaptive]) {
          for (const id of this.incidentIds.get(command.lane) ?? []) sim.clearIncident(id);
        }
        this.incidentIds.delete(command.lane);
        break;
      case 'setParams':
        this.simFixed.applyParams(command.params);
        this.simAdaptive.applyParams(command.params);
        break;
      default:
        // Non-replayable commands never enter the log.
        break;
    }
  }
}
