/**
 * Module 16 §2 / ADR-001: the one place a wall-clock string is derived from
 * simulated time.
 *
 * `packages/core` may not read the real clock (Rule 07, Module 10 §3). Yet three
 * contracts — the EVP decision record, the NTCIP-1202 status group and the debug
 * bundle — each carry an ISO-8601 field, and each must produce the *same* string
 * for the same simulated instant on every replay, in Node and in the browser.
 *
 * So the origin is a fixed constant and only offsets from it are meaningful. A
 * caller that genuinely needs the human's wall clock (the moment they clicked
 * "Copy debug info") passes it in from the IO shell, which is allowed to read it.
 */

/**
 * Fixed wall-clock origin for a simulated run: 2024-10-31T14:00:00.000Z.
 *
 * Any value would do; this one is immutable so replays never drift. Real-world
 * timestamps are deliberately *not* recoverable from a simulated time.
 */
export const SIM_EPOCH_MS = 1730383200000;

/**
 * Render a simulated instant as ISO-8601 UTC.
 *
 * @param simTimeS Simulated seconds since the run started. Fractional seconds
 *   are preserved to the millisecond.
 */
export function simWallClockIso(simTimeS: number): string {
  const safeS = Number.isFinite(simTimeS) ? simTimeS : 0;
  return new Date(SIM_EPOCH_MS + Math.round(safeS * 1000)).toISOString(); // AUDIT-OK(A1): formats simulated epoch offset only; reads no wall clock
}

/**
 * Milliseconds since the simulated epoch — the `number` form of
 * {@link simWallClockIso} for callers that need arithmetic, not a string.
 */
export function simWallClockMs(simTimeS: number): number {
  const safeS = Number.isFinite(simTimeS) ? simTimeS : 0;
  return SIM_EPOCH_MS + Math.round(safeS * 1000);
}
