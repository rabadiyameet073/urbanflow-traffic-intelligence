/**
 * Numbers quoted in Judge Mode captions, copied from the benchmark output.
 *
 * Provenance: `packages/bench/out/ems-sweep.json` (schemaVersion 2, seeds
 * 42–46), the 150 m detection point. This file is a *copy*, not a re-derivation:
 * the fitness gate (`scripts/fitness.mjs` §deps) forbids `packages/web` from
 * importing `@urbanflow/bench`, so the measured value crosses the boundary as a
 * committed asset with its source named here. When the sweep is regenerated,
 * update this file in the same commit, or the caption goes stale — and a stale
 * number read to a judge is a lie (Rule 00).
 */
export const EMS_SWEEP_150M = {
  /** Mean EMS delay, adaptive controller, detection at 150 m (s). */
  adaptiveEmsDelayMeanS: 13.43,
  /** 95 % confidence interval around the mean (s). */
  adaptiveEmsDelayCi95: [4.34, 22.52] as [number, number],
  /** Share of sweep runs whose clearance plan was classified TIGHT (%). */
  tightPlansPct: 100,
  /** Mean ETA shortfall against the required lead time (s). */
  meanShortfallS: 9.5,
} as const;

/** `'~13 s'`-style rounded mean, single source of truth for the caption. */
export const emsClearanceCaption: string =
  `Preemption needs ~${Math.round(EMS_SWEEP_150M.adaptiveEmsDelayMeanS)} s to clear safely.`;
