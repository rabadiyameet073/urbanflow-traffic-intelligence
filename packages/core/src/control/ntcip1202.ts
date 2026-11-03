/**
 * Module 01 & Module 06: NTCIP-1202-Inspired Standard Signal Object Mapping Layer
 *
 * Maps UrbanFlow 4-phase signal states and protected left kinematics to the
 * standardized NTCIP 1202 (Actuated Traffic Signal Controller Units) SNMP MIB objects:
 * - ascPhaseStatusGroupGreens (OID 1.3.6.1.4.1.1206.4.2.1.1.1)
 * - ascPhaseStatusGroupYellows (OID 1.3.6.1.4.1.1206.4.2.1.1.2)
 * - ascPhaseStatusGroupReds (OID 1.3.6.1.4.1.1206.4.2.1.1.3)
 */
import { SignalState, PhaseId, PHASES } from '../contracts.js';
import { simWallClockIso } from '../helpers/sim-clock.js';

export interface Ntcip1202PhaseStatus {
  /** 8-bit bitmask where bit 0 is Phase 1, bit 1 is Phase 2, etc. */
  ascPhaseStatusGroupGreens: number;
  ascPhaseStatusGroupYellows: number;
  ascPhaseStatusGroupReds: number;
  /** Active phase number (1..4) or null */
  activePhaseNumber: number | null;
  /** NTCIP cycle length seconds */
  cycleLengthSeconds: number;
  /** ISO timestamp of the simulated instant this status describes. */
  timestamp: string;
}

const PHASE_TO_NTCIP_NUMBER: Record<PhaseId, number> = {
  P1_NS_LEFT: 1,
  P2_NS_THRU: 2,
  P3_EW_LEFT: 3,
  P4_EW_THRU: 4,
};

/**
 * Converts internal SignalState to NTCIP-1202 standardized status group bitmasks.
 *
 * @param simTimeS Simulated instant the status describes. The field is a status
 *   report, so it must carry the time of the state it reports, not the time the
 *   function happened to run — otherwise two replays of one seed disagree.
 */
export function toNtcip1202Status(
  signal: SignalState,
  cycleLengthS = 90.0,
  simTimeS = 0,
): Ntcip1202PhaseStatus {
  let greens = 0;
  let yellows = 0;
  let reds = 0b00001111; // default all 4 phases red

  let activeNum: number | null = null;

  if (signal.phase !== null) {
    activeNum = PHASE_TO_NTCIP_NUMBER[signal.phase];
    const bit = 1 << (activeNum - 1);

    if (signal.indication === 'GREEN') {
      greens |= bit;
      reds &= ~bit;
    } else if (signal.indication === 'YELLOW') {
      yellows |= bit;
      reds &= ~bit;
    }
  }

  return {
    ascPhaseStatusGroupGreens: greens,
    ascPhaseStatusGroupYellows: yellows,
    ascPhaseStatusGroupReds: reds,
    activePhaseNumber: activeNum,
    cycleLengthSeconds: cycleLengthS,
    timestamp: simWallClockIso(simTimeS),
  };
}
