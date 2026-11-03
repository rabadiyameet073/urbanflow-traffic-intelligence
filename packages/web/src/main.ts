/**
 * Module 30 & Module 43: web application bootstrap.
 *
 * The main thread does exactly three things now: forward frames to the two
 * renderers, repaint them on `requestAnimationFrame`, and let the store queue
 * commands at the worker. There is no physics in this file — `Module 31 §9`
 * lists "simulating on the main thread just for the demo" as an anti-pattern,
 * and the 8-lane × 1200 vph frame budget is why.
 *
 * Every displayed number is measured in the worker and arrives in a `kpis`
 * message; this file never computes one (Rule 00).
 */
import { store } from './state/store.js';
import { installConsoleTail } from './state/console-tail.js';
import { renderApp } from './ui/app.js';
import { TwinCanvasRenderer } from './render/canvas.js';
import { judgeTour } from './ui/judge/tour.js';
import { h } from './ui/dom.js';
import { STRINGS } from './i18n/strings.js';

/**
 * Module 30 §6: the engine lives in a Web Worker, so a browser without one
 * cannot run the demo at all. Feature-detect at boot and show an honest
 * explanation rather than a blank page (§10 "Blank page on failure").
 */
function supportsRequiredFeatures(): boolean {
  return typeof window.Worker === 'function' && typeof document.createElement('canvas').getContext === 'function';
}

function renderUnsupportedScreen(root: HTMLElement): void {
  root.replaceChildren(
    h(
      'section',
      { class: 'boot-unsupported', role: 'alert' },
      [
        h('h1', { text: STRINGS.boot.unsupportedTitle }),
        h('p', { text: STRINGS.boot.unsupportedBody }),
        h('p', { class: 'boot-unsupported__note', text: STRINGS.boot.unsupportedNote }),
      ],
    ),
  );
}

/**
 * Module 30 §7: a place notices are surfaced so nothing is swallowed. The store
 * already owns the `workerNotice` signal (restarts, protocol mismatches);
 * global errors are routed through the same channel. Sanitised by construction:
 * only a short code + message is shown, never a stack or user input.
 */
function mountNoticeRegion(): void {
  const region = h('div', {
    class: 'boot-notice',
    role: 'status',
    attrs: { 'aria-live': 'polite' },
    label: STRINGS.boot.noticeAriaLabel,
  });
  document.body.append(region);
  store.workerNotice.subscribe((notice) => {
    region.textContent = notice;
    region.classList.toggle('boot-notice--visible', notice.length > 0);
  });
}

let errorCount = 0;

/** Module 30 §7: count + log + surface, never swallow. */
function reportGlobalError(code: string, detail: string): void {
  errorCount++;
  // Keep at most one line of detail; drop anything past a sane bound so a
  // minified blob or stack fragment never reaches the visible notice.
  const sanitised = detail.slice(0, 160).replace(/\s+/g, ' ').trim();
  console.error(`[urbanflow] ${STRINGS.boot.errorPrefix} (${code}) #${errorCount}: ${sanitised}`);
  store.workerNotice.set(`${STRINGS.boot.errorPrefix} [${code}] ${sanitised || 'see console'}`);
}

function installGlobalErrorHandlers(): void {
  window.addEventListener('error', (event) => {
    reportGlobalError('window.error', event.message || String(event.error ?? ''));
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    reportGlobalError('unhandledrejection', reason instanceof Error ? reason.message : String(reason ?? ''));
  });
}

/**
 * Module 30 §8: a read-only debug handle for Playwright flows, present only in
 * non-production builds. It exposes the state hash, current tick and seed —
 * never a setter — so an e2e check can pin a run without touching the store's
 * one-way flow.
 */
function installDebugApi(): void {
  if (import.meta.env.PROD) return;
  (window as unknown as { __uf: unknown }).__uf = Object.freeze({
    stateHash: () => store.stateHash.get(),
    tick: () => store.tSimS.get(),
    seed: () => store.seed.get(),
    errorCount: () => errorCount,
  });
}

