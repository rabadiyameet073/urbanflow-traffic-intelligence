/**
 * Module 30: framework-light reactive store — now a **view model**.
 *
 * The simulation no longer lives here. It lives in `worker/sim.worker.ts`, and
 * this class holds only what the interface is allowed to display: numbers the
 * worker measured, and the controls that queue commands back to it.
 *
 * That boundary is the point. A store that owns the engine invites the UI to
 * reach into it (`store.simAdaptive.lanes[...].pos[...]`) and re-derive a metric
 * on the main thread, which is how a dashboard starts disagreeing with its own
 * benchmark. Now every displayed number arrives in a `kpis` message from
 * `MetricsAccumulator` and nowhere else (Rule 00).
 */
import { DEFAULT_SIM_CONFIG, LANES, SCENARIO_LIBRARY, SimConfigSchema } from '@urbanflow/core';
import type {
  EvpDecisionResponse,
  EvpStage,
  FrameEvent,
  IncidentKind,
  LaneId,
  LosGrade,
  MetricsSnapshot,
  Observation,
  PhaseId,
  SignalState,
  VehicleType,
} from '@urbanflow/core';
import { SimulationClient } from '../worker/client.js';
import type { ProposalVerdict } from '../worker/client.js';
import { STRINGS } from '../i18n/strings.js';
import { loadThemePref, resolveTheme, saveThemePref, loadMotionPref, saveMotionPref } from './storage.js';
import type { MotionPref } from './storage.js';

export interface Signal<T> {
  get(): T;
  set(v: T): void;
  subscribe(fn: (v: T) => void): () => void;
}

export function signal<T>(initial: T): Signal<T> {
  let val = initial;
  const subs = new Set<(v: T) => void>();
  return {
    get() {
      return val;
    },
    set(v: T) {
      if (val !== v) {
        val = v;
        for (const sub of subs) sub(val);
      }
    },
    subscribe(fn: (v: T) => void) {
      subs.add(fn);
      fn(val);
      return () => subs.delete(fn);
    },
  };
}

/**
 * Live KPI snapshot for one twin.
 *
 * Values are `null` until the simulation has produced evidence for them, so the
 * UI renders an em dash rather than a fabricated zero (Module 41 §6, Rule 00).
 */
export interface KpiSnapshot {
  avgDelayS: number | null;
  personDelayS: number | null;
  busDelayS: number | null;
  bikeDelayS: number | null;
  throughputVph: number | null;
  maxQueueM: number;
  stopsPerVeh: number | null;
  emsDelayS: number | null;
  fuelL: number;
  co2Kg: number;
  deniedCount: number;
  deniedPct: number;
  los: LosGrade | null;
  /** Module 02 §4 conservation law: arrivals === exited + inSystem + denied. */
  conservationBalanced: boolean;
}

const EMPTY_KPI: KpiSnapshot = {
  avgDelayS: null,
  personDelayS: null,
  busDelayS: null,
  bikeDelayS: null,
  throughputVph: null,
  maxQueueM: 0,
  stopsPerVeh: null,
  emsDelayS: null,
  fuelL: 0,
  co2Kg: 0,
  deniedCount: 0,
  deniedPct: 0,
  los: null,
  conservationBalanced: true,
};

export interface EvpStatusView {
  stage: EvpStage;
  planStatus: 'OK' | 'TIGHT';
  shortfallS: number;
  activeEmsId: string;
}

/** Module 16 §4.1 `evp.requests{accepted,rejected,reason}` and `evp.shortfallS`. */
export interface EvpCountersView {
  accepted: number;
  rejected: number;
  rejectedByReason: Record<string, number>;
  shortfallsS: number[];
}

/** Project a measured metrics snapshot onto the UI without inventing values. */
export function toKpi(metrics: MetricsSnapshot): KpiSnapshot {
  return {
    avgDelayS: metrics.avgDelayS,
    personDelayS: metrics.personDelayS,
    busDelayS: metrics.busDelayS,
    bikeDelayS: metrics.bikeDelayS,
    throughputVph: metrics.throughputVph,
    maxQueueM: metrics.maxQueueM,
    stopsPerVeh: metrics.stopsPerVeh,
    emsDelayS: metrics.emsDelayS,
    fuelL: metrics.idleFuelL,
    co2Kg: metrics.co2Kg,
    deniedCount: metrics.deniedEntries,
    deniedPct: metrics.deniedPct,
    los: metrics.los,
    conservationBalanced: metrics.conservation.balanced,
  };
}

export class AppStore {
  public readonly client: SimulationClient;

