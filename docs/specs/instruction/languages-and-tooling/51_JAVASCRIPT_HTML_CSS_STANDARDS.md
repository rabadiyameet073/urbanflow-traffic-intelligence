# Module 51: JavaScript, HTML & CSS Standards

> Plain JS appears only in config/scripts (`*.mjs`); the product is TypeScript. HTML and CSS are written by hand and carry the design system, accessibility and performance guarantees.

---

## 1. JavaScript (`.mjs` scripts, config files)

| Rule | Detail |
|---|---|
| Module format | ESM (`.mjs` or `"type":"module"`); no CommonJS in new files |
| Runtime | Node ≥ 20; use built-ins (`node:fs/promises`, `node:test` optional, `node:crypto`) |
| Types | `// @ts-check` + JSDoc types at the top of each script; checked by `tsc --noEmit --allowJs --checkJs` for `scripts/` and `helpers/` |
| Safety | No `eval`; no shell string-building with user input (`execFile` with args array) |
| Exit codes | Non-zero on failure; print the failing path/reason |
| Output | Machine-readable (`--json`) option for tools used in CI |
| Idempotent | Scripts can be re-run safely |

Scripts in this pack: `helpers/validate-pack.mjs`, `helpers/check-meta.mjs`.

---

## 2. HTML

1. **Semantic first:** `header, nav, main, section, aside, footer, h1…h6, button, label, output, table`. One `<h1>` per view; heading levels not skipped.
2. **Buttons are `<button type="button">`**, links are `<a href>`; never `div` with click handlers.
3. **Forms:** every control has a `<label for>`; errors via `aria-describedby` + `aria-invalid`; use native `<input type="range|number|checkbox">` and style them.
4. **Landmarks & skip link:** "Skip to simulation" link as the first focusable element.
5. **`lang`, `dir`, viewport** set; no `maximum-scale=1`/`user-scalable=no`.
6. **Images:** `alt` always (decorative `alt=""` + `aria-hidden` not both); explicit `width`/`height`; SVG inline only from the reviewed icon sprite.
7. **No inline event handlers, no inline `style` attributes** (CSP + token discipline); dynamic values go through CSS custom properties set via `element.style.setProperty` only for geometry that cannot be classed (documented exceptions).
8. **IDs** unique and stable for `aria-*` references and tests (`data-testid` for tests).
9. **Tables** for tabular data with `<caption>`, `<th scope>`.
10. `<noscript>` explains JavaScript is required and links to the video.

---

## 3. CSS Architecture

### 3.1 Layers (cascade control)

```css
@layer reset, tokens, base, layout, components, utilities, overrides;
```

| Layer | Contents |
|---|---|
| `reset` | Minimal modern reset (box-sizing, margin zero, media defaults) |
| `tokens` | `:root` custom properties (module 40), theme overrides |
| `base` | Element defaults (typography, links, focus ring) |
| `layout` | Grid/regions/containers |
| `components` | One block per component (BEM-lite) |
| `utilities` | Few single-purpose helpers (`.visually-hidden`, `.stack`, `.cluster`) |
| `overrides` | Reduced motion, forced colours, print |

Later layers win regardless of selector specificity → **no `!important`** except the reduced-motion block.

### 3.2 Naming (BEM-lite)

`.kpi-card`, `.kpi-card__value`, `.kpi-card--stale`. State via attributes: `[data-state="closed"]`, `[aria-selected="true"]`, `[aria-expanded="true"]` (prefer ARIA/state attributes over extra classes).

### 3.3 Rules

| Rule | Detail |
|---|---|
| Tokens only | No raw hex/rgb/px for colour/space/radius in component CSS (documented micro-geometry exceptions, e.g. 1 px hairline, 2 px focus ring) |
| Logical properties | `margin-inline`, `padding-block`, `inset-inline-start` |
| Units | `rem` for type/space, `%`/`fr`/`minmax()` for layout, `px` for hairlines; never `vw` for font size without `clamp()` |
| Layout | CSS Grid for page regions, Flexbox for components; `gap` not margins; container queries where components need local responsiveness |
| Specificity | Single-class selectors; no ID selectors; max depth 2 |
| Selectors | No `*` in components, no tag-qualified classes |
| Responsive | Mobile-first `min-width` queries; breakpoints 768/1024/1440; no horizontal overflow at 320 px |
| Focus | One global `:focus-visible` rule using `--color-focus`; never `outline: none` alone |
| Motion | Only through the module 42 variables; reduced-motion block in `overrides` |
| Colour scheme | `color-scheme: dark light`; `forced-colors: active` block restores borders/outlines |
| Print | Minimal print stylesheet for Results (hide controls) |
| Performance | Avoid `backdrop-filter` over the canvas; avoid expensive selectors (`:has` over large trees) in hot paths; `content-visibility: auto` on offscreen panels |

### 3.4 Skeleton

```css
@layer tokens { :root { --color-canvas:#0B0F14; /* … module 40 … */ } }
@layer base {
  html { color-scheme: dark light; font: 16px/1.5 var(--font-ui); }
  body { background: var(--color-canvas); color: var(--color-text); }
  :focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
}
@layer components {
  .kpi-card { background: var(--color-surface); border: 1px solid var(--color-hairline);
              border-radius: var(--radius-md); padding: var(--space-4); }
  .kpi-card__value { font: 600 1.5rem/1.2 var(--font-mono); font-variant-numeric: tabular-nums; }
}
@layer overrides {
  @media (prefers-reduced-motion: reduce) { *,*::before,*::after { animation-duration:.01ms !important; transition-duration:.01ms !important; } }
  @media (forced-colors: active) { .kpi-card { border-color: CanvasText; } }
}
```

---

## 4. Tooling

- **Stylelint** (standard config + custom rules: `declaration-property-value-disallowed-list` for raw colours, `selector-max-id: 0`, `declaration-no-important` with the reduced-motion exception).
- **Prettier** formats CSS/HTML.
- **Lighthouse + axe** verify output (modules 15, 32).
- **Playwright visual tests** pin appearance (module 60).

---

## 5. Verification Commands

```bash
# no raw hex outside tokens
grep -rnE '#[0-9A-Fa-f]{3,8}\b' packages/web/src/styles | grep -v 'tokens.css' || true
# no !important except reduced-motion
grep -rn '!important' packages/web/src/styles | grep -v 'overrides' || true
# inline styles / handlers
grep -rnE 'style="|onclick=|onload=' packages/web/index.html packages/web/src || true
```

All three must print nothing.

---

## 6. Anti-Patterns

| ❌ | ✅ |
|---|---|
| `<div onclick>` | `<button type="button">` |
| `outline: none` | tokenised `:focus-visible` ring |
| Pixel-perfect magic numbers | Token scale + layout primitives |
| Colour hard-coded in canvas drawing | Palette object from CSS vars |
| Specificity wars with `!important` | `@layer` ordering |
| Fixed pixel widths for panels | `minmax()` / container queries |
| Hiding content with `display:none` that should be read by AT | `.visually-hidden` pattern |
