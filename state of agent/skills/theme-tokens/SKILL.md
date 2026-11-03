# Skill: theme-tokens

**Use when:** Adding or changing colours, spacing, type or radii; touching tokens.css or theme switching.

**Read first:** `design-and-motion/40`, `helpers/contrast.py`, Rule 19

## Rules

1. Define every visual value once as a CSS custom property in `tokens.css` under `@layer tokens`.
2. Dark is default; light overrides the same names. Never fork component CSS per theme.
3. Name tokens by role (`--color-surface`, `--color-text-2`), not by value (`--grey-700`).
4. After any colour change run `python3 helpers/contrast.py` and attach the result; 0 failing pairs.
5. Theme switch sets `data-theme` on `<html>`, persists in `localStorage` inside try/catch, and falls back to `prefers-color-scheme`.
6. Canvas reads tokens via `getComputedStyle` on theme change and caches the palette.

## Good / Bad

- ✅ `background: var(--color-elevated); border: 1px solid var(--color-border-strong);`
- ❌ `background: #1A2330;` in a component, or a second dark palette that drifts.

## Landmines

- `--color-border-strong` on elevated surfaces was the one pair that failed contrast; keep #66778C (dark).
- Reading `localStorage` can throw in private windows; always guard.
- Do not animate colour tokens at 60 FPS on large areas.
