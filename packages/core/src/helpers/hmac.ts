/**
 * HMAC-SHA256 sign/verify with Web Crypto (Workers, browsers, Node >= 20).
 * Verification uses crypto.subtle.verify, which compares in constant time.
 */

const encoder = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hex)) return null;
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function importKey(secret: string, usage: 'sign' | 'verify'): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

/** Returns lowercase hex HMAC-SHA256 of `message` (use canonical JSON for structured data). */
export async function signHex(secret: string, message: string): Promise<string> {
  const key = await importKey(secret, 'sign');
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

/** Constant-time verification. Never throws on malformed signatures; returns false. */
export async function verifyHex(secret: string, message: string, signatureHex: string): Promise<boolean> {
  const sig = fromHex(signatureHex);
  if (sig === null || sig.length !== 32) return false;
  const key = await importKey(secret, 'verify');
  return crypto.subtle.verify('HMAC', key, sig as unknown as BufferSource, encoder.encode(message));
}

/** Timestamp window check to bound replay (pair with a single-use nonce store). */
export function withinWindow(tsMs: number, nowMs: number, windowMs: number): boolean {
  return Number.isFinite(tsMs) && Math.abs(nowMs - tsMs) <= windowMs;
}

