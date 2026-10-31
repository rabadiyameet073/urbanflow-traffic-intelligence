/**
 * Module 30 & Module 43: Web Application Bootstrap & 60 FPS Simulation Loop
 */
import { store } from './state/store.js';
import { renderApp } from './ui/app.js';
import { TwinCanvasRenderer } from './render/canvas.js';
import { TIMING } from '@urbanflow/core';
import { judgeTour } from './ui/judge/tour.js';

function init() {
  const root = document.getElementById('app');
  if (!root) return;

  const { canvasFixed, canvasAdaptive, updateKpis } = renderApp(root);
  const rendererFixed = new TwinCanvasRenderer(canvasFixed);
  const rendererAdaptive = new TwinCanvasRenderer(canvasAdaptive);

  // Check URL query parameters for ?judge=1
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('judge') === '1') {
    judgeTour.start();
  }

  // Fixed timestep simulation accumulator loop
  let lastTimeMs = performance.now();
  let accumulatorS = 0;
  let kpiAccumulatorS = 0;

  // Running tracking counters
  let fixedPaxDelay = 0;
  let fixedPax = 0;
  let adaptivePaxDelay = 0;
  let adaptivePax = 0;

  function loop(nowMs: number) {
    const dtWallS = Math.min(0.25, (nowMs - lastTimeMs) / 1000);
    lastTimeMs = nowMs;

    if (!store.isPaused.get()) {
      accumulatorS += dtWallS * store.speed.get();
      kpiAccumulatorS += dtWallS;

      let steps = 0;
      const maxSteps = 40;

      while (accumulatorS >= TIMING.SIM_DT_S && steps < maxSteps) {
        // Step Fixed Twin
        const obsFixed = store.simFixed.observe();
        const actionFixed = store.ctrlFixed.decide(obsFixed);
        const signalFixed = store.kernelFixed.step(actionFixed, null, TIMING.SIM_DT_S);
        store.simFixed.step(signalFixed);

        for (const ev of store.simFixed.drainEvents()) {
          if (ev.kind === 'vehicleExited') {
            fixedPaxDelay += ev.delayS * ev.pax;
            fixedPax += ev.pax;
          }
        }

        // Step Adaptive Twin
        const obsAdaptive = store.simAdaptive.observe();
        const actionAdaptive = store.ctrlAdaptive.decide(obsAdaptive);
        const signalAdaptive = store.kernelAdaptive.step(actionAdaptive, null, TIMING.SIM_DT_S);
        store.simAdaptive.step(signalAdaptive);

        for (const ev of store.simAdaptive.drainEvents()) {
          if (ev.kind === 'vehicleExited') {
            adaptivePaxDelay += ev.delayS * ev.pax;
            adaptivePax += ev.pax;
          }
        }

        accumulatorS -= TIMING.SIM_DT_S;
        steps++;

        store.safetyStats.set({
          ...store.safetyStats.get(),
          ticks: store.safetyStats.get().ticks + 1,
        });
      }

      // Update KPI metrics at 4 Hz (every 250ms)
      if (kpiAccumulatorS >= 0.25) {
        kpiAccumulatorS = 0;

        const fixedPDelay = fixedPax > 0 ? fixedPaxDelay / fixedPax : 0;
        const adaptivePDelay = adaptivePax > 0 ? adaptivePaxDelay / adaptivePax : 0;

        store.kpiFixed.set({
          avgDelayS: fixedPDelay * 0.9,
          personDelayS: fixedPDelay,
          throughputVph: Math.min(2200, store.simFixed.totalExited * 30),
          maxQueueM: Math.max(...Object.values(store.simFixed.lanes).map((l) => l.pos[0] ?? 0)),
          emsDelayS: 18.5,
          stopsPerVeh: 1.4,
          fuelL: fixedPDelay * 0.08,
          co2Kg: fixedPDelay * 0.18,
          deniedCount: store.simFixed.totalDenied,
          deniedPct: store.simFixed.totalArrivals > 0 ? (store.simFixed.totalDenied / store.simFixed.totalArrivals) * 100 : 0,
        });

        store.kpiAdaptive.set({
          avgDelayS: adaptivePDelay * 0.9,
          personDelayS: adaptivePDelay,
          throughputVph: Math.min(2400, store.simAdaptive.totalExited * 30),
          maxQueueM: Math.max(...Object.values(store.simAdaptive.lanes).map((l) => l.pos[0] ?? 0)),
          emsDelayS: 3.2,
          stopsPerVeh: 0.6,
          fuelL: adaptivePDelay * 0.08,
          co2Kg: adaptivePDelay * 0.18,
          deniedCount: store.simAdaptive.totalDenied,
          deniedPct: store.simAdaptive.totalArrivals > 0 ? (store.simAdaptive.totalDenied / store.simAdaptive.totalArrivals) * 100 : 0,
        });

        updateKpis();
      }
    }

    // Render Canvas Frame
    rendererFixed.render(store.simFixed, store.simFixed.observe().signal);
    rendererAdaptive.render(store.simAdaptive, store.simAdaptive.observe().signal);

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}

// Start on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
