/**
 * Module 03: Fixed-Time Baseline Controller
 * Strict 90-second cycle: P1 (10s) -> P2 (24s) -> P3 (10s) -> P4 (24s) + transitions.
 * Emits requests only.
 */
import {
  Controller,
  ControlAction,
  Observation,
  PhaseId,
  TIMING,
} from '../contracts.js';

interface FixedPhaseConfig {
  phase: PhaseId;
  greenDurationS: number;
}

const FIXED_SCHEDULE: readonly FixedPhaseConfig[] = [
  { phase: 'P1_NS_LEFT', greenDurationS: TIMING.FIXED_LEFT_GREEN_S }, // 10 s
  { phase: 'P2_NS_THRU', greenDurationS: TIMING.FIXED_THRU_GREEN_S }, // 24 s
  { phase: 'P3_EW_LEFT', greenDurationS: TIMING.FIXED_LEFT_GREEN_S }, // 10 s
  { phase: 'P4_EW_THRU', greenDurationS: TIMING.FIXED_THRU_GREEN_S }, // 24 s
];

export class FixedTimeController implements Controller {
  public readonly id = 'fixed-90s';
  private phaseIndex: number = 0;
  private currentGreenElapsedS: number = 0;

  public reset(): void {
    this.phaseIndex = 0;
    this.currentGreenElapsedS = 0;
  }

  public decide(obs: Observation): ControlAction {
    const currentConfig = FIXED_SCHEDULE[this.phaseIndex]!;
    const signal = obs.signal;

    // Track green time only when current phase is green
    if (signal.indication === 'GREEN' && signal.phase === currentConfig.phase) {
      this.currentGreenElapsedS = signal.timeInStateS;
    } else {
      this.currentGreenElapsedS = 0;
    }

    // When green elapsed exceeds scheduled duration, request switch to next phase
    if (this.currentGreenElapsedS >= currentConfig.greenDurationS) {
      const nextIndex = (this.phaseIndex + 1) % FIXED_SCHEDULE.length;
      const nextConfig = FIXED_SCHEDULE[nextIndex]!;

      // Advance index once signal changes or transition occurs
      if (signal.indication !== 'GREEN') {
        this.phaseIndex = nextIndex;
      }

      return {
        requestedPhase: nextConfig.phase,
        reason: 'FIXED_CYCLE_EXPIRED',
      };
    }

    // Continue current scheduled phase
    return {
      requestedPhase: currentConfig.phase,
      reason: 'FIXED_CYCLE_HOLD',
    };
  }
}

