# Module 30: Frontend Architecture (Vite + TypeScript, Framework-Light)

> `packages/web`: a control-room-style single-page app. The canvas is the hero; the UI is dense, keyboard-first and fast. Simulation lives in a Web Worker; the main thread draws and reacts.

---

## 1. Principles

1. **Main thread = render + input.** No simulation, no heavy parsing, no blocking IO on the main thread.
2. **Core is the model, web is the view.** Business rules (pressure, LOS, delta, modal-split renormalisation, share-codec) live in `core` and are *imported*, never re-implemented.
3. **Small modules, explicit ownership.** Files < 400 lines; one responsibility; pure helpers separate from DOM code.
4. **Everything has a degraded state:** loading, empty, error, offline, reduced-motion, narrow-screen.
5. **Accessibility is structural** (module 32), not a final pass.
6. **Zero console errors** on load and in every Playwright flow.

---

## 2. Module Map

```
packages/web/
  index.html                  # static shell, meta tags (module 33), noscript fallback
  vite.config.ts
  src/
    main.ts                   # bootstrap: feature detect → store → worker → mount UI
    app/
      shell.ts                # layout regions, theme, dialogs root, toasts
      router.ts               # hash-based view switch: #/sim, #/pipeline, #/results (share state is in `s=` param)
    worker/
      sim.worker.ts           # hosts @urbanflow/core; owns the loop and keyframes
      client.ts               # typed main-thread wrapper: send(cmd), on(event), restart()
      protocol.ts             # re-exports command/event unions from core (zod in dev)
    render/
      canvas.ts               # renderer (static layer + dynamic layer + overlays)
      geometry.ts             # world↔canvas mapping, lane polygons (pure)
      palette.ts              # token-derived canvas colours (read CSS vars once per theme change)
      shapes.ts               # vehicle shape drawing by type
    state/
      store.ts                # signals store (≈100 lines)
      selectors.ts            # derived values (memoised)
      actions.ts              # typed intents that talk to worker/client
    ui/
      components/             # primitives: button, stepper, slider, tabs, dialog, drawer, tooltip, badge, toast
      panels/                 # lane controls, scenario picker, kpi cards, charts, phase timeline,
                              #   explain panel, safety panel, evp timeline, copilot, edge gateway, pipeline view,
                              #   camera mode, audit/debug
      judge/                  # Judge Mode tour controller + captions
    share/                    # URL codec (deflate+base64url), state hash footer
    data/                     # generated/expectations.json, precomputed copilot examples, replay recordings
    i18n/strings.ts           # all user-visible strings (module 32)
    styles/                   # tokens.css, base.css, components.css, utilities.css (module 40)
    testing/                  # test-only helpers, data-testid constants
```

---

## 3. Framework-Light Component Pattern (ADR-006)

A component is a **factory returning an element plus lifecycle**, no hidden globals.

```ts
export interface Component<T extends HTMLElement = HTMLElement> {
  readonly el: T;
  update?(): void;       // optional manual refresh
  dispose(): void;       // remove listeners, subscriptions, observers, timers
}

export function createStepper(opts: {
  label: string; value: Signal<number>; min: number; max: number; step: number;
  onChange(next: number): void;
}): Component<HTMLDivElement> {
  const el = h('div', { class: 'stepper', role: 'group', 'aria-label': opts.label });
  const dec = h('button', { type: 'button', 'aria-label': `Decrease ${opts.label}` }, '−');
  const inc = h('button', { type: 'button', 'aria-label': `Increase ${opts.label}` }, '+');
  const out = h('output', { 'aria-live': 'off' });
  el.append(dec, out, inc);
  const stop = effect(() => { out.textContent = String(opts.value.get()); });
  const onDec = () => opts.onChange(clamp(opts.value.get() - opts.step, opts.min, opts.max));
  const onInc = () => opts.onChange(clamp(opts.value.get() + opts.step, opts.min, opts.max));
  dec.addEventListener('click', onDec); inc.addEventListener('click', onInc);
  return { el, dispose() { stop(); dec.removeEventListener('click', onDec); inc.removeEventListener('click', onInc); } };
}
```

Rules:
1. `h()` helper creates elements with **text via `textContent`**, never `innerHTML` (lint-banned). Static SVG icons come from a reviewed `icons.ts` sprite.
2. Every subscription/listener returns a disposer; `dispose()` is tested for leaks in e2e soak.
3. No component reaches into another's DOM; communicate via the store or callbacks.
4. State that is *only* UI (open/closed) stays local; domain state lives in the store.
5. If vanilla components become unmaintainable, adopt Preact via a **new ADR** — do not smuggle in a framework.

