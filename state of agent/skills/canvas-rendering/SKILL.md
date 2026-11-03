# Skill: canvas-rendering

**Use when:** Editing the intersection renderer, vehicle drawing, overlays or frame loop.

**Read first:** `technical-architecture/31`, Rule 14

## Rules

1. Render from the latest frame buffer received from the worker; never read sim state directly on the main thread.
2. Layers: static road (pre-rendered offscreen), dynamic vehicles, signals, overlays; redraw only dirty layers.
3. Use integer pixel snapping for hairlines; scale by `devicePixelRatio`.
4. Interpolate between the last two frames for smoothness; interpolation never feeds back into the sim.
5. Zero allocations per frame: reuse arrays, path objects and typed views.
6. Draw signal state with colour + shape + letter.

## Good / Bad

- ✅ `ctx.setTransform(dpr,0,0,dpr,0,0)` once per resize.
- ❌ Creating a `Path2D` per vehicle every frame.

## Landmines

- Canvas text is not accessible; mirror to the DOM summary.
- `OffscreenCanvas` is optional; keep a main-thread fallback.
