/**
 * Module 01 & Module 04: Digital-Twin What-If Verification Engine
 *
 * Clones the simulation state, fast-forwards 5 sim-minutes on identical arrival streams
 * under current parameters vs proposed parameters, evaluates person-delay, and enforces
 * Kernel dry-run safety verification before any AI proposal can be approved.
 */
import {
  SimEngine,
  AdaptiveController,
  SafetyKernel,
  AdaptiveParams,
  AdaptiveParamsSchema,
  DEFAULT_ADAPTIVE_PARAMS,
  TIMING,
  SimConfig,
} from '../index.js';

export interface WhatIfEvaluationResult {
  approved: boolean;
  reason: string;
  improvementPct: number;
  currentPersonDelayS: number;
  proposedPersonDelayS: number;
  kernelViolations: number;
}

export function evaluateProposalWhatIf(
  baseSim: SimEngine,
  currentParams: AdaptiveParams,
  proposedPartialParams: Partial<AdaptiveParams> & Record<string, unknown>,
  durationS = 300.0, // 5 simulated minutes
): WhatIfEvaluationResult {
  // 1. Zod bounds validation & Non-configurable check (Rule 08)
  // Check if non-configurable safety timing parameters were tampered with
  const forbiddenKeys = ['YELLOW_S', 'ALL_RED_S', 'G_MIN_S', 'G_MAX_S', 'MAX_RED_WAIT_S', 'conflicts'];
  for (const key of forbiddenKeys) {
    if (key in proposedPartialParams) {
      return {
        approved: false,
        reason: `Rejected by Safety Kernel: ${key} is a non-configurable safety parameter.`,
        improvementPct: 0,
        currentPersonDelayS: 0,
        proposedPersonDelayS: 0,
        kernelViolations: 1,
      };
    }
  }

  const mergedParams = { ...currentParams, ...proposedPartialParams };
  const parseResult = AdaptiveParamsSchema.safeParse(mergedParams);
  if (!parseResult.success) {
    return {
      approved: false,
      reason: `Out of bounds: ${parseResult.error.issues.map((i) => i.message).join(', ')}`,
      improvementPct: 0,
      currentPersonDelayS: 0,
      proposedPersonDelayS: 0,
      kernelViolations: 1,
    };
  }

  const validatedProposedParams = parseResult.data;

  // 2. Clone Simulator State for Digital-Twin Fast-Forward
  const currentConfig: SimConfig = { ...baseSim.config };
  const currentSeed = baseSim.config.seed;
  const currentSimTime = baseSim.simTimeS;

  // Run Twin A: Current Parameters
  const simCurrent = new SimEngine({ ...currentConfig, seed: currentSeed + 100 });
  const ctrlCurrent = new AdaptiveController(currentParams);
  const kernelCurrent = new SafetyKernel();

  // Run Twin B: Proposed Parameters (Identical Seed & Arrivals)
  const simProposed = new SimEngine({ ...currentConfig, seed: currentSeed + 100 });
  const ctrlProposed = new AdaptiveController(validatedProposedParams);
  const kernelProposed = new SafetyKernel();

  let currentPaxDelay = 0;
  let currentPax = 0;
  let proposedPaxDelay = 0;
  let proposedPax = 0;

  const ticks = Math.floor(durationS / TIMING.SIM_DT_S);

  for (let t = 0; t < ticks; t++) {
    // Current Twin Step
    const obsCur = simCurrent.observe();
    const actCur = ctrlCurrent.decide(obsCur);
    const sigCur = kernelCurrent.step(actCur, null, TIMING.SIM_DT_S);
    simCurrent.step(sigCur);

    for (const ev of simCurrent.drainEvents()) {
      if (ev.kind === 'vehicleExited') {
        currentPaxDelay += ev.delayS * ev.pax;
        currentPax += ev.pax;
      }
    }

    // Proposed Twin Step
    const obsProp = simProposed.observe();
    const actProp = ctrlProposed.decide(obsProp);
    const sigProp = kernelProposed.step(actProp, null, TIMING.SIM_DT_S);
    simProposed.step(sigProp);

    for (const ev of simProposed.drainEvents()) {
      if (ev.kind === 'vehicleExited') {
        proposedPaxDelay += ev.delayS * ev.pax;
        proposedPax += ev.pax;
      }
    }
  }

  const curDelay = currentPax > 0 ? currentPaxDelay / currentPax : 1.0;
  const propDelay = proposedPax > 0 ? proposedPaxDelay / proposedPax : 1.0;
  const improvementPct = ((curDelay - propDelay) / curDelay) * 100.0;

  // Total kernel violations prevented in dry run
  const totalViolations = Object.values(kernelProposed.violationsPrevented).reduce((a, b) => a + b, 0);

  // 3. Approval Rule: Improvement > 3% AND Zero Kernel Violations
  if (improvementPct > 3.0 && totalViolations === 0) {
    return {
      approved: true,
      reason: `Digital-twin verified: person-delay reduced by ${improvementPct.toFixed(1)}% with zero safety violations.`,
      improvementPct: parseFloat(improvementPct.toFixed(2)),
      currentPersonDelayS: parseFloat(curDelay.toFixed(2)),
      proposedPersonDelayS: parseFloat(propDelay.toFixed(2)),
      kernelViolations: 0,
    };
  }

  return {
    approved: false,
    reason: improvementPct <= 3.0
      ? `Insufficient improvement: proposed parameters yielded only ${improvementPct.toFixed(1)}% delta (minimum 3.0% required).`
      : `Rejected by Safety Kernel dry-run: detected ${totalViolations} invariant violations.`,
    improvementPct: parseFloat(improvementPct.toFixed(2)),
    currentPersonDelayS: parseFloat(curDelay.toFixed(2)),
    proposedPersonDelayS: parseFloat(propDelay.toFixed(2)),
    kernelViolations: totalViolations,
  };
}
