/**
 * Module 11 (ADR-019) & Module 14: Fuzz-Safe Share Link State Codec
 *
 * Encodes and decodes deterministic simulation replay states into URL hash strings.
 * Guarantees zero crashes on corrupted, hostile, or oversized payloads (fuzz-safe).
 */
import { z } from 'zod';

export const ShareStateSchema = z.object({
  scenarioId: z.string().default('morning_commute'),
  seed: z.number().int().default(42),
  overrides: z.record(z.any()).default({}),
  detectionDistance: z.number().default(300),
  inputLog: z.array(z.object({
    t: z.number(),
    action: z.string(),
    payload: z.any().optional(),
  })).default([]),
});

export type ShareState = z.infer<typeof ShareStateSchema>;

export const DEFAULT_SHARE_STATE: ShareState = {
  scenarioId: 'morning_commute',
  seed: 42,
  overrides: {},
  detectionDistance: 300,
  inputLog: [],
};

/**
 * Encodes share state to base64url string.
 */
export function encodeShareState(state: Partial<ShareState>): string {
  try {
    const jsonStr = JSON.stringify(state);
    if (typeof btoa !== 'undefined') {
      return btoa(unescape(encodeURIComponent(jsonStr)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    }
    // Node.js fallback
    return Buffer.from(jsonStr, 'utf-8').toString('base64url');
  } catch {
    return '';
  }
}

/**
 * Decodes share state from base64url string.
 * Strictly fuzz-safe: returns default state on ANY malformed, oversized, or invalid input.
 */
export function decodeShareState(rawHash: string): ShareState {
  if (!rawHash || typeof rawHash !== 'string') {
    return { ...DEFAULT_SHARE_STATE };
  }

  // Strip leading '#' if present
  const cleaned = rawHash.startsWith('#') ? rawHash.slice(1) : rawHash;
  if (cleaned.length === 0 || cleaned.length > 65536) { // 64 KB safety cap
    return { ...DEFAULT_SHARE_STATE };
  }

  try {
    let jsonStr = '';
    if (typeof atob !== 'undefined') {
      // Restore standard base64 from base64url
      let base64 = cleaned.replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4 !== 0) {
        base64 += '=';
      }
      jsonStr = decodeURIComponent(escape(atob(base64)));
    } else {
      // Node.js fallback
      jsonStr = Buffer.from(cleaned, 'base64url').toString('utf-8');
    }

    const parsed = JSON.parse(jsonStr);
    const validated = ShareStateSchema.safeParse(parsed);
    if (validated.success) {
      return validated.data;
    }
    return { ...DEFAULT_SHARE_STATE };
  } catch {
    // Malformed encoding or invalid JSON -> return safe default without throwing
    return { ...DEFAULT_SHARE_STATE };
  }
}
