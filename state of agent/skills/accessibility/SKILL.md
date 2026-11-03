# Skill: accessibility

**Use when:** Any UI work; before merging any front-end change; during the manual pass.

**Read first:** `technical-architecture/32`, Rule 13, `languages-and-tooling/51`

## Rules

1. Native elements first; ARIA only to fill gaps.
2. Keyboard map documented: every control reachable, logical tab order, no traps, Escape closes layers.
3. Live regions: polite for Kernel/EVP/AI updates; assertive only for FLASH_RED.
4. Canvas has `role="img"` plus a text summary and an accessible data table alternative.
5. Contrast and redundancy per Rule 13; test with forced-colors and 200 % zoom.
6. Record a manual screen-reader pass (NVDA or VoiceOver) with date and findings.

## Good / Bad

- ✅ `<button aria-pressed="true">Adaptive</button>` with visible focus.
- ❌ `<div class="btn" tabindex="0">` with a click handler.

## Landmines

- Announcing every tick floods screen readers; throttle summaries to meaningful changes.
- `aria-live` regions must exist in the DOM before content changes.