  // Controls (main thread owns intent, the worker owns effect)
  public readonly speed = signal<number>(5.0); // 5x default cold open
  public readonly isPaused = signal<boolean>(false);
  public readonly theme = signal<'dark' | 'light'>('dark');
  /** Module 42 §2: `system` follows the OS; `reduce` forces motion off in-app. */
  public readonly motionPref = signal<MotionPref>('system');
  public readonly scenarioId = signal<string>('ns-heavy-tide');
  public readonly seed = signal<number>(42);

  // Measured state, refreshed by worker messages
  public readonly kpiFixed = signal<KpiSnapshot>({ ...EMPTY_KPI });
  public readonly kpiAdaptive = signal<KpiSnapshot>({ ...EMPTY_KPI });
  public readonly stateHash = signal<string>('');
  public readonly signalAdaptive = signal<SignalState | null>(null);
  public readonly tSimS = signal<number>(0);
  public readonly observation = signal<Observation | null>(null);
  public readonly evpStatus = signal<EvpStatusView | null>(null);
  /** Present even when `evpStatus` is null, so refusals stay visible after a plan ends. */
  public readonly evpCounters = signal<EvpCountersView>({
    accepted: 0,
    rejected: 0,
    rejectedByReason: {},
    shortfallsS: [],
  });

  /** Per-lane stopped-vehicle counts, in `LANES` order, from the worker. */
  public readonly waiting = signal<number[]>([]);

  /** Non-fatal worker diagnostics (unknown scenario, protocol mismatch, restart). */
  public readonly workerNotice = signal<string>('');
  /**
   * Demand per approach, *as the worker reports it*.
   *
   * The sandbox edits this through `setLaneDemand`, but the number shown comes
   * back on every `kpis` message in `event.control`, never from the value that
   * was sent: the engine clamps and renormalises, and an operator reading their
   * own request back unpunished would be reading a guess (Rule 00).
   */
  public readonly laneDemands = signal<Record<LaneId, number>>({ ...DEFAULT_SIM_CONFIG.laneDemandVph } as Record<LaneId, number>);
  public readonly modalSplit = signal<Record<'CAR' | 'BIKE' | 'BUS' | 'TRUCK', number>>({
    CAR: DEFAULT_SIM_CONFIG.modalSplit.CAR ?? 0.82,
    BIKE: DEFAULT_SIM_CONFIG.modalSplit.BIKE ?? 0.08,
    BUS: DEFAULT_SIM_CONFIG.modalSplit.BUS ?? 0.04,
    TRUCK: DEFAULT_SIM_CONFIG.modalSplit.TRUCK ?? 0.06,
  });
  public readonly emsDetectDistanceM = signal<number>(DEFAULT_SIM_CONFIG.emsDetectDistanceM);
  public readonly speedLimitMps = signal<number>(DEFAULT_SIM_CONFIG.speedLimitMps);

  /**
   * The approach the sandbox and the keyboard act on (Module 31 §4: "arrows
   * select lane"). Choosing a lane is also how a click on the canvas sets the
   * target, so this is interface state rather than simulation state — nothing
   * in the worker knows or cares which row the operator is looking at.
   */
  public readonly selectedLane = signal<LaneId>('NB-TR');

  /** Module 16 §4.1: kernel counters and gauges, shown in the Audit panel. */
  public readonly safetyStats = signal<{
    conflicts: number;
    violationsPrevented: number;
    violationsPreventedByType: Record<string, number>;
    ticks: number;
    minGreenSeenS: number;
    maxGreenSeenS: number;
    yellowCompliancePct: number;
    allRedCompliancePct: number;
  }>({
    conflicts: 0,
    violationsPrevented: 0,
    violationsPreventedByType: {},
    ticks: 0,
    minGreenSeenS: 0,
    maxGreenSeenS: 0,
    yellowCompliancePct: 100,
    allRedCompliancePct: 100,
  });

  public readonly explainState = signal<{
    pressures: Record<PhaseId, number>;
    currentPhase: PhaseId;
    rule: string;
    explanation: string;
  }>({
    pressures: { P1_NS_LEFT: 0, P2_NS_THRU: 0, P3_EW_LEFT: 0, P4_EW_THRU: 0 },
    currentPhase: 'P2_NS_THRU',
    rule: 'HOLD_NORMAL',
    explanation: 'Adaptive arterial hold active.',
  });

  public readonly judgeTour = signal<{
    active: boolean;
    stepIndex: number;
    caption: string;
  }>({
    active: false,
    stepIndex: 0,
    caption: '',
  });

  /** Frame subscribers, called once per worker frame per twin. */
  private frameHandlers: Array<(event: FrameEvent) => void> = [];

