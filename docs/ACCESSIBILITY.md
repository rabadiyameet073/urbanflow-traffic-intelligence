# Accessibility Statement

**Target:** WCAG 2.2 Level AA for the operator dashboard (`packages/web`).

**Status:** implemented at the code level; **not yet verified with assistive
technology**. This document separates what is implemented from what has been
tested, because those are different claims.

## 1. What Is Implemented

| Requirement | Implementation | Where |
|---|---|---|
| 1.1.1 Non-text content | The simulation canvas carries an `aria-label` naming the twin and what it shows | `ui/app.ts` |
| 1.3.1 Info and relationships | Structure is real elements and headings, not styled `<div>`s | `ui/app.ts`, `ui/dom.ts` |
| 1.4.3 Contrast (minimum) | Colour comes only from design tokens; no ad-hoc hex values in component code | `styles/tokens.css` |
| 1.4.11 Non-text contrast | Focus and state colours are separate tokens with dedicated light/dark values | `styles/tokens.css` |
| 2.1.1 Keyboard | All controls are native `button` / `input` / `select`; no click-only handlers | `ui/app.ts` |
| 2.1.2 No keyboard trap | The keyboard-help dialog is dismissible with `Escape` | `ui/app.ts` |
| 2.4.3 Focus order | DOM order matches visual order; the canvas is not in the tab ring | `ui/app.ts` |
| 2.4.7 Focus visible | `:focus-visible { outline: 2px solid var(--color-focus) }` marked inviolable | `styles/base.css` |
| 2.4.11 Focus not obscured | Panels do not overlay the focused control at supported viewport sizes | `styles/components.css` |
| 2.5.8 Target size | Interactive controls meet the minimum target size token | `styles/components.css` |
| 3.2.2 On input | Changing a control does not navigate or reflow the page structure | `ui/app.ts` |
| 4.1.3 Status messages | Run status, denials and copilot results are announced through `aria-live="polite"` with `aria-atomic="true"` | `ui/app.ts` |
| Animation | `prefers-reduced-motion: reduce` disables the pulse animation in the renderer and the transitions in CSS | `render/canvas.ts`, `styles/base.css`, `styles/components.css` |

## 2. Design-System Rules That Enforce Accessibility

These are constraints rather than features, which is why they survive edits:

1. **No `innerHTML`.** All text goes through `textContent`. Markup is constructed
   with `createElement`, so a string from the copilot can never become nodes.
2. **No inline `style="..."`.** Colour, spacing and type come from tokens.
   `element.style.setProperty` is permitted only for geometry (canvas size,
   transform), which has no colour or contrast semantics.
3. **All copy lives in `ui/strings.ts`**, including `aria-label` text, so a label
   cannot silently drift from the visible label.
4. **Focus ring is `!important` in a single rule.** No component may suppress it
   locally.

## 3. Known Gaps

| Gap | Impact | Status |
|---|---|---|
| No screen-reader walkthrough (NVDA / VoiceOver) | Label quality and reading order are unverified in practice | **not run** |
| Contrast ratios not machine-verified | Token pairs were chosen for contrast; the measured ratios are not recorded here | **not run** — `instruction/helpers/contrast.py` exists for this purpose |
| Canvas content has no text alternative beyond its label | Data shown only visually is not exposed to assistive tech | accepted limitation for a simulation view |
| No automated axe / Playwright a11y assertions in CI | Regressions would not be caught automatically | **not run** |
| Zoom at 200 % on small viewports not manually checked | Reflow behaviour at the boundary is unverified | **not run** |

None of the items in Section 3 should be read as passing. They are listed so a
reviewer can see exactly what remains.

## 4. Reporting a Barrier

If you encounter an accessibility barrier, open an issue describing the page,
the control, and the assistive technology used. Accessibility defects are treated
as functional defects, not as polish.
