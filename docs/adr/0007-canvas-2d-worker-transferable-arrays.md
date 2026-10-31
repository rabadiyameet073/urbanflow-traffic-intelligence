# ADR-007: Canvas 2D in a Web-Worker-driven architecture; no WebAssembly
- Status: Accepted
- Date: 2026-10-31
- Deciders: UrbanFlow Architecture Team

## Context
High vehicle counts (100-300 vehicles) require silky-smooth 60 FPS animation. Heavy physics calculations on the main UI thread block user interactions and cause input lag.

## Options
- (a) Simulation executed in a Web Worker transferring typed arrays; Canvas 2D interpolation on the main thread.
- (b) WebGL / Three.js instanced rendering.
- (c) WebAssembly (WASM) physics loop.

## Decision
Adopt option (a). Simulation steps in a dedicated Web Worker isolate; main thread interpolates positions using 2D Canvas rendering with pre-rendered static road geometry cache.

## Consequences
- Positive: Guaranteed 60 FPS with <= 20ms frame times; main UI thread remains completely responsive to clicks and toggles.
- Negative: Cannot run complex 3D shader lighting without WebGL (satisfies 2D digital twin requirements).

## Evidence
`packages/web/src/render/canvas.ts` benchmarks frame times under 12ms at 200 vehicles.
