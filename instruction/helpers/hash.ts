/**
 * FNV-1a 64-bit hash over raw bytes, used for sim state hashes (Rule 07).
 * Uses BigInt so it is portable and exact. For hot loops, hash once per N ticks.
 */

const FNV_OFFSET_64 = 0xcbf29ce484222325n;
const FNV_PRIME_64 = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

/** Hash a byte view. Returns a 16-char lowercase hex string. */
export function fnv1a64(bytes: Uint8Array): string {
  let h = FNV_OFFSET_64;
  for (let i = 0; i < bytes.length; i++) {
    h ^= BigInt(bytes[i] as number);
    h = (h * FNV_PRIME_64) & MASK_64;
  }
  return h.toString(16).padStart(16, '0');
}

/** Hash several typed arrays as one logical state, in the given order. */
export function hashState(arrays: readonly ArrayBufferView[]): string {
  let h = FNV_OFFSET_64;
  for (const view of arrays) {
    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    for (let i = 0; i < bytes.length; i++) {
      h ^= BigInt(bytes[i] as number);
      h = (h * FNV_PRIME_64) & MASK_64;
    }
  }
  return h.toString(16).padStart(16, '0');
}
