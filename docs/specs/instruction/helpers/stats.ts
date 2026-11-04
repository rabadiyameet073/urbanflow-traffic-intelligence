/**
 * Seeded paired-bootstrap confidence intervals for benchmark reporting (module 25).
 * Inputs are per-seed paired differences (e.g. adaptive − fixed person-delay).
 */
import { mulberry32 } from './rng.js';

export interface BootstrapResult {
  n: number;
  mean: number;
  median: number;
  lo: number;
  hi: number;
  resamples: number;
  confidence: number;
}

function quantileSorted(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) throw new RangeError('quantile of empty array');
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const a = sorted[base] as number;
  const b = sorted[Math.min(base + 1, sorted.length - 1)] as number;
  return a + rest * (b - a);
}

export function mean(xs: readonly number[]): number {
  if (xs.length === 0) throw new RangeError('mean of empty array');
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

export function median(xs: readonly number[]): number {
  return quantileSorted([...xs].sort((a, b) => a - b), 0.5);
}

/** Percentile bootstrap on the mean of paired differences. Deterministic for a given seed. */
export function pairedBootstrapCi(
  diffs: readonly number[],
  seed: number,
  resamples = 10000,
  confidence = 0.95,
): BootstrapResult {
  if (diffs.length === 0) throw new RangeError('pairedBootstrapCi: no data');
  if (!diffs.every(Number.isFinite)) throw new RangeError('pairedBootstrapCi: non-finite value');
  const rng = mulberry32(seed);
  const n = diffs.length;
  const means = new Array<number>(resamples);
  for (let r = 0; r < resamples; r++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += diffs[Math.floor(rng() * n)] as number;
    means[r] = s / n;
  }
  means.sort((a, b) => a - b);
  const alpha = (1 - confidence) / 2;
  return {
    n,
    mean: mean(diffs),
    median: median(diffs),
    lo: quantileSorted(means, alpha),
    hi: quantileSorted(means, 1 - alpha),
    resamples,
    confidence,
  };
}

/** True when the whole CI is on one side of zero. */
export function excludesZero(r: Pick<BootstrapResult, 'lo' | 'hi'>): boolean {
  return r.lo > 0 || r.hi < 0;
}
