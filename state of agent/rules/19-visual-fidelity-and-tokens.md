# Rule 19 — Visual Fidelity and Tokens (inviolable)

The control-room design system (module 40) is implemented exactly. Appearance comes from tokens, not ad-hoc values.

## Protocol

1. Colours, spacing, radii, type scale, shadows, motion durations come from CSS custom properties defined once in `tokens.css`. No raw hex/rgb/px for these in component CSS or TS (audit A8). Documented micro-geometry (1 px hairline, 2 px focus ring) is the exception.
2. Canvas drawing reads the palette from CSS variables at theme change; it does not hard-code colours.
3. Both themes (dark default, light) ship together; every component is checked in both. Contrast pairs are verified by `helpers/contrast.py` after any token change.
4. Signal semantics are fixed: go (green-teal), caution (yellow), stop (orange-red), with shape + text redundancy (module 40 §signal).
5. Fonts are self-hosted (Inter, JetBrains Mono, OFL), numeric text uses `font-variant-numeric: tabular-nums`.
6. Layout uses the spacing scale and grid primitives; no one-off pixel nudges.
7. Visual regression baselines (Playwright) are updated only with a human-reviewed diff and a commit-body reason.
8. Motion follows module 42 and respects reduced motion.
9. Charts follow module 41: Okabe-Ito palette, direct labels, units, honest axes (zero baseline for bars), CI bands where claimed.

## Good / Bad

| ✅ | ❌ |
|---|---|
| `color: var(--color-text-2)` | `color: #9aa5b1` |
| Add a token, update contrast report, then use it | Inline "slightly different grey" |

## Enforcement

Stylelint rules, `audit.sh` A8/A9, contrast script in CI, visual tests, review checklist §2.5.
