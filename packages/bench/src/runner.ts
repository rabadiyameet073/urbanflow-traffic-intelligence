/**
 * Module 25: Paired-Seed Benchmark Runner & Honest Statistics Engine
 *
 * Every number written here is measured from the simulation event stream.
 * Nothing is scaled, smoothed or hard-coded: if a metric has no measurement
 * behind it, it is reported as `null` rather than filled with a plausible
 * constant (Rule 00 — honest numbers).
 *
 * Method: for each scenario, the same seed drives the same arrival stream
 * through the Fixed and the Adaptive controller. Differences are paired
 * per seed and a seeded bootstrap gives the 95% CI. Held-out seeds are used for
 * every headline number; tuning seeds are disclosed in `seeds.heldOut`.
 */
import {
  SimEngine,
  FixedTimeController,
  AdaptiveController,
  SafetyKernel,
  SCENARIO_LIBRARY,
  DEFAULT_ADAPTIVE_PARAMS,
  pairedBootstrapCi,
  mean,
  TIMING,
} from '@urbanflow/core';
import type { AdaptiveParams, BenchmarkScenario } from '@urbanflow/core';
import os from 'node:os';

export interface ScenarioResult {
  id: string;
  name: string;
  expectation: string;
  metrics: {
    /** Person-weighted mean delay, averaged across seeds (paired). */
    personDelayS: {
      fixed: number;
      adaptive: number;
      /** `fixed - adaptive`; positive means Adaptive was quicker. */
      diff: number;
      diffCI95: [number, number];
      /** Mean of per-seed relative differences, in percent. Negative = Adaptive slower. */
      relPct: number;
      relCI95: [number, number];
    };
    /** Mean delay over vehicles that actually exited (unweighted). */
    avgDelayS: { fixed: number; adaptive: number };
    /** Exits per hour of simulated time. */
    throughputVph: { fixed: number; adaptive: number };
    /** Vehicles that reached the stop line (exited). */
    exited: { fixed: number; adaptive: number };
  };
  integrity: {
    /** Share of arrivals that never entered the approach, in percent. */
    deniedPct: number;
    deniedPctFixed: number;
    /** arrivals = exited + in-system + denied, for both controllers. */
    conservationOk: boolean;
    kernelConflicts: number;
  };
}

export interface FullBenchmarkResults {
  schemaVersion: 2;
  commit: string;
  createdAt: string;
  environment: {
    node: string;
    platform: string;
    cpu: string;
  };
  seeds: {
    /** Module 25 §2: tuning block — never published from, never mixed with held-out. */
    train: [number, number];
    heldOut: [number, number];
    /** Every seed actually executed, so the range claim is auditable. */
    all: number[];
  };
  /** Module 25 §5.2/§9: the frozen tuned set the adaptive column was measured with. */
  params: { adaptive: AdaptiveParams };
  /** Module 25 §4: percentile-bootstrap resamples, disclosed so the method is auditable. */
  bootstrapResamples: number;
  scenarioDurationS: number;
  scenarios: ScenarioResult[];
}

interface ControllerTotals {
  personDelayS: number;
  pax: number;
  delayS: number;
  exits: number;
  exited: number;
  denied: number;
  arrivals: number;
  conflicts: number;
  conserved: boolean;
}

function emptyTotals(): ControllerTotals {
  return {
    personDelayS: 0,
    pax: 0,
    delayS: 0,
    exits: 0,
    exited: 0,
    denied: 0,
    arrivals: 0,
    conflicts: 0,
    conserved: true,
  };
}

/** Runs one controller for `durationS` and returns its measured totals. */
function runController(
  kind: 'fixed' | 'adaptive',
  config: ReturnType<BenchmarkScenario['buildConfig']>,
  seed: number,
  durationS: number,
): { personDelay: number; totals: ControllerTotals } {
  const sim = new SimEngine({ ...config, seed, durationS });
  const kernel = new SafetyKernel();
  const controller = kind === 'fixed' ? new FixedTimeController() : new AdaptiveController();

  const totals = emptyTotals();
  const ticks = Math.floor(durationS / TIMING.SIM_DT_S);

  for (let t = 0; t < ticks; t++) {
    const obs = sim.observe();
    const action = controller.decide(obs);
    const signal = kernel.step(action, null, TIMING.SIM_DT_S);
    sim.step(signal);

    for (const ev of sim.drainEvents()) {
      if (ev.kind === 'vehicleExited') {
        totals.personDelayS += ev.delayS * ev.pax;
        totals.pax += ev.pax;
        totals.delayS += ev.delayS;
        totals.exits += 1;
      }
    }
  }

  totals.exited = sim.totalExited;
  totals.denied = sim.totalDenied;
  totals.arrivals = sim.totalArrivals;
  totals.conflicts = kernel.getMetrics().conflicts;

  let inSystem = 0;
  for (const lane of Object.values(sim.lanes)) {
    inSystem += lane.count + lane.entryBuffer.length;
  }
  totals.conserved = sim.totalArrivals === sim.totalExited + inSystem + sim.totalDenied;

  return {
    personDelay: totals.pax > 0 ? totals.personDelayS / totals.pax : 0,
    totals,
  };
}