function init(): void {
  const root = document.getElementById('app');
  if (!root) return;

  if (!supportsRequiredFeatures()) {
    renderUnsupportedScreen(root);
    return;
  }

  // Wrap the console first so the debug bundle's tail covers everything that
  // follows, including the boot notices below (Module 16 §6).
  installConsoleTail();
  installGlobalErrorHandlers();
  installDebugApi();
  mountNoticeRegion();

  // Module 26 §6: the stored theme preference is read exactly once, before the
  // first paint, so a returning operator never flashes the wrong palette.
  store.initTheme();
  // Module 42 §2: likewise apply the stored reduced-motion override before the
  // first frame, so a forced-calm user never sees one animated transition.
  store.initMotion();

  const { canvasFixed, canvasAdaptive } = renderApp(root);
  const rendererFixed = new TwinCanvasRenderer(canvasFixed);
  const rendererAdaptive = new TwinCanvasRenderer(canvasAdaptive);

  // One worker drives both twins in lockstep (Module 31 §5), so both canvases
  // are fed from the same message stream and every input is applied at the same
  // tick. That is the fairness property the twin view exists to demonstrate.
  store.onFrame((event) => {
    if (event.twin === 'fixed') {
      rendererFixed.pushFrame(event);
    } else {
      rendererAdaptive.pushFrame(event);
    }
  });

  // Click the junction to pick the approach. Both twins highlight the same lane,
  // because the selection belongs to the operator, not to one controller
  // (Module 31 §3 hit testing, §4 "canvas click"). The keyboard equivalent is
  // the arrow keys, so nothing here is mouse-only.
  const clickToSelect = (renderer: TwinCanvasRenderer) => (event: MouseEvent): void => {
    const lane = renderer.laneAt(event.offsetX, event.offsetY);
    if (lane) store.selectLane(lane);
  };
  const hoverToTrack = (renderer: TwinCanvasRenderer, canvas: HTMLCanvasElement) => (event: MouseEvent): void => {
    const lane = renderer.laneAt(event.offsetX, event.offsetY);
    renderer.setHoverLane(lane);
    canvas.style.cursor = lane ? 'pointer' : 'default';
  };
  const hoverLeave = (renderer: TwinCanvasRenderer, canvas: HTMLCanvasElement) => (): void => {
    renderer.setHoverLane(null);
    canvas.style.cursor = 'default';
  };

  canvasFixed.addEventListener('click', clickToSelect(rendererFixed));
  canvasFixed.addEventListener('mousemove', hoverToTrack(rendererFixed, canvasFixed));
  canvasFixed.addEventListener('mouseleave', hoverLeave(rendererFixed, canvasFixed));

  canvasAdaptive.addEventListener('click', clickToSelect(rendererAdaptive));
  canvasAdaptive.addEventListener('mousemove', hoverToTrack(rendererAdaptive, canvasAdaptive));
  canvasAdaptive.addEventListener('mouseleave', hoverLeave(rendererAdaptive, canvasAdaptive));

  store.selectedLane.subscribe((lane) => {
    rendererFixed.setSelectedLane(lane);
    rendererAdaptive.setSelectedLane(lane);
  });

  // Deep link: ?judge=1 starts the 90-second Judge Mode tour (Module 43).
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('judge') === '1') {
    judgeTour.start();
  }

  function paint(nowMs: number): void {
    // Module 15 §4.8: rendering pauses while the tab is hidden; the store
    // applies the matching worker time policy (pause, then resume on return).
    if (!document.hidden) {
      rendererFixed.draw(nowMs);
      rendererAdaptive.draw(nowMs);
    }
    requestAnimationFrame(paint);
  }

  document.addEventListener('visibilitychange', () => {
    store.onVisibilityChange(document.hidden);
  });

  requestAnimationFrame(paint);
  store.start();
}

// Start on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
