/**
 * Module 21 §4: Security & Cryptographic Verifications
 *
 * Check order is fixed and cheap→expensive (never leak more than the reason
 * code): size → schema → timestamp window → rate limit → HMAC → nonce →
 * plausibility → relay.
 */
import {
  verifyHex,
  canonicalJson,
  withinWindow,
  LANES,
  type LaneId,
  type SignedEvp,
} from '@urbanflow/core';

/** Daily-salted, truncated SHA-256 of the client address (Module 14). */
export async function hashIp(ip: string, salt = ''): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${ip}`));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

/**
 * Full SHA-256 of a body, hex encoded — the idempotency key for the replay
 * store (Module 22 §7). Truncation would make a collision two different runs
 * pretending to be one, so this one is never truncated.
 */
export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

export const EVP_FIELDS = [
  'id',
  'lane',
  'distanceM',
  'speedMps',
  'tRequestS',
  'nonce',
  'source',
  'ts',
] as const;

export type EvpVerificationFailure = 'TIMESTAMP_SKEW' | 'BAD_SIGNATURE';

export type EvpVerificationResult =
  | { ok: true }
  | { ok: false; reason: EvpVerificationFailure };

export async function verifyEvpSignature(
  secret: string,
  body: SignedEvp,
  nowMs = Date.now(),
): Promise<EvpVerificationResult> {
  // 1. Timestamp skew window — 30 s either side (Module 21 §4).
  if (!withinWindow(body.ts, nowMs, 30_000)) {
    return { ok: false, reason: 'TIMESTAMP_SKEW' };
  }

  // 2. Canonical JSON over the exact signed field set, then constant-time verify.
  const messageObj: Record<string, unknown> = {};
  for (const f of EVP_FIELDS) {
    messageObj[f] = body[f];
  }

  const valid = await verifyHex(secret, canonicalJson(messageObj as never), body.signature);
  return valid ? { ok: true } : { ok: false, reason: 'BAD_SIGNATURE' };
}

/** `UNKNOWN_LANE` (422) rather than a generic schema failure. */
export function isKnownLane(value: unknown): value is LaneId {
  return typeof value === 'string' && (LANES as readonly string[]).includes(value);
}

export type PlausibilityFailure = 'IMPLAUSIBLE_SPEED' | 'IMPLAUSIBLE_DISTANCE';

/**
 * Semantic plausibility (Module 22 §2.1 `422`). Schema bounds are already
 * enforced by zod; these checks reject values that are individually legal but
 * jointly impossible for an emergency vehicle approaching an intersection.
 */
export function checkPlausibility(body: SignedEvp): PlausibilityFailure | null {
  // A responding ambulance never exceeds ~144 km/h in an urban approach.
  if (body.speedMps > 40) return 'IMPLAUSIBLE_SPEED';

  // ETA to the stop line must be sane: > 0 s and <= 120 s.
  if (body.speedMps <= 0) return 'IMPLAUSIBLE_SPEED';
  const etaS = body.distanceM / body.speedMps;
  if (!Number.isFinite(etaS) || etaS <= 0 || etaS > 120) return 'IMPLAUSIBLE_DISTANCE';

  return null;
}
