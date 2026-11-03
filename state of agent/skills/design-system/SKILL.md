# Skill: design-system

**Use when:** Building or reviewing any UI component, panel or layout so it matches the control-room look.

**Read first:** `design-and-motion/40`, `technical-architecture/30`, Rule 19

## Rules

1. Compose from primitives: panel, stat card, chip, button, toggle, tabs, table; add a new primitive only if three uses need it.
2. Density is high but calm: 4 px spacing scale, 1 px hairlines, radius sm/md only, no decorative shadows.
3. Numbers use tabular monospace with units; labels sentence case; status chips combine colour, symbol and text.
4. Every component documents states: default, hover, focus-visible, active, disabled, loading, error, stale.
5. Empty, loading and error states are designed, not blank.
6. Check dark and light, 320/768/1440 px, reduced motion, forced colours.

## Good / Bad

- ✅ A KPI card: label, value, unit, delta with CI, sparkline, stale badge.
- ❌ A card with a gradient, glow and unlabeled number.

## Landmines

- Judge Mode shows the UI to a stranger in three minutes; clutter loses points faster than missing features.
- Do not copy design from the source docs; the tokens in module 40 are canonical.
