/**
 * Module 26 §6: the only path to browser storage in the app.
 *
 * Rules enforced here, once, so no caller can break them by accident:
 *   - namespace `uf_v1_*` only; `resetPlatformData()` clears exactly that;
 *   - every access is wrapped in try/catch — private mode, quota and blocked
 *     storage must degrade to "app works, preference not remembered";
 *   - secrets, tokens and user text are never stored (keys are hint ids,
 *     theme preference and nothing else; run state lives in the URL hash,
 *     which is the source of truth and is deliberately *not* mirrored here).
 */

export const STORAGE_PREFIX = 'uf_v1_';

export type ThemePref = 'light' | 'dark' | 'system';

export function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(STORAGE_PREFIX + key);
  } catch {
    // Blocked or unavailable storage is a supported state, not an error.
    return null;
  }
}

export function storageSet(key: string, value: string): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, value);
  } catch {
    // Write failure degrades to the default-on-next-load, never throws.
  }
}

/** §6 `uf_v1_theme`: read once at startup; anything unrecognised is 'dark'. */
export function loadThemePref(): ThemePref {
  const raw = storageGet('theme');
  return raw === 'light' || raw === 'system' ? raw : 'dark';
}

/** `system` follows the OS media query; non-windowed contexts default dark. */
export function resolveTheme(pref: ThemePref): 'dark' | 'light' {
  if (pref !== 'system') return pref;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'dark';
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function saveThemePref(pref: ThemePref): void {
  storageSet('theme', pref);
}

/**
 * Module 42 §2: `uf_v1_motion`. `system` follows the OS `prefers-reduced-motion`
 * media query; `reduce` forces reduced motion on regardless of the OS. There is
 * no `force-animation-on` state — we never override a user who asked the OS for
 * calm, only the other way round.
 */
export type MotionPref = 'system' | 'reduce';

export function loadMotionPref(): MotionPref {
  return storageGet('motion') === 'reduce' ? 'reduce' : 'system';
}

export function saveMotionPref(pref: MotionPref): void {
  storageSet('motion', pref);
}

/**
 * Clears every `uf_v1_*` key and returns the names removed. Exported for the
 * settings surface and tests; callers get a truthful count instead of a toast.
 */
export function resetPlatformData(): string[] {
  const removed: string[] = [];
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX)) keys.push(key);
    }
    for (const key of keys) {
      localStorage.removeItem(key);
      removed.push(key);
    }
  } catch {
    // Blocked storage: nothing was readable, so nothing can be removed.
  }
  return removed;
}
