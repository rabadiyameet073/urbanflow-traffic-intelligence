/**
 * Module 32 §7: Internationalisation formatting helpers (English first).
 *
 * The rule is "use `Intl`, never manual formatting". Every number the dashboard
 * shows flows through the single `fmt()` in `ui/app.ts`, so routing that one
 * function through `Intl.NumberFormat` brings the whole KPI surface into line
 * without touching each call site.
 *
 * The locale is pinned to `en` for now on purpose: `Intl` with a live
 * `navigator.language` would change the decimal separator and grouping of a
 * displayed number between machines, and Rule 00 requires a shown figure to be
 * stable and reproducible. Readiness for other locales lives here — the call
 * already goes through `Intl`, so a locale toggle is a parameter, not a rewrite.
 * Metric units are the internal and default display units (§7 "Units").
 */

/** Fixed `en` locale until a locale switcher exists (Module 32 §7 "English first"). */
const LOCALE = 'en';

const fixedCache = new Map<number, Intl.NumberFormat>();

function fixedFormatter(digits: number): Intl.NumberFormat {
  let formatter = fixedCache.get(digits);
  if (!formatter) {
    formatter = new Intl.NumberFormat(LOCALE, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    fixedCache.set(digits, formatter);
  }
  return formatter;
}

/**
 * Format a measured value with exactly `digits` fraction digits.
 *
 * `null`/non-finite returns `null` so the caller renders its "no data" token —
 * an em dash, never a fabricated zero (Module 41 §6, Rule 00).
 */
export function formatNumber(value: number | null, digits: number): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  return fixedFormatter(digits).format(value);
}

const pluralRulesCache = new Map<string, Intl.PluralRules>();

/**
 * Select the plural category for a count via `Intl.PluralRules` (§7 "Plurals"),
 * so copy never does `n + " vehicle(s)"`.
 */
export function pluralCategory(count: number, locale: string = LOCALE): Intl.LDMLPluralRule {
  let rules = pluralRulesCache.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale);
    pluralRulesCache.set(locale, rules);
  }
  return rules.select(count);
}
