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
import { DEFAULT_SIM_CONFIG, SCENARIO_LIBRARY, SimConfigSchema } from '@urbanflow/core';
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
  public requestPreemption(lane: LaneId): Promise<EvpDecisionResponse> {
    return this.client.requestPreemption(lane);
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
    this.client.setLaneDemand(lane, Math.max(0, Math.min(1800, vph)));
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
