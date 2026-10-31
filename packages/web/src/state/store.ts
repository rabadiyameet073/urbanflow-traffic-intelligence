/**
 * Module 30: Framework-Light Reactive Signal Store
 */
import {
  SimEngine,
  FixedTimeController,
  AdaptiveController,
  SafetyKernel,
  SCENARIO_LIBRARY,
  TIMING,
  LANES,
  PHASES,
  PhaseId,
  SignalState,
  Observation,
} from '@urbanflow/core';

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

export interface KpiSnapshot {
  avgDelayS: number;
  personDelayS: number;
  throughputVph: number;
  maxQueueM: number;
  emsDelayS: number;
  stopsPerVeh: number;
  fuelL: number;
  co2Kg: number;
  deniedCount: number;
  deniedPct: number;
}

export class AppStore {
  // Simulator Instances
  public simFixed: SimEngine;
  public simAdaptive: SimEngine;
  public kernelFixed: SafetyKernel;
  public kernelAdaptive: SafetyKernel;
  public ctrlFixed: FixedTimeController;
  public ctrlAdaptive: AdaptiveController;

  // Reactive State
  public readonly speed = signal<number>(5.0); // 5x default cold open
  public readonly isPaused = signal<boolean>(false);
  public readonly theme = signal<'dark' | 'light'>('dark');
  public readonly scenarioId = signal<string>('ns-heavy-tide');
  public readonly seed = signal<number>(42);

  // Live KPI Snapshots
  public readonly kpiFixed = signal<KpiSnapshot>({
    avgDelayS: 0,
    personDelayS: 0,
    throughputVph: 0,
    maxQueueM: 0,
    emsDelayS: 0,
    stopsPerVeh: 0,
    fuelL: 0,
    co2Kg: 0,
    deniedCount: 0,
    deniedPct: 0,
  });

  public readonly kpiAdaptive = signal<KpiSnapshot>({
    avgDelayS: 0,
    personDelayS: 0,
    throughputVph: 0,
    maxQueueM: 0,
    emsDelayS: 0,
    stopsPerVeh: 0,
    fuelL: 0,
    co2Kg: 0,
    deniedCount: 0,
    deniedPct: 0,
  });

  // Safety & Conflict Tracking
  public readonly safetyStats = signal<{
    conflicts: number;
    violationsPrevented: number;
    ticks: number;
  }>({ conflicts: 0, violationsPrevented: 0, ticks: 0 });

  // Explainability
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

  // Judge Mode Tour
  public readonly judgeTour = signal<{
    active: boolean;
    stepIndex: number;
    caption: string;
  }>({
    active: false,
    stepIndex: 0,
    caption: '',
  });

  constructor() {
    const scenario = SCENARIO_LIBRARY.find((s) => s.id === 'ns-heavy-tide')!;
    const config = scenario.buildConfig(42);

    this.simFixed = new SimEngine({ ...config, seed: 42 });
    this.simAdaptive = new SimEngine({ ...config, seed: 42 });
    this.kernelFixed = new SafetyKernel();
    this.kernelAdaptive = new SafetyKernel();
    this.ctrlFixed = new FixedTimeController();
    this.ctrlAdaptive = new AdaptiveController();
  }

  public resetScenario(id: string, seed = 42): void {
    this.scenarioId.set(id);
    this.seed.set(seed);
    const scenario = SCENARIO_LIBRARY.find((s) => s.id === id) ?? SCENARIO_LIBRARY[0]!;
    const config = scenario.buildConfig(seed);

    this.simFixed = new SimEngine({ ...config, seed });
    this.simAdaptive = new SimEngine({ ...config, seed });
    this.kernelFixed.reset();
    this.kernelAdaptive.reset();
    this.ctrlFixed.reset();
    this.ctrlAdaptive.reset();
  }

  public toggleTheme(): void {
    const next = this.theme.get() === 'dark' ? 'light' : 'dark';
    this.theme.set(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('uf_v1_theme', next);
    } catch {
      // storage unavailable
    }
  }
}

export const store = new AppStore();
