/**
 * Module 21: Security & Cryptographic Verifications
 */
import { verifyHex, canonicalJson, withinWindow, SignedEvp } from '@urbanflow/core';

export async function hashIp(ip: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).slice(0, 16).join('');
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

export type EvpVerificationResult =
  | { ok: true }
  | { ok: false; reason: 'TIMESTAMP_SKEW' | 'BAD_SIGNATURE' };

export async function verifyEvpSignature(
  secret: string,
  body: SignedEvp,
  nowMs = Date.now(),
): Promise<EvpVerificationResult> {
  // 1. Timestamp skew check (30 seconds)
  if (!withinWindow(body.ts, nowMs, 30_000)) {
    return { ok: false, reason: 'TIMESTAMP_SKEW' };
  }

  // 2. Canonical JSON over exact EVP fields
  const messageObj: Record<string, unknown> = {};
  for (const f of EVP_FIELDS) {
    messageObj[f] = body[f];
  }

  const message = canonicalJson(messageObj as any);
  const valid = await verifyHex(secret, message, body.signature);

  if (!valid) {
    return { ok: false, reason: 'BAD_SIGNATURE' };
  }

  return { ok: true };
}
