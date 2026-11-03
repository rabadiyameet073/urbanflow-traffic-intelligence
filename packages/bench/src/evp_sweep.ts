/**
 * Module 03 & Module 25: Emergency Vehicle Preemption Detection-Distance Sweep
 *
 * Sweeps detection distances 150 m, 300 m and 500 m across paired seeds to test
 * whether late detection can be rescued by the controller.
 *
 * Design notes that matter for reading the numbers:
 *
 *  - The emergency vehicle is spawned at its *physical* detection distance via
 *    `SimEngine.spawnEmsAt`, so a 150 m run really starts 150 m from the stop
 *    line. The lane is lengthened to `distance + 60 m` so the vehicle fits.
 *    Lengthening the approach also adds storage, which is a real confound; the
 *    background demand is identical across points and `laneLengthM` is reported
 *    in every row so the confound is visible rather than hidden.
 *  - `planStatus` and `shortfallS` are read from the `EvpDirective` the EVP
 *    manager actually emits, not recomputed from `distance / speed`.
 *  - A seed that never produces a `boxExited` milestone is counted as
 *    unobserved and excluded from the mean. No fallback number is invented.
 */
import {
  SimEngine,
  FixedTimeController,
  AdaptiveController,
  SafetyKernel,
  EvpManager,
  DEFAULT_SIM_CONFIG,
  pairedBootstrapCi,
  TIMING,
} from '@urbanflow/core';

export interface EvpDelayStats {
  /** Mean EMS travel-and-wait delay in seconds over the observed seeds. */
  mean: number;
  ci95: [number, number];
  /** Seeds that contributed a measurement. */
  n: number;
  /** Seeds where the EMS never cleared the box inside the run window. */
  unobservedSeeds: number;
}

export interface EvpPairedDelta {
  /** Mean of per-seed differences `fixed - adaptive`; positive means Adaptive was quicker. */
  mean: number;
  ci95: [number, number];
  /** True when the 95% bootstrap interval excludes zero. */
  excludesZero: boolean;
  n: number;
}

export interface EvpSweepPoint {
  distanceM: number;
  /** Approach length used for this point (`distanceM + 60`, never below default). */
  laneLengthM: number;
  fixedEmsDelayS: EvpDelayStats;
  adaptiveEmsDelayS: EvpDelayStats;
  /** Paired per-seed comparison, which is the statistic Module 25 asks for. */
  deltaVsFixedS: EvpPairedDelta;
  /** Share of runs where the EVP manager classified the plan as TIGHT. */
  tightPlansPct: number;
  meanShortfallS: number;
  planStatusCounts: { OK: number; TIGHT: number };
  /** Derived from the measured plan statuses and paired CI, never hard-coded per distance. */
  verdict: string;
}

export interface EvpSweepResults {
  schemaVersion: 2;
  seeds: number[];
  warmupS: number;
  scenarioDurationS: number;
  distances: EvpSweepPoint[];
  modelNote: string;
  narrative: string;
}

const REQUIRED_APPROACH_MARGIN_M = 60;
/** Traffic is warmed up before the call arrives, so the EMS meets a real queue. */
const WARMUP_STEPS = 600;
/**
 * Measurement window. A 500 m approach at roughly 11 m/s consumes 45 s on its own,
 * so the window must be long enough for the slowest swept point to clear the box;
 * a short window silently reports "unobserved" for the case under test.
 */
const RUN_STEPS = 1800;

function round2(n: number): number {
  return parseFloat(n.toFixed(2));
}

function stats(values: number[], unobservedSeeds: number): EvpDelayStats {
  if (values.length === 0) {
    return { mean: 0, ci95: [0, 0], n: 0, unobservedSeeds };
  }
  const ci = pairedBootstrapCi(values, 42, 1000);
  return {
    mean: round2(ci.mean),
    ci95: [round2(ci.lo), round2(ci.hi)],
    n: values.length,
    unobservedSeeds,
  };
}