  constructor() {
    this.client = new SimulationClient({
      onFrame: (event) => {
        for (const handler of this.frameHandlers) handler(event);
      },
      onKpis: (event) => {
        this.kpiFixed.set(toKpi(event.kpis.fixed));
        this.kpiAdaptive.set(toKpi(event.kpis.adaptive));
        this.observation.set(event.observation);
        this.signalAdaptive.set(event.observation.signal);
        this.waiting.set(event.waiting);
        this.tSimS.set(event.tSimS);
        this.laneDemands.set(event.control.laneDemandVph);
        this.modalSplit.set(event.control.modalSplit);
        this.emsDetectDistanceM.set(event.control.emsDetectDistanceM);
        this.speedLimitMps.set(event.control.speedLimitMps);
      },
      onDecision: (event) => {
        this.explainState.set({
          pressures: event.pressures as Record<PhaseId, number>,
          currentPhase: (event.currentPhase ?? 'P2_NS_THRU') as PhaseId,
          rule: event.rule,
          explanation: this.explain(event.rule),
        });
      },
      onSafety: (event) => {
        this.safetyStats.set({
          conflicts: event.conflicts,
          violationsPrevented: event.violationsPrevented,
          violationsPreventedByType: event.violationsPreventedByType,
          ticks: event.ticks,
          minGreenSeenS: event.minGreenSeenS,
          maxGreenSeenS: event.maxGreenSeenS,
          yellowCompliancePct: event.yellowCompliancePct,
          allRedCompliancePct: event.allRedCompliancePct,
        });
      },
      onHash: (event) => {
        this.stateHash.set(event.stateHash);
      },
      onEvp: (event) => {
        this.evpStatus.set(event.status);
        this.evpCounters.set(event.counters);
      },
      onError: (code, message) => {
        this.workerNotice.set(`${code}: ${message}`);
      },
      onRestart: (tSimS) => {
        this.workerNotice.set(STRINGS.panel.workerRestarted(tSimS));
      },
    });
  }

  /** Wire frame consumers. Called once from `main.ts` before `start()`. */
  public onFrame(handler: (event: FrameEvent) => void): void {
    this.frameHandlers.push(handler);
  }

  public start(): void {
    const scenario = this.scenarios().find((s) => s.id === this.scenarioId.get()) ?? this.scenarios()[0]!;
    // A scenario supplies a *partial* config; the boundary requires a complete
    // one, so it is parsed here rather than defaulted field-by-field ad hoc.
    const scenarioConfig = scenario.buildConfig(this.seed.get());
    const config = SimConfigSchema.parse({
      ...DEFAULT_SIM_CONFIG,
      ...scenarioConfig,
      seed: this.seed.get(),
    });
    this.laneDemands.set({ ...DEFAULT_SIM_CONFIG.laneDemandVph, ...(config.laneDemandVph ?? {}) } as Record<LaneId, number>);
    this.client.init(this.scenarioId.get(), this.seed.get(), config);
    this.client.run(this.speed.get());
  }

  /** Read-only scenario catalogue for the header selector. */
  public scenarios(): typeof SCENARIO_LIBRARY {
    return SCENARIO_LIBRARY;
  }

  public setSpeed(speed: number): void {
    this.speed.set(speed);
    if (!this.isPaused.get()) this.client.run(speed);
  }

  public togglePause(): void {
    // A deliberate user pause supersedes the automatic hidden-tab pause
    // (Module 15 §4.8); returning to the tab must not silently resume.
    this.autoPaused = false;
    const next = !this.isPaused.get();
    this.isPaused.set(next);
    if (next) {
      this.client.pause();
    } else {
      this.client.run(this.speed.get());
    }
  }

  /**
   * Module 15 §4.8: the tab-hidden time policy is *pause*. While hidden the
   * worker is stopped and nothing is drawn; returning resumes only if the pause
   * was ours, never overriding a deliberate user pause.
   */
  private autoPaused = false;

  public onVisibilityChange(hidden: boolean): void {
    if (hidden) {
      if (!this.isPaused.get()) {
        this.autoPaused = true;
        this.isPaused.set(true);
        this.client.pause();
      }
    } else if (this.autoPaused) {
      this.autoPaused = false;
      this.isPaused.set(false);
      this.client.run(this.speed.get());
    }
  }

  /** One extra fixed tick while paused (Module 31 §1 "single-step"). */
  public stepOnce(): void {
    if (this.isPaused.get()) this.client.step();
  }

  public restoreTo(tSimS: number): void {
    const clamped = Math.max(0, Math.min(tSimS, this.tSimS.get()));
    this.client.restoreTo(clamped);
  }

