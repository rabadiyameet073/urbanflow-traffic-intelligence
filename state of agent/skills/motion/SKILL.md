# Skill: motion

**Use when:** Adding transitions, animations, or canvas effects.

**Read first:** `design-and-motion/42`, Rule 13

## Rules

1. Motion explains state change; it never decorates.
2. Duration ≤ 300 ms; animate only `transform` and `opacity` in the DOM.
3. Honour `prefers-reduced-motion`: replace movement with instant change or a fade.
4. No motion that implies a signal state the Kernel has not set.
5. Canvas animation is driven by sim state, not by CSS timers.
6. Provide a pause control for anything that loops.

## Good / Bad

- ✅ Panel opens with a 160 ms opacity+translate.
- ❌ Pulsing red glow on the whole viewport.

## Landmines

- Reduced motion must still show state changes (use text/shape).
- Avoid layout-thrashing animations on the main thread while the worker streams frames.
