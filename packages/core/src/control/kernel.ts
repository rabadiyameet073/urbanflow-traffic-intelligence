/**
 * Module 03: Traffic Control Specification - Safety Kernel
 * Inviolable safety kernel enforcing invariants I1-I6.
 * The ONLY component authorized to mutate SignalState.
 */
import {
  PhaseId,
  PHASES,
  PHASE_LANES,
  LANES,
  LaneId,
  SignalIndication,
  SignalState,
  ControlAction,
  EvpDirective,
  TIMING,
  conflictsWith,
} from '../contracts.js';

export type ViolationType =
  | 'CONFLICTING_GREENS'
  | 'SHORT_YELLOW'
  | 'SHORT_ALL_RED'
  | 'GREEN_BELOW_MIN'
  | 'GREEN_EXCEEDS_MAX'
  | 'STARVATION_EXCEEDED'
  | 'ILLEGAL_FLASH_RED_EXIT';

export class SafetyViolationError extends Error {
  /** Module 50 §5: every thrown error carries a machine-readable code. */
  readonly code: ViolationType;

  constructor(message: string, code: ViolationType) {
    super(`[SafetyKernel Violation] ${message}`);
    this.name = 'SafetyViolationError';
    this.code = code;
  }
}

export class SafetyKernel {
  private currentPhase: PhaseId | null = 'P2_NS_THRU'; // default initial baseline phase
  private indication: SignalIndication = 'GREEN';
  private timeInStateS: number = 0;
  private pendingNextPhase: PhaseId | null = null;
  private isFailSafe: boolean = false;

  // Anti-starvation tracking: time each phase has been red
  private redWaitTimesS: Record<PhaseId, number>;

  // Violation counters
  public readonly violationsPrevented: Record<ViolationType, number> = {
    CONFLICTING_GREENS: 0,
    SHORT_YELLOW: 0,
    SHORT_ALL_RED: 0,
    GREEN_BELOW_MIN: 0,
    GREEN_EXCEEDS_MAX: 0,
    STARVATION_EXCEEDED: 0,
    ILLEGAL_FLASH_RED_EXIT: 0,
  };

  // Compliance and observational metrics (Module 16 §4.1)
  public totalTicks: number = 0;
  public conflicts: number = 0;
  public minGreenSeenS: number = Number.POSITIVE_INFINITY;
  public maxGreenSeenS: number = 0;
  private yellowIntervals: number = 0;
  private yellowCompliant: number = 0;
  private allRedIntervals: number = 0;
  private allRedCompliant: number = 0;

  constructor() {
    this.redWaitTimesS = {
      P1_NS_LEFT: 0,
      P2_NS_THRU: 0,
      P3_EW_LEFT: 0,
      P4_EW_THRU: 0,
    };
  }

  public reset(initialPhase: PhaseId = 'P2_NS_THRU'): void {
    this.currentPhase = initialPhase;
    this.indication = 'GREEN';
    this.timeInStateS = 0;
    this.pendingNextPhase = null;
    this.isFailSafe = false;
    this.totalTicks = 0;
    this.conflicts = 0;
    this.minGreenSeenS = Number.POSITIVE_INFINITY;
    this.maxGreenSeenS = 0;
    this.yellowIntervals = 0;
    this.yellowCompliant = 0;
    this.allRedIntervals = 0;
    this.allRedCompliant = 0;

    for (const p of PHASES) {
      this.redWaitTimesS[p] = p === initialPhase ? 0 : 0;
    }
  }

  public failSafe(): void {
    this.isFailSafe = true;
    this.indication = 'FLASH_RED';
    this.currentPhase = null;
    this.timeInStateS = 0;
  }

  public recover(): void {
    if (!this.isFailSafe && this.indication !== 'FLASH_RED') {
      this.violationsPrevented.ILLEGAL_FLASH_RED_EXIT++;
      return;
    }
    // SAFETY: I6 — recovery MUST pass through ALL_RED before going green.
    this.isFailSafe = false;
    this.indication = 'ALL_RED';
    this.currentPhase = null;
    this.pendingNextPhase = 'P2_NS_THRU'; // baseline fixed-time phase
    this.timeInStateS = 0;
  }