---

## 4. Store (signals) — Contract

```ts
export interface Signal<T> { get(): T; set(v: T): void; subscribe(fn: (v: T) => void): () => void; }
export function signal<T>(initial: T): Signal<T>;
export function computed<T>(fn: () => T): Signal<T>;       // memoised, auto-tracking
export function effect(fn: () => void): () => void;        // returns disposer
export function batch(fn: () => void): void;               // coalesce updates
```

State slices (each a record of signals):

| Slice | Contents |
|---|---|
| `sim` | seed, scenarioId, speed, paused, controller views, kpis (throttled 4 Hz), signal states, safety counters |
| `controls` | laneDemand[8], modalSplit, detectionDistance, selectedLane, incident form |
| `copilot` | status, diagnosis, proposal, whatIf, aiCost, source badge |
| `edge` | online, health, evp feed |
| `pipeline` | mode (replay/live/off), recording meta, charts data |
| `ui` | theme, view, dialogs, toasts, hints, reducedMotion |

Rules: **one-way flow** (UI → actions → worker/client → events → store → UI); selectors are pure; derived values are `computed`; KPIs are updated at ≤ 4 Hz.

---

## 5. Views & Layout

| View | Content |
|---|---|
| **Simulate** (default) | Twin canvases (or single), lane controls drawer, KPI cards, phase timeline, explain/safety/EVP panels, copilot dock |
| **Pipeline** | Recorded/Live pipeline charts, anomaly timeline, latency, `REPLAY` badge |
| **Results** | Generated results table with CIs, scenario expectations, assumptions |
| **About / Limits** | Honest limitations, architecture diagram, links |

Layout: CSS grid, two columns ≥ 1024 px; ≤ 768 px controls collapse into a bottom drawer; the canvas keeps its aspect ratio; no horizontal scroll at 360 px.

---

## 6. Feature Detection & Degradation

| Capability | Check | Fallback |
|---|---|---|
| Web Workers, `OffscreenCanvas` (optional), `CompressionStream` | feature test at boot | JSON share codec; main-thread-free rendering still works |
| `localStorage` | try/catch | In-memory |
| `prefers-reduced-motion`, `prefers-color-scheme`, `forced-colors` | `matchMedia` | Static markers, theme tokens, high-contrast CSS |
| Edge reachable | `/api/health` with 3 s timeout | Offline mode messaging |

Unsupported-browser screen: explain, link to the recorded video; never a blank page.

---

## 7. Error Handling

- Global `window.onerror` / `unhandledrejection` ⇒ toast + log to console (sanitised) + counter; never swallow.
- Worker `error`/missed heartbeat ⇒ auto-restart from last keyframe, toast "Simulation restarted".
- Dialog/panel-level boundaries: a failing panel shows an inline error card; the canvas and controls keep working.

---

## 8. Testing Hooks

- Stable `data-testid`s (constants in `testing/ids.ts`), e.g. `status-vehicle-count`, `evp-chip`, `state-hash`, `kpi-avg-delay-adaptive`.
- A read-only `window.__uf` debug API **only in non-production builds** exposing `{stateHash(), tick(), seed()}` for Playwright.
- Fixed seed + paused-at-t for screenshots.

---

## 9. Build & Loading

- Vite production build, ES2022 target, `build.sourcemap = true` (hidden in prod if size matters), manual chunks: `core` worker, `charts`, `copilot`, `camera`.
- Preload critical fonts; defer non-critical panels with dynamic `import()`.
- `size-limit`: total JS ≤ 350 KB gz.
- Static assets hashed; HTML served with CSP (module 14) — no inline scripts (Vite inlines nothing by default except small assets; verify).

---

## 10. Anti-Patterns

| ❌ | ✅ |
|---|---|
| `element.innerHTML = value` | `textContent` / `h()` |
| Re-implementing metric math in UI | Import from `core` |
| Global mutable singletons | Store signals + disposers |
| Polling the worker with `setInterval` | Event-driven messages |
| Per-frame DOM writes | Throttled (≤ 4 Hz) batched updates |
| Blank page on failure | Error card / unsupported screen |
| Reading `localStorage` in render | Read once at startup, try/catch |
| Large dependency for one helper | Write the 10 lines |