  public resetScenario(id: string, seed = 42): void {
    this.scenarioId.set(id);
    this.seed.set(seed);

    const scenario = this.scenarios().find((s) => s.id === id) ?? this.scenarios()[0]!;
    const scenarioConfig = scenario.buildConfig(seed);
    const config = SimConfigSchema.parse({
      ...DEFAULT_SIM_CONFIG,
      ...scenarioConfig,
      seed,
    });

    this.kpiFixed.set({ ...EMPTY_KPI });
    this.kpiAdaptive.set({ ...EMPTY_KPI });
    this.stateHash.set('');
    this.signalAdaptive.set(null);
    this.observation.set(null);
    this.evpStatus.set(null);
    this.evpCounters.set({ accepted: 0, rejected: 0, rejectedByReason: {}, shortfallsS: [] });
    this.tSimS.set(0);
    this.waiting.set([]);
    this.workerNotice.set('');
    this.laneDemands.set({ ...DEFAULT_SIM_CONFIG.laneDemandVph, ...(config.laneDemandVph ?? {}) } as Record<LaneId, number>);
    this.safetyStats.set({
      conflicts: 0,
      violationsPrevented: 0,
      violationsPreventedByType: {},
      ticks: 0,
      minGreenSeenS: 0,
      maxGreenSeenS: 0,
      yellowCompliancePct: 100,
      allRedCompliancePct: 100,
    });

    this.client.init(id, seed, config);
    if (!this.isPaused.get()) this.client.run(this.speed.get());
  }

  /**
   * Operator-initiated emergency preemption (Module 03).
   *
   * The worker spawns the vehicle and reads its distance back from the
   * simulator, so no part of the plan is invented here.
   */
  public requestPreemption(lane: LaneId, distanceM?: number): Promise<EvpDecisionResponse> {
    return this.client.requestPreemption(lane, distanceM);
  }

  /** Abandon the running preemption; normal control resumes (Module 03 §5.3). */
  public cancelPreemption(): void {
    this.client.cancelPreemption();
  }

  /**
   * Digital-twin what-if for an untrusted parameter proposal (Module 04 §3.4).
   *
   * The verification runs in the worker, next to the simulation, and applies
   * nothing — the verdict is what the operator is shown before deciding.
   */
  public verifyProposal(params: Record<string, unknown>): Promise<ProposalVerdict> {
    return this.client.verifyProposal(params);
  }

  public spawnEms(lane: LaneId): void {
    this.client.spawnEms(lane);
  }

  public injectIncident(
    kind: IncidentKind,
    lane: LaneId,
    positionM: number,
    durationS: number,
  ): void {
    this.client.injectIncident(lane, kind, positionM, durationS);
  }

  public clearIncident(lane: LaneId): void {
    this.client.clearIncident(lane);
  }

  public setLaneDemand(lane: LaneId, vph: number): void {
    const clamped = Math.max(0, Math.min(1800, Math.round(vph)));
    const current = this.laneDemands.get();
    this.laneDemands.set({ ...current, [lane]: clamped });
    this.client.setLaneDemand(lane, clamped);
  }

  /** Reset all 8 lane demands back to active scenario defaults */
  public resetDemandsToScenario(): void {
    const scenario = this.scenarios().find((s) => s.id === this.scenarioId.get()) ?? this.scenarios()[0]!;
    const cfg = scenario.buildConfig(this.seed.get());
    const defaults = { ...DEFAULT_SIM_CONFIG.laneDemandVph, ...(cfg.laneDemandVph ?? {}) };
    for (const lane of LANES) {
      const vph = defaults[lane] ?? 450;
      this.setLaneDemand(lane, vph);
    }
  }

  /** Apply a stress test preset across approaches */
  public applyExperimentPreset(preset: 'RUSH_HOUR' | 'ASYMMETRIC_TIDE' | 'STADIUM_SURGE' | 'LIGHT_NIGHT'): void {
    const plans: Record<string, Record<LaneId, number>> = {
      RUSH_HOUR: {
        'NB-TR': 1400, 'NB-L': 350,
        'SB-TR': 1400, 'SB-L': 350,
        'EB-TR': 1200, 'EB-L': 300,
        'WB-TR': 1200, 'WB-L': 300,
      },
      ASYMMETRIC_TIDE: {
        'NB-TR': 1500, 'NB-L': 400,
        'SB-TR': 250,  'SB-L': 80,
        'EB-TR': 300,  'EB-L': 100,
        'WB-TR': 200,  'WB-L': 60,
      },
      STADIUM_SURGE: {
        'NB-TR': 300,  'NB-L': 100,
        'SB-TR': 300,  'SB-L': 100,
        'EB-TR': 1600, 'EB-L': 450,
        'WB-TR': 350,  'WB-L': 120,
      },
      LIGHT_NIGHT: {
        'NB-TR': 150,  'NB-L': 40,
        'SB-TR': 150,  'SB-L': 40,
        'EB-TR': 100,  'EB-L': 30,
        'WB-TR': 100,  'WB-L': 30,
      },
    };
    const target = plans[preset];
    if (target) {
      for (const lane of LANES) {
        this.setLaneDemand(lane, target[lane] ?? 450);
      }
    }
  }

