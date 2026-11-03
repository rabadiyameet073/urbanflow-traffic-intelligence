/**
 * Module 02 §1.5: Dynamic Pressure Formula (single source of truth)
 *
 * Pressure(lane)  = alpha * N + beta * sum(W_v * wait_v) / 10 + gamma * 10 * queueLengthM / laneLengthM
 * Pressure(phase) = sum of Pressure(lane) over the phase's lanes
 *
 * `Observation.sumWeightedWaitS` already carries `sum(W_v * wait_v)`, so the
 * formula is evaluated once here and reused by the adaptive controller, the
 * what-if twin, the benchmark runner and the pipeline exporter. Duplicating the
 * arithmetic anywhere else is a contract violation (Rule 12).
 */
import {
  AdaptiveParams,
  LaneObservation,
  Observation,
  PHASE_LANES,
  PHASES,
  PhaseId,
} from '../contracts.js';

/** The three tunable weights that define pressure. All other params are switching rules. */
export type PressureWeights = Pick<AdaptiveParams, 'alpha' | 'beta' | 'gamma'>;

export const DEFAULT_PRESSURE_WEIGHTS: PressureWeights = { alpha: 1.0, beta: 1.0, gamma: 1.0 };

/**
 * Pressure contributed by a single approach lane.
 *
 * @param lane       Observed lane state; a missing or invalid lane contributes 0.
 * @param weights    alpha (count), beta (weighted wait), gamma (spillback) weights.
 * @param laneLengthM Approach storage length in metres; used to normalise queue spillback.
 */
export function lanePressure(
  lane: LaneObservation | undefined,
  weights: PressureWeights,
  laneLengthM: number,
): number {
  if (!lane || !lane.valid || laneLengthM <= 0) return 0;

  const countTerm = weights.alpha * lane.vehicleCount;
  const waitTerm = weights.beta * (lane.sumWeightedWaitS / 10.0);
  const spillbackTerm = weights.gamma * ((10.0 * lane.queueLengthM) / laneLengthM);

  const pressure = countTerm + waitTerm + spillbackTerm;
  return pressure > 0 ? pressure : 0;
}

/**
 * Pressure for every phase, derived from the lanes each phase serves.
 *
 * @param obs         Full intersection observation.
 * @param weights     Pressure weights (alpha, beta, gamma).
 * @param laneLengthM Approach storage length in metres (from `SimConfig.laneLengthM`).
 */
export function phasePressures(
  obs: Observation,
  weights: PressureWeights,
  laneLengthM: number,
): Record<PhaseId, number> {
  const pressures: Record<PhaseId, number> = {
    P1_NS_LEFT: 0,
    P2_NS_THRU: 0,
    P3_EW_LEFT: 0,
    P4_EW_THRU: 0,
  };

  for (const phase of PHASES) {
    const [laneA, laneB] = PHASE_LANES[phase];
    pressures[phase] =
      lanePressure(obs.lanes[laneA], weights, laneLengthM) +
      lanePressure(obs.lanes[laneB], weights, laneLengthM);
  }

  return pressures;
}

/** Total demand in a phase, used to break ties between equally pressured phases. */
export function phaseVehicleCount(obs: Observation, phase: PhaseId): number {
  const [laneA, laneB] = PHASE_LANES[phase];
  return (obs.lanes[laneA]?.vehicleCount ?? 0) + (obs.lanes[laneB]?.vehicleCount ?? 0);
}