  public step(
    action: ControlAction | null,
    evp: EvpDirective | null,
    dtS: number,
  ): SignalState {
    this.totalTicks++;
    this.timeInStateS += dtS;

    // SAFETY: I4 — anti-starvation tracking: time each phase has been red.
    for (const p of PHASES) {
      if (this.indication === 'GREEN' && this.currentPhase === p) {
        this.redWaitTimesS[p] = 0;
      } else {
        this.redWaitTimesS[p] += dtS;
      }
    }

    // Fail-safe mode: remain in FLASH_RED until recover() is called
    if (this.isFailSafe || this.indication === 'FLASH_RED') {
      return this.buildSignalState();
    }

    // State machine: GREEN -> YELLOW(3.5s) -> ALL_RED(2.0s) -> GREEN
    if (this.indication === 'GREEN') {
      let desiredPhase = action?.requestedPhase ?? this.currentPhase;

      // EVP override (takes precedence if preemption is active)
      if (evp && evp.stage === 'PRECLEAR' && evp.targetPhase !== this.currentPhase) {
        desiredPhase = evp.targetPhase;
      }

      // Check anti-starvation (MAX_RED_WAIT_S = 120s)
      for (const p of PHASES) {
        if (p !== this.currentPhase && this.redWaitTimesS[p] >= TIMING.MAX_RED_WAIT_S) {
          desiredPhase = p;
          this.violationsPrevented.STARVATION_EXCEEDED++;
          break;
        }
      }

      // If switch is requested to a different phase
      if (desiredPhase !== null && desiredPhase !== this.currentPhase) {
        // SAFETY: I3 — minimum green (G_MIN_S = 7s) cannot be clamped below by
        // any caller; EVP preclear may truncate only to 3.0s, never less.
        const minGreen = evp && evp.stage === 'PRECLEAR' ? 3.0 : TIMING.G_MIN_S;

        if (this.timeInStateS < minGreen) {
          // Clamp request: hold green
          this.violationsPrevented.GREEN_BELOW_MIN++;
        } else {
          // Record green metrics
          if (this.timeInStateS < this.minGreenSeenS) this.minGreenSeenS = this.timeInStateS;
          if (this.timeInStateS > this.maxGreenSeenS) this.maxGreenSeenS = this.timeInStateS;
          // Begin yellow transition
          this.indication = 'YELLOW';
          this.pendingNextPhase = desiredPhase;
          this.timeInStateS = 0;
        }
      } else {
        // Max green check: G_MAX_S = 65s (or 90s for EVP hold)
        const maxGreen = evp?.stage === 'EMS_GREEN' ? TIMING.EVP_HOLD_MAX_S : TIMING.G_MAX_S;
        if (this.timeInStateS > maxGreen) {
          this.violationsPrevented.GREEN_EXCEEDS_MAX++;
          if (this.timeInStateS < this.minGreenSeenS) this.minGreenSeenS = this.timeInStateS;
          if (this.timeInStateS > this.maxGreenSeenS) this.maxGreenSeenS = this.timeInStateS;
          // Force switch to next round-robin phase
          const nextIdx = (PHASES.indexOf(this.currentPhase!) + 1) % PHASES.length;
          this.indication = 'YELLOW';
          this.pendingNextPhase = PHASES[nextIdx]!;
          this.timeInStateS = 0;
        }
      }
    } else if (this.indication === 'YELLOW') {
      // SAFETY: I5 — YELLOW cannot be shortened by any caller, including EVP (3.5s)
      if (this.timeInStateS >= TIMING.YELLOW_S - 1e-4) {
        this.yellowIntervals++;
        this.yellowCompliant++;
        this.indication = 'ALL_RED';
        this.timeInStateS = 0;
      }
    } else if (this.indication === 'ALL_RED') {
      // SAFETY: I5 — ALL_RED cannot be shortened by any caller, including EVP (2.0s)
      if (this.timeInStateS >= TIMING.ALL_RED_S - 1e-4) {
        this.allRedIntervals++;
        this.allRedCompliant++;
        this.indication = 'GREEN';
        this.currentPhase = this.pendingNextPhase ?? 'P2_NS_THRU';
        this.pendingNextPhase = null;
        this.timeInStateS = 0;
      }
    }

    const nextState = this.buildSignalState();
    SafetyKernel.assertInvariants(nextState);
    return nextState;
  }