  /**
   * Inject `count` vehicles of one class into one approach (Module 31 §4).
   *
   * An ambulance injected here is a *vehicle*, not a request: it drives through
   * with priority filtering but the EVP manager is never asked for a plan, which
   * is exactly the comparison worth having — `requestPreemption` is the case
   * where the intersection clears itself for it.
   */
  public injectBurst(lane: LaneId, count = 5, type: VehicleType = 'CAR'): void {
    if (type === 'AMBULANCE') {
      void this.requestPreemption(lane);
    } else {
      this.client.spawnVehicle(lane, type, count);
    }
  }

  public spawnVehicle(lane: LaneId, type: VehicleType, count = 1, distanceM?: number): void {
    if (type === 'AMBULANCE') {
      void this.requestPreemption(lane);
    } else {
      this.client.spawnVehicle(lane, type, count, distanceM);
    }
  }

  /** Inject into whichever approach the operator is pointing at. */
  public spawnInSelectedLane(type: VehicleType, count = 1, distanceM?: number): void {
    this.spawnVehicle(this.selectedLane.get(), type, count, distanceM);
  }

  public selectLane(lane: LaneId): void {
    this.selectedLane.set(lane);
  }

  /**
   * Arrow-key lane walking: step the selection through `LANES`, wrapping at both
   * ends so the keyboard never runs into a dead stop.
   */
  public moveLaneSelection(delta: number): void {
    const index = LANES.indexOf(this.selectedLane.get());
    const next = (((index + delta) % LANES.length) + LANES.length) % LANES.length;
    this.selectedLane.set(LANES[next] ?? 'NB-TR');
  }

  /**
   * `±` on the keyboard: one step of demand on the selected approach.
   *
   * The base is the worker's echo, not a local copy, so a second press after a
   * clamp adds to the number that is actually in force.
   */
  public nudgeDemand(lane: LaneId, delta: number): void {
    const current = this.laneDemands.get()[lane] ?? 0;
    this.setLaneDemand(lane, current + delta);
  }

  /** EMS detection range, one of the three the spec offers (Module 31 §4). */
  public setEmsDetectDistance(distanceM: number): void {
    this.client.setParams({ emsDetectDistanceM: distanceM });
  }

  public setModalSplit(split: Record<'CAR' | 'BIKE' | 'BUS' | 'TRUCK', number>): void {
    this.client.setModalSplit(split);
  }

  public initTheme(): void {
    // Module 26 §6: the stored preference is read exactly once at startup;
    // `system` resolves through the OS media query.
    const pref = loadThemePref();
    const resolved = resolveTheme(pref);
    this.theme.set(resolved);
    document.documentElement.setAttribute('data-theme', resolved);
  }

  public toggleTheme(): void {
    const next = this.theme.get() === 'dark' ? 'light' : 'dark';
    this.theme.set(next);
    document.documentElement.setAttribute('data-theme', next);
    saveThemePref(next);
  }

  /**
   * Module 42 §2: reflect the stored motion preference onto `<html>` once at
   * boot. `reduce` adds the attribute the forced-reduced-motion CSS block keys
   * on; `system` adds nothing and the OS media query governs.
   */
  public initMotion(): void {
    const pref = loadMotionPref();
    this.motionPref.set(pref);
    this.applyMotion(pref);
  }

  public toggleMotion(): void {
    const next: MotionPref = this.motionPref.get() === 'reduce' ? 'system' : 'reduce';
    this.motionPref.set(next);
    this.applyMotion(next);
    saveMotionPref(next);
  }

  private applyMotion(pref: MotionPref): void {
    if (pref === 'reduce') {
      document.documentElement.setAttribute('data-reduce-motion', 'on');
    } else {
      document.documentElement.removeAttribute('data-reduce-motion');
    }
  }

  private explain(rule: string): string {
    return STRINGS.explain[rule] ?? 'Decision rule reported by the controller.';
  }
}

export const store = new AppStore();
