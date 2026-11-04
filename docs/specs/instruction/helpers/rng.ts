/**
 * Deterministic RNG helpers for @urbanflow/core (Rule 07).
 * Pure: no Math.random, Date, or platform APIs. Basic arithmetic only, so results
 * are bit-identical across JS engines.
 */

/** mulberry32: 32-bit seeded PRNG. Returns a function yielding floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32-bit over a string's UTF-16 code units; used to derive stream seeds from names. */
function fnv1a32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Derive an independent named stream from a root seed.
 * Adding a new stream name never changes the numbers of existing streams.
 */
export function splitRng(rootSeed: number, streamName: string): () => number {
  const mixed = (Math.imul(rootSeed >>> 0, 0x9e3779b1) ^ fnv1a32(streamName)) >>> 0;
  return mulberry32(mixed);
}

/**
 * Deterministic natural logarithm for x > 0 using only + − × ÷ and exact scaling by 2.
 * Math.log may differ in the last bit between engines; this does not.
 * Accuracy: ~1e-15 relative over the supported domain.
 */
export function detLn(x: number): number {
  if (!(x > 0) || !Number.isFinite(x)) {
    throw new RangeError('detLn: x must be a finite number > 0');
  }
  const LN2 = 0.6931471805599453;
  // Scale x into [sqrt(1/2), sqrt(2)) by powers of two (exact operations).
  let m = x;
  let e = 0;
  while (m >= 1.4142135623730951) {
    m /= 2;
    e += 1;
  }
  while (m < 0.7071067811865476) {
    m *= 2;
    e -= 1;
  }
  // ln(m) = 2 * atanh(s), s = (m-1)/(m+1), |s| <= 0.1716
  const s = (m - 1) / (m + 1);
  const s2 = s * s;
  let term = s;
  let sum = 0;
  for (let k = 1; k <= 41; k += 2) {
    sum += term / k;
    term *= s2;
  }
  return 2 * sum + e * LN2;
}

/** Uniform integer in [lo, hi] inclusive. */
export function randInt(rng: () => number, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/** Exponential inter-arrival with the given rate (events per second), deterministic. */
export function expSample(rng: () => number, ratePerS: number): number {
  const u = 1 - rng(); // (0, 1]
  return -detLn(u) / ratePerS;
}