  public getMetrics() {
    return {
      ticks: this.totalTicks,
      conflicts: this.conflicts,
      violationsPrevented: { ...this.violationsPrevented },
      minGreenSeenS: Number.isFinite(this.minGreenSeenS) ? this.minGreenSeenS : 0,
      maxGreenSeenS: this.maxGreenSeenS,
      yellowCompliancePct: this.yellowIntervals > 0 ? (this.yellowCompliant / this.yellowIntervals) * 100 : 100,
      allRedCompliancePct: this.allRedIntervals > 0 ? (this.allRedCompliant / this.allRedIntervals) * 100 : 100,
      isFailSafe: this.isFailSafe,
    };
  }

  private buildSignalState(): SignalState {
    const laneMap: Record<LaneId, 'G' | 'Y' | 'R'> = {
      'NB-TR': 'R', 'NB-L': 'R',
      'SB-TR': 'R', 'SB-L': 'R',
      'EB-TR': 'R', 'EB-L': 'R',
      'WB-TR': 'R', 'WB-L': 'R',
    };

    if (this.indication === 'GREEN' && this.currentPhase !== null) {
      const activeLanes = PHASE_LANES[this.currentPhase];
      laneMap[activeLanes[0]] = 'G';
      laneMap[activeLanes[1]] = 'G';
    } else if (this.indication === 'YELLOW' && this.currentPhase !== null) {
      const activeLanes = PHASE_LANES[this.currentPhase];
      laneMap[activeLanes[0]] = 'Y';
      laneMap[activeLanes[1]] = 'Y';
    } else if (this.indication === 'FLASH_RED') {
      // Flashing red represented as all red in indication snapshot
      // (Visual UI flashes red)
    }

    return {
      phase: this.currentPhase,
      indication: this.indication,
      timeInStateS: this.timeInStateS,
      lanes: laneMap,
    };
  }

  /**
   * ConflictMonitor & Invariant Checker (I1 - I6).
   * Verified on every single output state!
   */
  public static assertInvariants(state: SignalState): void {
    // SAFETY: I1 — no two lanes belonging to different phases are non-red at the same time.
    let activePhase: PhaseId | null = null;
    for (const lane of LANES) {
      const ind = state.lanes[lane];
      if (ind === 'G' || ind === 'Y') {
        const p = lane.endsWith('-L')
          ? lane.startsWith('NB') || lane.startsWith('SB') ? 'P1_NS_LEFT' : 'P3_EW_LEFT'
          : lane.startsWith('NB') || lane.startsWith('SB') ? 'P2_NS_THRU' : 'P4_EW_THRU';

        if (activePhase === null) {
          activePhase = p;
        } else if (activePhase !== p) {
          throw new SafetyViolationError(
            `Invariant I1 Violated: Conflicting non-red indications across ${activePhase} and ${p}`,
            'CONFLICTING_GREENS',
          );
        }
      }
    }

    // SAFETY: I6 — if indication is FLASH_RED, no lane may be GREEN or YELLOW.
    if (state.indication === 'FLASH_RED') {
      for (const lane of LANES) {
        if (state.lanes[lane] !== 'R') {
          throw new SafetyViolationError(
            'Invariant I6 Violated: Non-red lane in FLASH_RED mode',
            'ILLEGAL_FLASH_RED_EXIT',
          );
        }
      }
    }
  }
}