export function runEvpSweep(seeds = [42, 43, 44, 45, 46]): EvpSweepResults {
  const distances = [150, 300, 500];
  const points: EvpSweepPoint[] = [];

  for (const dist of distances) {
    const laneLengthM = Math.max(
      DEFAULT_SIM_CONFIG.laneLengthM,
      dist + REQUIRED_APPROACH_MARGIN_M,
    );
    const config = { laneLengthM };

    const fixedDelays: number[] = [];
    const adaptiveDelays: number[] = [];
    // Keyed by seed so the paired difference never compares mismatched runs.
    const fixedBySeed = new Map<number, number>();
    const adaptiveBySeed = new Map<number, number>();
    let fixedUnobserved = 0;
    let adaptiveUnobserved = 0;
    let planOkCount = 0;
    let planTightCount = 0;
    let totalShortfall = 0;

    for (const seed of seeds) {
      // 1. Fixed-time control, no preemption: the EMS queues like everyone else.
      const simFixed = new SimEngine({ ...config, seed });
      const kernelFixed = new SafetyKernel();
      const ctrlFixed = new FixedTimeController();

      for (let t = 0; t < WARMUP_STEPS; t++) {
        const signal = kernelFixed.step(ctrlFixed.decide(simFixed.observe()), null, TIMING.SIM_DT_S);
        simFixed.step(signal);
      }
      simFixed.drainEvents();

      simFixed.spawnEmsAt('NB-TR', dist);
      let fixedDelay: number | null = null;

      for (let t = 0; t < RUN_STEPS && fixedDelay === null; t++) {
        const signal = kernelFixed.step(ctrlFixed.decide(simFixed.observe()), null, TIMING.SIM_DT_S);
        simFixed.step(signal);

        for (const ev of simFixed.drainEvents()) {
          if (
            ev.kind === 'emsMilestone' &&
            ev.milestone === 'boxExited' &&
            ev.delayS !== undefined
          ) {
            fixedDelay = ev.delayS;
            break;
          }
        }
      }
      if (fixedDelay === null) fixedUnobserved++;
      else {
        fixedDelays.push(fixedDelay);
        fixedBySeed.set(seed, fixedDelay);
      }

      // 2. Adaptive control with EVP preemption over the same seed and geometry.
      const simAdaptive = new SimEngine({ ...config, seed });
      const kernelAdaptive = new SafetyKernel();
      const ctrlAdaptive = new AdaptiveController();
      const evpManager = new EvpManager();

      for (let t = 0; t < WARMUP_STEPS; t++) {
        const signal = kernelAdaptive.step(
          ctrlAdaptive.decide(simAdaptive.observe()),
          null,
          TIMING.SIM_DT_S,
        );
        simAdaptive.step(signal);
      }
      simAdaptive.drainEvents();

      simAdaptive.spawnEmsAt('NB-TR', dist);
      const dispatchedAtS = simAdaptive.simTimeS;
      let adaptiveDelay: number | null = null;

      const evpReq = {
        id: `evp-${dist}-${seed}`,
        lane: 'NB-TR' as const,
        distanceM: dist,
        speedMps: 15.0,
        tRequestS: dispatchedAtS,
        nonce: `nonce-${dist}-${seed}`,
        source: 'amb-unit-1',
      };
      evpManager.submitRequest(evpReq, dispatchedAtS);

      // Plan quality is whatever the manager reports while the request is live.
      let sawDirective = false;
      let directiveStatus: 'OK' | 'TIGHT' | null = null;
      let directiveShortfall = 0;

      for (let t = 0; t < RUN_STEPS && adaptiveDelay === null; t++) {
        const obs = simAdaptive.observe();
        const directive = evpManager.step(obs, TIMING.SIM_DT_S);
        const action = ctrlAdaptive.decide(obs);
        const signal = kernelAdaptive.step(action, directive, TIMING.SIM_DT_S);
        simAdaptive.step(signal);

        if (!sawDirective && directive !== null) {
          sawDirective = true;
          directiveStatus = directive.planStatus;
          directiveShortfall = directive.shortfallS;
        }

        for (const ev of simAdaptive.drainEvents()) {
          if (
            ev.kind === 'emsMilestone' &&
            ev.milestone === 'boxExited' &&
            ev.delayS !== undefined
          ) {
            adaptiveDelay = ev.delayS;
            break;
          }
        }
      }
      if (adaptiveDelay === null) adaptiveUnobserved++;
      else {
        adaptiveDelays.push(adaptiveDelay);
        adaptiveBySeed.set(seed, adaptiveDelay);
      }

      if (directiveStatus === 'OK') planOkCount++;
      else if (directiveStatus === 'TIGHT') {
        planTightCount++;
        totalShortfall += directiveShortfall;
      }
    }

    const plannedRuns = planOkCount + planTightCount;
    const tightPlansPct = plannedRuns === 0 ? 0 : (planTightCount / plannedRuns) * 100;
    const meanShortfallS = planTightCount === 0 ? 0 : totalShortfall / planTightCount;

    const fixedStats = stats(fixedDelays, fixedUnobserved);
    const adaptiveStats = stats(adaptiveDelays, adaptiveUnobserved);

    // Module 25: compare paired per-seed differences, not the ratio of two means.
    const pairedDiffs: number[] = [];
    for (const seed of seeds) {
      const f = fixedBySeed.get(seed);
      const a = adaptiveBySeed.get(seed);
      if (f !== undefined && a !== undefined) pairedDiffs.push(f - a);
    }
    let deltaStats: EvpPairedDelta;
    if (pairedDiffs.length === 0) {
      deltaStats = { mean: 0, ci95: [0, 0], excludesZero: false, n: 0 };
    } else {
      const ci = pairedBootstrapCi(pairedDiffs, 42, 1000);
      deltaStats = {
        mean: round2(ci.mean),
        ci95: [round2(ci.lo), round2(ci.hi)],
        excludesZero: ci.lo > 0 || ci.hi < 0,
        n: pairedDiffs.length,
      };
    }

    let verdict: string;
    if (planTightCount === plannedRuns && plannedRuns > 0) {
      verdict = `TIGHT: every run needs ${round2(meanShortfallS)} s more lead time than the clearance interval allows.`;
    } else if (planTightCount === 0 && plannedRuns > 0) {
      verdict = 'OK: every run is planned with lead time to spare.';
    } else {
      verdict = `MIXED: ${planTightCount}/${plannedRuns} runs are TIGHT.`;
    }
    if (deltaStats.n === 0) {
      verdict += ' Delay comparison unavailable: no measured EMS exit in this sweep point.';
    } else if (!deltaStats.excludesZero) {
      verdict += ` EMS delay difference ${deltaStats.mean} s is inside the noise floor (95% CI [${deltaStats.ci95[0]}, ${deltaStats.ci95[1]}] includes zero), so this point does not establish a winner.`;
    } else if (deltaStats.mean > 0) {
      verdict += ` EMS delay is ${deltaStats.mean} s lower under preemption (95% CI [${deltaStats.ci95[0]}, ${deltaStats.ci95[1]}], excludes zero).`;
    } else {
      verdict += ` EMS delay is ${Math.abs(deltaStats.mean)} s higher under preemption (95% CI [${deltaStats.ci95[0]}, ${deltaStats.ci95[1]}], excludes zero).`;
    }

    points.push({
      distanceM: dist,
      laneLengthM,
      fixedEmsDelayS: fixedStats,
      adaptiveEmsDelayS: adaptiveStats,
      deltaVsFixedS: deltaStats,
      tightPlansPct: round2(tightPlansPct),
      meanShortfallS: round2(meanShortfallS),
      planStatusCounts: { OK: planOkCount, TIGHT: planTightCount },
      verdict,
    });
  }

  const tightDistances = points.filter((p) => p.tightPlansPct > 0).map((p) => p.distanceM);
  const narrative =
    tightDistances.length === 0
      ? 'No swept detection distance produced a TIGHT plan: at 15 m/s every ETA clears the yellow + all-red + preclearance interval, so preemption could be planned before the emergency vehicle arrives.'
      : `Detection at ${tightDistances.join(', ')} m produced TIGHT plans. Yellow (3.5 s) and all-red (2.0 s) are fixed by Safety Kernel invariants I2 and I5, so the only recourse is to accept the shortfall and record it; the controller may not shorten clearance to buy the missing seconds. Longer detection distances produce OK plans because the ETA covers the full required lead time.`;

  return {
    schemaVersion: 2,
    seeds,
    warmupS: WARMUP_STEPS * TIMING.SIM_DT_S,
    scenarioDurationS: RUN_STEPS * TIMING.SIM_DT_S,
    distances: points,
    modelNote:
      'The emergency vehicle is spawned at its physical detection distance through SimEngine.spawnEmsAt, and the approach is lengthened to distance + 60 m so the vehicle fits. Lengthening the approach also adds storage; background demand is identical across points and laneLengthM is reported per row so that confound is auditable. Delay is measured from the emsMilestone/boxExited event; seeds with no observed exit are counted in unobservedSeeds and excluded from the mean rather than replaced with a placeholder.',
    narrative,
  };
}
