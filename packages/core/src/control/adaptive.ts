/**
 * Module 03: Switching-Cost-Aware Adaptive Controller
 * Calculates multilane dynamic pressure, respects G_MIN_EFFICIENT_S hold,
 * executes gap-out and ratio-floor switching, skips empty phases.
 */
import {
  Controller,
  ControlAction,
  Observation,
  PhaseId,
  PHASES,
  AdaptiveParams,
  DEFAULT_ADAPTIVE_PARAMS,
  DEFAULT_SIM_CONFIG,
  TIMING,
} from '../contracts.js';
import { phasePressures, phaseVehicleCount } from './pressure.js';

export class AdaptiveController implements Controller {
  public readonly id = 'adaptive';
  public params: AdaptiveParams;

  /** Approach storage length used to normalise queue-spillback pressure. */
  private readonly laneLengthM: number;

  private emptyElapsedS: number = 0;
  private lastReplanTimeS: number = -1;
  private cachedPressures: Record<PhaseId, number>;

  constructor(
    params: Partial<AdaptiveParams> = {},
    laneLengthM: number = DEFAULT_SIM_CONFIG.laneLengthM,
  ) {
    this.params = { ...DEFAULT_ADAPTIVE_PARAMS, ...params };
    this.laneLengthM = laneLengthM > 0 ? laneLengthM : DEFAULT_SIM_CONFIG.laneLengthM;
    this.cachedPressures = {
      P1_NS_LEFT: 0,
      P2_NS_THRU: 0,
      P3_EW_LEFT: 0,
      P4_EW_THRU: 0,
    };
  }

  public reset(): void {
    this.emptyElapsedS = 0;
    this.lastReplanTimeS = -1;
    this.cachedPressures = {
      P1_NS_LEFT: 0,
      P2_NS_THRU: 0,
      P3_EW_LEFT: 0,
      P4_EW_THRU: 0,
    };
  }

  /** Module 02 §1.5 pressure for every phase (delegated to the shared formula). */
  public calculatePressures(obs: Observation): Record<PhaseId, number> {
    return phasePressures(obs, this.params, this.laneLengthM);
  }

  public decide(obs: Observation): ControlAction {
    const signal = obs.signal;
    const currentPhase = signal.phase;
    const phaseTime = signal.timeInStateS;

    // 1. If currently in transition or no green phase, continue
    if (signal.indication !== 'GREEN' || currentPhase === null) {
      return {
        requestedPhase: currentPhase,
        reason: 'TRANSITION_HOLD',
      };
    }

    // 2. Safety hold: phaseTime < G_MIN_S (7s)
    if (phaseTime < TIMING.G_MIN_S) {
      return {
        requestedPhase: currentPhase,
        reason: 'HOLD_SAFETY',
      };
    }

    // 3. Compute pressures (on 10s planning cadence or events)
    const isPlanningBoundary =
      this.lastReplanTimeS < 0 || obs.simTimeS - this.lastReplanTimeS >= TIMING.PLANNING_WINDOW_S;

    if (isPlanningBoundary) {
      this.cachedPressures = this.calculatePressures(obs);
      this.lastReplanTimeS = obs.simTimeS;
    }

    const pressures = this.cachedPressures;
    const curPressure = pressures[currentPhase] ?? 0;

    // 4. Find candidate phase with highest pressure (excluding current) that has demand
    let bestPhase: PhaseId | null = null;
    let maxPressure = -1;

    for (const phase of PHASES) {
      if (phase !== currentPhase) {
        const p = pressures[phase] ?? 0;
        const count = phaseVehicleCount(obs, phase);
        if (count > 0 && p > maxPressure) {
          maxPressure = p;
          bestPhase = phase;
        }
      }
    }

    // 5. Track gap-out (current phase empty)
    const currentCount = phaseVehicleCount(obs, currentPhase);

    if (currentCount === 0) {
      this.emptyElapsedS += TIMING.SIM_DT_S;
    } else {
      this.emptyElapsedS = 0;
    }

    // If no other phase has demand, rest on current phase (no needless cycling)
    if (bestPhase === null) {
      return {
        requestedPhase: currentPhase,
        reason: 'REST_NO_COMPETING_DEMAND',
        pressures,
      };
    }

    // 6. Max Green Rule: phaseTime >= G_MAX_S (65s)
    if (phaseTime >= TIMING.G_MAX_S) {
      return {
        requestedPhase: bestPhase,
        reason: 'MAX_GREEN',
        pressures,
      };
    }

    // 7. Efficiency Hold: phaseTime < G_MIN_EFFICIENT_S (25s) guard against thrashing
    if (phaseTime < this.params.G_MIN_EFFICIENT_S) {
      return {
        requestedPhase: currentPhase,
        reason: 'HOLD_EFFICIENCY',
        pressures,
      };
    }

    // 8. Gap-out Rule: current phase empty >= GAP_S and competing demand exists
    if (this.emptyElapsedS >= this.params.GAP_S) {
      return {
        requestedPhase: bestPhase,
        reason: 'GAP_OUT',
        pressures,
      };
    }

    // 9. Switching-cost Ratio & Floor Rule: best > RATIO * cur + FLOOR
    const threshold = this.params.RATIO * curPressure + this.params.FLOOR;
    if (maxPressure > threshold) {
      return {
        requestedPhase: bestPhase,
        reason: 'RATIO',
        pressures,
      };
    }

    // 10. Default hold
    return {
      requestedPhase: currentPhase,
      reason: 'HOLD_NORMAL',
      pressures,
    };
  }
}