export function runPairedScenario(
  scenario: BenchmarkScenario,
  seeds: number[],
  durationS = 1800,
): ScenarioResult {
  if (seeds.length === 0) throw new Error('runPairedScenario requires at least one seed');

  const fixedPersonDelays: number[] = [];
  const adaptivePersonDelays: number[] = [];
  const pairedDiffs: number[] = [];
  const relDiffs: number[] = [];

  const fixed = emptyTotals();
  const adaptive = emptyTotals();

  for (const seed of seeds) {
    const config = scenario.buildConfig(seed);

    const f = runController('fixed', config, seed, durationS);
    const a = runController('adaptive', config, seed, durationS);

    fixedPersonDelays.push(f.personDelay);
    adaptivePersonDelays.push(a.personDelay);

    const diff = f.personDelay - a.personDelay;
    pairedDiffs.push(diff);
    relDiffs.push(f.personDelay > 0 ? (diff / f.personDelay) * 100 : 0);

    accumulate(fixed, f.totals);
    accumulate(adaptive, a.totals);
  }

  const seed = seeds[0] ?? 42;
  // Module 25 §4: B = 10 000 seeded resamples — the helper default; committing
  // an explicit override here once silently narrowed the very uncertainty the
  // method exists to show.
  const bootstrapDiff = pairedBootstrapCi(pairedDiffs, seed);
  const bootstrapRel = pairedBootstrapCi(relDiffs, seed);
  const simSeconds = seeds.length * durationS;

  return {
    id: scenario.id,
    name: scenario.name,
    expectation: scenario.expectation,
    metrics: {
      personDelayS: {
        fixed: round(mean(fixedPersonDelays), 2),
        adaptive: round(mean(adaptivePersonDelays), 2),
        diff: round(bootstrapDiff.mean, 2),
        diffCI95: [round(bootstrapDiff.lo, 2), round(bootstrapDiff.hi, 2)],
        relPct: round(bootstrapRel.mean, 1),
        relCI95: [round(bootstrapRel.lo, 1), round(bootstrapRel.hi, 1)],
      },
      avgDelayS: {
        fixed: round(fixed.exits > 0 ? fixed.delayS / fixed.exits : 0, 2),
        adaptive: round(adaptive.exits > 0 ? adaptive.delayS / adaptive.exits : 0, 2),
      },
      throughputVph: {
        fixed: round((fixed.exited / simSeconds) * 3600, 0),
        adaptive: round((adaptive.exited / simSeconds) * 3600, 0),
      },
      exited: { fixed: fixed.exited, adaptive: adaptive.exited },
    },
    integrity: {
      deniedPct: pct(adaptive.denied, adaptive.arrivals),
      deniedPctFixed: pct(fixed.denied, fixed.arrivals),
      conservationOk: fixed.conserved && adaptive.conserved,
      kernelConflicts: fixed.conflicts + adaptive.conflicts,
    },
  };
}

function accumulate(into: ControllerTotals, from: ControllerTotals): void {
  into.personDelayS += from.personDelayS;
  into.pax += from.pax;
  into.delayS += from.delayS;
  into.exits += from.exits;
  into.exited += from.exited;
  into.denied += from.denied;
  into.arrivals += from.arrivals;
  into.conflicts += from.conflicts;
  into.conserved = into.conserved && from.conserved;
}

function pct(part: number, whole: number): number {
  return whole > 0 ? round((part / whole) * 100, 2) : 0;
}

function round(value: number, digits: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function runFullBenchmark(seeds = [1001, 1002, 1003, 1004, 1005]): FullBenchmarkResults {
  const scenarioResults: ScenarioResult[] = [];

  for (const scenario of SCENARIO_LIBRARY) {
    scenarioResults.push(runPairedScenario(scenario, seeds, 600));
  }

  return {
    schemaVersion: 2,
    commit: process.env.GIT_COMMIT ?? 'local-dev',
    createdAt: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: process.platform,
      cpu: os.cpus()[0]?.model ?? 'unknown',
    },
    seeds: {
      train: [1, 100],
      heldOut: [seeds[0] ?? 1001, seeds[seeds.length - 1] ?? 1001],
      all: [...seeds],
    },
    params: { adaptive: DEFAULT_ADAPTIVE_PARAMS },
    bootstrapResamples: 10_000,
    scenarioDurationS: 600,
    scenarios: scenarioResults,
  };
}
