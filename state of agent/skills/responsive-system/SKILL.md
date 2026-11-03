# Skill: responsive-system

**Use when:** Making layouts work from 320 px to ultrawide, or changing panel arrangement.

**Read first:** `languages-and-tooling/51`, `design-and-motion/40`

## Rules

1. Mobile-first `min-width` queries at 768/1024/1440; no horizontal scroll at 320 px.
2. Page regions use CSS Grid; components use Flexbox and container queries.
3. The simulation canvas keeps aspect ratio and scales with `devicePixelRatio`, capped at 2 for performance.
4. On narrow screens panels become tabs; the primary control (Run/Pause, Inject EVP) stays reachable.
5. Touch targets ≥ 24 px (prefer 44); no hover-only information.
6. Test with Playwright at 320, 768, 1440 (E10).

## Good / Bad

- ✅ `grid-template-columns: minmax(0,1fr) minmax(0,320px)` inside `@container`.
- ❌ Fixed `width: 1200px` panels.

## Landmines

- `minmax(0,1fr)` is required or long numbers force overflow.
- Safari 100vh quirks: use `dvh` with fallback.
