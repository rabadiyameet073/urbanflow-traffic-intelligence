# Module 42: Motion & Micro-Interactions

> Motion explains state change and gives feedback. It never decorates, never fights the 60 FPS canvas, and always degrades under `prefers-reduced-motion`.

---

## 1. Standards

| Interaction | Duration | Easing | Properties |
|---|---|---|---|
| Hover/focus feedback | 120–150 ms | `ease-out` | `background-color`, `border-color` (no displacement) |
| Press | immediate, ≤ 100 ms | linear | `transform: scale(.98)` |
| Tooltip/popover in | 120 ms | `cubic-bezier(.16,1,.3,1)` | `opacity`, `transform` |
| Dialog enter | 200 ms | `cubic-bezier(.16,1,.3,1)` | scale .96→1 + opacity |
| Dialog exit | 150 ms | `ease-in` | reverse; **finish before unmount** |
| Drawer enter / exit | 250 / 200 ms | quint-out / ease-in | `transform: translate*` |
| Toast | in 200 ms, hold 4 s (6 s if actionable), out 150 ms | ease | `opacity`, `transform` |
| View/tab change | 150 ms cross-fade | ease | `opacity` |
| Judge Mode caption | 200 ms fade | ease | `opacity` |

Rules:
1. **Only animate `transform` and `opacity`** (compositor-friendly). Colour transitions on small elements are acceptable; never animate `width/height/top/left/box-shadow` on large areas.
2. **No vertical float on hover** (`translateY`) for cards or buttons.
3. Max **300 ms** for any UI transition; longer motion requires an ADR-level reason.
4. No parallax, no scroll-jacking, no smooth-scroll libraries (they fight native scroll in a dense app).
5. Never animate while the user is typing/adjusting a control in a way that moves the control.
6. Motion near the canvas must not cost frame time: no `backdrop-filter` layers over the canvas during simulation.

---

## 2. Reduced Motion (mandatory)

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

Plus app-level behaviour (CSS can't cover canvas/JS motion):

| Item | Reduced-motion behaviour |
|---|---|
| Ambulance light bar / siren ring | Static high-contrast marker + text label |
| EVP chip pulse | Static; text carries the state |
| Judge Mode transitions | Instant cuts; captions persist until dismissed |
| Toasts | Appear/disappear without slide |
| Canvas interpolation | **Kept** (it is positional accuracy, not decoration) |
| Charts | No animated transitions |

A user setting "Reduce motion" in the app mirrors the OS preference (and can force it on).

---

## 3. Canvas Motion

- Vehicle movement = interpolation between sim ticks (accuracy). Signal head changes are **instant** with a 100 ms outline emphasis (not flashing).
- EVP effects: light-bar blink ≤ 2 Hz (**WCAG 2.3.1: never more than 3 flashes per second**; keep ≤ 2 Hz), disabled under reduced motion.
- Selection ring: static; subtle 1 px expand on select (150 ms) when motion allowed.
- No particle effects, no screen shake.

---

## 4. Feedback Moments

| Moment | Feedback |
|---|---|
| Control change (demand +50) | Number updates instantly; the lane bar animates width via `transform: scaleX` (150 ms) |
| Copy link / export | Toast + button label changes to "Copied ✓" for 1.5 s |
| Approve proposal | Panel transitions to "Applied" state + toast; announce via live region |
| Unsafe proposal rejected | Panel shows rejection reason inline with ■ glyph; no shake |
| Worker restart | Toast "Simulation restarted" |
| Tour step change | Highlight ring + caption fade |

No confetti, no celebratory effects: this is a safety-critical-style tool.

---

## 5. Implementation Patterns

```css
:root {
  --ease-out-quint: cubic-bezier(0.16, 1, 0.3, 1);
  --dur-fast: 120ms; --dur-base: 200ms; --dur-slow: 250ms;
}
.dialog { transition: opacity var(--dur-base) var(--ease-out-quint),
                       transform var(--dur-base) var(--ease-out-quint); }
.dialog[data-state="closed"] { opacity: 0; transform: scale(.96); }
```

- Exit animations: set `data-state="closed"`, wait for `transitionend` (with a timeout safeguard), then remove from DOM and restore focus.
- Use the Web Animations API sparingly; prefer CSS transitions.
- Never use `setTimeout` chains to choreograph UI; use `transitionend`/`animationend`.

---

## 6. Performance Safeguards

| Do | Don't |
|---|---|
| `will-change: transform` only on elements about to animate, removed after | Permanent `will-change` everywhere |
| Animate with transforms on promoted layers | Animate layout properties |
| Pause non-essential animations when `document.hidden` | Run animations in background tabs |
| Keep KPI updates ≤ 4 Hz | Per-frame text writes |

Verify with the Playwright perf test (module 15) while animations are active.

---

## 7. Checklist

- [ ] Only `transform`/`opacity` on large elements; ≤ 300 ms.
- [ ] No hover displacement; press feedback ≤ 100 ms.
- [ ] Exit animations complete before unmount; focus restored.
- [ ] Reduced-motion CSS + app-level behaviour implemented and tested by emulation.
- [ ] No flashing > 3 Hz anywhere (target ≤ 2 Hz).
- [ ] Canvas frame time unaffected by UI motion (perf test).
