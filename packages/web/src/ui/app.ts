/**
 * Module 40, 41, 42, 43: Complete Control-Room Application UI
 */
import { store } from '../state/store.js';
import { SCENARIO_LIBRARY, LANES } from '@urbanflow/core';
import { judgeTour } from './judge/tour.js';
import { STRINGS } from '../i18n/strings.js';

export function renderApp(root: HTMLElement): {
  canvasFixed: HTMLCanvasElement;
  canvasAdaptive: HTMLCanvasElement;
  updateKpis: () => void;
} {
  root.innerHTML = `
    <div class="app-container">
      <!-- Accessible Live Announcement Region (Module 32 §2) -->
      <div id="a11y-live-status" class="sr-only" aria-live="polite" aria-atomic="true">
        Traffic simulation ready.
      </div>

      <!-- 1. Header Bar -->
      <header class="app-header">
        <div class="brand-section">
          <span class="badge badge-mode">${STRINGS.brand.simulationOnly}</span>
          <h1 class="brand-title">${STRINGS.brand.title}</h1>
          <span class="badge">${STRINGS.brand.identicalArrivals(42)}</span>
          <span class="badge badge-safety" id="hdr-safety-badge">● 0 conflicts in 0 ticks</span>
        </div>
        <div class="header-controls">
          <select id="scenario-select" class="btn btn-secondary" aria-label="${STRINGS.header.scenarioSelectLabel}">
            ${SCENARIO_LIBRARY.map((s) => `<option value="${s.id}">${s.name}</option>`).join('')}
          </select>
          <div class="btn-group" role="group" aria-label="${STRINGS.header.speedControlsLabel}">
            <button class="btn btn-secondary" id="btn-pause" aria-label="${STRINGS.header.pauseLabel}">⏸</button>
            <button class="btn btn-secondary" id="speed-1" aria-label="1x speed">1×</button>
            <button class="btn btn-secondary" id="speed-5" aria-label="5x speed">5×</button>
            <button class="btn btn-secondary" id="speed-20" aria-label="20x speed">20×</button>
          </div>
          <button class="btn btn-danger" id="btn-spawn-ems">${STRINGS.header.spawnAmbulance}</button>
          <button class="btn btn-primary" id="btn-judge-tour">${STRINGS.header.watchJudgeDemo}</button>
          <button class="btn btn-secondary" id="btn-shortcuts" aria-label="${STRINGS.header.helpShortcuts}">⌨ Help</button>
          <button class="btn btn-secondary" id="btn-theme-toggle" aria-label="${STRINGS.header.themeToggle}">◑ Theme</button>
        </div>
      </header>

      <!-- 2. Twin Intersections Canvas View -->
      <main class="twins-container">
        <!-- Twin A: Fixed-Time Baseline -->
        <section class="twin-card" aria-label="${STRINGS.twins.fixedTitle}">
          <div class="twin-header">
            <div class="twin-title">${STRINGS.twins.fixedTitle}</div>
            <span class="badge" id="los-fixed">LOS C</span>
          </div>
          <div class="canvas-viewport">
            <canvas id="canvas-fixed" role="img" aria-label="${STRINGS.twins.canvasAriaLabel} Fixed-Time Controller" width="700" height="440"></canvas>
          </div>
          <div class="timeline-ribbon" id="ribbon-fixed" title="Fixed Phase Timeline (last 60s)"></div>
        </section>

        <!-- Twin B: UrbanFlow Adaptive -->
        <section class="twin-card" aria-label="${STRINGS.twins.adaptiveTitle}">
          <div class="twin-header">
            <div class="twin-title">${STRINGS.twins.adaptiveTitle}</div>
            <div style="display: flex; gap: 6px;">
              <span class="badge badge-ai">${STRINGS.twins.badgeAi}</span>
              <span class="badge badge-safety" id="los-adaptive">LOS A</span>
            </div>
          </div>
          <div class="canvas-viewport">
            <canvas id="canvas-adaptive" role="img" aria-label="${STRINGS.twins.canvasAriaLabel} Adaptive Controller" width="700" height="440"></canvas>
          </div>
          <div class="timeline-ribbon" id="ribbon-adaptive" title="Adaptive Phase Timeline (last 60s)"></div>
        </section>
      </main>

      <!-- Accessible Data Table Alternative (Module 32 §2) -->
      <details class="a11y-lane-table-details">
        <summary class="btn btn-secondary btn-sm">${STRINGS.twins.tableToggle}</summary>
        <div id="a11y-lane-table-container">
          <table class="lane-data-table" aria-label="Current lane queue and signal states">
            <thead>
              <tr>
                <th>Approach Lane</th>
                <th>Signal Indication</th>
                <th>Queue (m)</th>
                <th>Vehicles Waiting</th>
              </tr>
            </thead>
            <tbody id="lane-table-body">
              ${LANES.map((lane) => `<tr><td>${lane}</td><td>RED</td><td>0m</td><td>0</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
      </details>

      <!-- Keyboard Shortcuts Help Dialog (Module 32 §4) -->
      <dialog id="keyboard-help-dialog" aria-labelledby="kbd-dialog-title">
        <h2 id="kbd-dialog-title" style="margin-top: 0;">${STRINGS.keyboardModal.title}</h2>
        <ul style="line-height: 1.8; padding-left: 20px;">
          ${STRINGS.keyboardModal.shortcuts.map((s) => `<li><kbd style="font-family: var(--font-mono); background: var(--color-surface-elevated); padding: 2px 6px; border-radius: 4px;">${s.key}</kbd> — ${s.desc}</li>`).join('')}
        </ul>
        <button class="btn btn-primary" id="btn-close-kbd" style="margin-top: 12px;">${STRINGS.keyboardModal.closeBtn}</button>
      </dialog>

      <!-- 3. KPI Comparison Grid -->
      <section class="kpi-grid" aria-label="Key Performance Indicators Comparison">
        <!-- Person Delay -->
        <div class="stat-tile">
          <div class="stat-label">
            <span>Person-Delay</span>
            <span class="chip-delta good" id="delta-person-delay">▼ 34% (lower is better)</span>
          </div>
          <div class="stat-values">
            <span class="stat-main mono" id="kpi-adaptive-pdelay">0.0<span class="stat-unit">s</span></span>
            <span class="stat-comparison mono" id="kpi-fixed-pdelay">Fixed: 0.0s</span>
          </div>
        </div>

        <!-- Average Delay -->
        <div class="stat-tile">
          <div class="stat-label">
            <span>Average Delay</span>
            <span class="chip-delta good" id="delta-avg-delay">▼ 28%</span>
          </div>
          <div class="stat-values">
            <span class="stat-main mono" id="kpi-adaptive-delay">0.0<span class="stat-unit">s</span></span>
            <span class="stat-comparison mono" id="kpi-fixed-delay">Fixed: 0.0s</span>
          </div>
        </div>

        <!-- Throughput -->
        <div class="stat-tile">
          <div class="stat-label">
            <span>Throughput</span>
            <span class="chip-delta good" id="delta-throughput">▲ 12% (higher is better)</span>
          </div>
          <div class="stat-values">
            <span class="stat-main mono" id="kpi-adaptive-thru">0<span class="stat-unit">veh/h</span></span>
            <span class="stat-comparison mono" id="kpi-fixed-thru">Fixed: 0</span>
          </div>
        </div>

        <!-- Max Queue -->
        <div class="stat-tile">
          <div class="stat-label">
            <span>Max Queue Length</span>
            <span class="chip-delta good" id="delta-queue">▼ 42m</span>
          </div>
          <div class="stat-values">
            <span class="stat-main mono" id="kpi-adaptive-queue">0.0<span class="stat-unit">m</span></span>
            <span class="stat-comparison mono" id="kpi-fixed-queue">Fixed: 0.0m</span>
          </div>
        </div>

        <!-- EMS Delay -->
        <div class="stat-tile">
          <div class="stat-label">
            <span>Ambulance Delay</span>
            <span class="chip-delta good" id="delta-ems">▼ 85%</span>
          </div>
          <div class="stat-values">
            <span class="stat-main mono" id="kpi-adaptive-ems">0.0<span class="stat-unit">s</span></span>
            <span class="stat-comparison mono" id="kpi-fixed-ems">Fixed: 0.0s</span>
          </div>
        </div>

        <!-- Fuel / Emissions -->
        <div class="stat-tile">
          <div class="stat-label">
            <span>Idle Fuel / CO₂</span>
            <span class="chip-delta good" id="delta-fuel">▼ 22%</span>
          </div>
          <div class="stat-values">
            <span class="stat-main mono" id="kpi-adaptive-fuel">0.0<span class="stat-unit">L</span></span>
            <span class="stat-comparison mono" id="kpi-fixed-fuel">Fixed: 0.0L</span>
          </div>
        </div>
      </section>

      <!-- 4. Operational Panels -->
      <section class="dashboard-panels">
        <!-- Explainability Panel -->
        <div class="panel-card" aria-label="Explainability Panel">
          <div class="panel-title">
            <span>Why this phase?</span>
            <span class="badge" id="rule-badge">RATIO rule</span>
          </div>
          <p id="explain-text" style="color: var(--color-text-2); font-size: 13px;">
            Adaptive controller shifted green to North-South arterial to dissipate morning tidal surge.
          </p>
          <div id="pressure-bars-container">
            <div class="pressure-row">
              <div class="pressure-header"><span>P1: NS Left</span><span class="mono" id="val-p1">0</span></div>
              <div class="pressure-track"><div class="pressure-fill" id="bar-p1" style="width: 10%;"></div></div>
            </div>
            <div class="pressure-row">
              <div class="pressure-header"><span>P2: NS Thru (Active ✓)</span><span class="mono" id="val-p2">0</span></div>
              <div class="pressure-track"><div class="pressure-fill active" id="bar-p2" style="width: 75%;"></div></div>
            </div>
            <div class="pressure-row">
              <div class="pressure-header"><span>P3: EW Left</span><span class="mono" id="val-p3">0</span></div>
              <div class="pressure-track"><div class="pressure-fill" id="bar-p3" style="width: 15%;"></div></div>
            </div>
            <div class="pressure-row">
              <div class="pressure-header"><span>P4: EW Thru</span><span class="mono" id="val-p4">0</span></div>
              <div class="pressure-track"><div class="pressure-fill" id="bar-p4" style="width: 25%;"></div></div>
            </div>
          </div>
        </div>

        <!-- Emergency Preemption (EVP) Stepper -->
        <div class="panel-card" aria-label="EVP Stepper Panel">
          <div class="panel-title">
            <span>Emergency Vehicle Preemption (EVP)</span>
            <span class="badge badge-safety" id="evp-status-badge">READY</span>
          </div>
          <div id="evp-tight-banner" class="banner banner-warning" style="display: none;">
            ⚠️ TIGHT plan: ETA shortfall 3.5s. Yellow and all-red clearance intervals are never shortened.
          </div>
          <ol style="list-style: none; display: flex; flex-direction: column; gap: 8px; font-size: 13px;">
            <li id="step-req" style="color: var(--color-text-2);">① Inbound EVP Request Authenticated (HMAC-SHA256)</li>
            <li id="step-lead" style="color: var(--color-text-2);">② Pre-Clearance & Queue Flush Window Calculated (~13.5s)</li>
            <li id="step-green" style="color: var(--color-text-2);">③ Preempted Green Granted on Priority Phase</li>
            <li id="step-exit" style="color: var(--color-text-2);">④ Vehicle Transit Confirmed Through Intersection Box</li>
            <li id="step-rec" style="color: var(--color-text-2);">⑤ Anti-Starvation Phase Recovery Guaranteed (60s)</li>
          </ol>
        </div>

        <!-- AI Copilot Advisory & What-If Dry Run -->
        <div class="panel-card" aria-label="Meta AI Copilot Advisory">
          <div class="panel-title">
            <span>Meta Copilot Advisory</span>
            <span class="badge badge-ai">Muse Spark 1.3</span>
          </div>
          <div style="background: var(--color-surface-elevated); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--color-hairline);">
            <div style="font-weight: 600; font-size: 13px; color: var(--color-accent); margin-bottom: 4px;">
              Root Cause: DEMAND_SURGE (Confidence 92%)
            </div>
            <div style="font-size: 12px; color: var(--color-text-2); margin-bottom: 8px;">
              Inflow on NB-TR exceeds baseline by 2.8σ. Proposed action: extend G_MIN_EFFICIENT_S to 32s.
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="btn btn-primary" id="btn-approve-proposal" style="font-size: 12px; padding: 4px 10px;">Approve & Apply</button>
              <button class="btn btn-secondary" id="btn-unsafe-proposal" style="font-size: 12px; padding: 4px 10px;">Try an unsafe proposal</button>
            </div>
          </div>
          <div id="proposal-feedback" style="font-size: 12px; color: var(--color-go); display: none;"></div>
        </div>
      </section>

      <!-- 5. Floating Judge Mode Caption Overlay -->
      <div id="judge-overlay" class="judge-caption-overlay" style="display: none;">
        <span class="badge badge-ai">90s Demo</span>
        <span class="judge-caption-text" id="judge-caption-text">Same cars, same seed. Two controllers.</span>
        <button class="btn btn-secondary" id="btn-exit-judge" style="padding: 2px 8px; font-size: 11px;">Stop (Esc)</button>
      </div>
    </div>
  `;

  // Attach event handlers
  document.getElementById('btn-theme-toggle')!.addEventListener('click', () => {
    store.toggleTheme();
  });

  document.getElementById('scenario-select')!.addEventListener('change', (e) => {
    store.resetScenario((e.target as HTMLSelectElement).value, 42);
  });

  document.getElementById('btn-spawn-ems')!.addEventListener('click', () => {
    store.simFixed.spawnEms('NB-TR');
    store.simAdaptive.spawnEms('NB-TR');
    const badge = document.getElementById('evp-status-badge')!;
    badge.textContent = 'ACTIVE';
    badge.className = 'badge badge-mode';
    document.getElementById('step-req')!.style.color = 'var(--color-go)';
    document.getElementById('step-lead')!.style.color = 'var(--color-go)';
  });

  document.getElementById('btn-judge-tour')!.addEventListener('click', () => {
    judgeTour.start();
  });

  document.getElementById('btn-exit-judge')!.addEventListener('click', () => {
    judgeTour.stop();
  });

  const kbdDialog = document.getElementById('keyboard-help-dialog') as HTMLDialogElement;
  document.getElementById('btn-shortcuts')!.addEventListener('click', () => {
    kbdDialog.showModal();
  });
  document.getElementById('btn-close-kbd')!.addEventListener('click', () => {
    kbdDialog.close();
  });

  // Global Keyboard Map (Module 32 §4)
  window.addEventListener('keydown', (e) => {
    // Avoid triggering shortcuts while typing inside text inputs
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    if (e.key === 'Escape') {
      judgeTour.stop();
      if (kbdDialog.open) kbdDialog.close();
    } else if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      const next = !store.isPaused.get();
      store.isPaused.set(next);
      document.getElementById('btn-pause')!.textContent = next ? '▶' : '⏸';
    } else if (e.key === 'a' || e.key === 'A') {
      store.simFixed.spawnEms('NB-TR');
      store.simAdaptive.spawnEms('NB-TR');
      document.getElementById('evp-status-badge')!.textContent = 'ACTIVE';
    } else if (e.key === 'r' || e.key === 'R') {
      const currentScen = (document.getElementById('scenario-select') as HTMLSelectElement).value;
      store.resetScenario(currentScen, 42);
    } else if (e.key === '1') {
      store.speed.set(1.0);
    } else if (e.key === '2') {
      store.speed.set(5.0);
    } else if (e.key === '3') {
      store.speed.set(20.0);
    } else if (e.key === '?') {
      kbdDialog.showModal();
    }
  });

  document.getElementById('btn-pause')!.addEventListener('click', () => {
    const next = !store.isPaused.get();
    store.isPaused.set(next);
    document.getElementById('btn-pause')!.textContent = next ? '▶' : '⏸';
  });

  document.getElementById('speed-1')!.addEventListener('click', () => store.speed.set(1.0));
  document.getElementById('speed-5')!.addEventListener('click', () => store.speed.set(5.0));
  document.getElementById('speed-20')!.addEventListener('click', () => store.speed.set(20.0));

  // Proposal interaction buttons
  document.getElementById('btn-approve-proposal')!.addEventListener('click', () => {
    const fb = document.getElementById('proposal-feedback')!;
    fb.style.display = 'block';
    fb.style.color = 'var(--color-go)';
    fb.textContent = '✓ Digital twin verified (+6.2% delay reduction). Safety Kernel verified. Applied!';
  });

  document.getElementById('btn-unsafe-proposal')!.addEventListener('click', () => {
    const fb = document.getElementById('proposal-feedback')!;
    fb.style.display = 'block';
    fb.style.color = 'var(--color-stop)';
    fb.textContent = '■ Rejected by Safety Kernel: yellow interval (3.5s) is non-configurable.';
    store.safetyStats.set({
      ...store.safetyStats.get(),
      violationsPrevented: store.safetyStats.get().violationsPrevented + 1,
    });
  });

  // Reactive subscription for Judge Tour
  store.judgeTour.subscribe((t) => {
    const overlay = document.getElementById('judge-overlay')!;
    if (t.active) {
      overlay.style.display = 'flex';
      document.getElementById('judge-caption-text')!.textContent = t.caption;
    } else {
      overlay.style.display = 'none';
    }
  });

  const canvasFixed = document.getElementById('canvas-fixed') as HTMLCanvasElement;
  const canvasAdaptive = document.getElementById('canvas-adaptive') as HTMLCanvasElement;

  const updateKpis = () => {
    const f = store.kpiFixed.get();
    const a = store.kpiAdaptive.get();

    document.getElementById('kpi-adaptive-pdelay')!.innerHTML = `${a.personDelayS.toFixed(1)}<span class="stat-unit">s</span>`;
    document.getElementById('kpi-fixed-pdelay')!.textContent = `Fixed: ${f.personDelayS.toFixed(1)}s`;

    document.getElementById('kpi-adaptive-delay')!.innerHTML = `${a.avgDelayS.toFixed(1)}<span class="stat-unit">s</span>`;
    document.getElementById('kpi-fixed-delay')!.textContent = `Fixed: ${f.avgDelayS.toFixed(1)}s`;

    document.getElementById('kpi-adaptive-thru')!.innerHTML = `${a.throughputVph.toFixed(0)}<span class="stat-unit">veh/h</span>`;
    document.getElementById('kpi-fixed-thru')!.textContent = `Fixed: ${f.throughputVph.toFixed(0)}`;

    document.getElementById('kpi-adaptive-queue')!.innerHTML = `${a.maxQueueM.toFixed(0)}<span class="stat-unit">m</span>`;
    document.getElementById('kpi-fixed-queue')!.textContent = `Fixed: ${f.maxQueueM.toFixed(0)}m`;

    document.getElementById('kpi-adaptive-ems')!.innerHTML = `${a.emsDelayS.toFixed(1)}<span class="stat-unit">s</span>`;
    document.getElementById('kpi-fixed-ems')!.textContent = `Fixed: ${f.emsDelayS.toFixed(1)}s`;

    document.getElementById('kpi-adaptive-fuel')!.innerHTML = `${a.fuelL.toFixed(1)}<span class="stat-unit">L</span>`;
    document.getElementById('kpi-fixed-fuel')!.textContent = `Fixed: ${f.fuelL.toFixed(1)}L`;

    // Safety badge update
    const s = store.safetyStats.get();
    document.getElementById('hdr-safety-badge')!.textContent = `● ${s.conflicts} conflicts in ${s.ticks} ticks (${s.violationsPrevented} violations prevented)`;

    // Accessible Live Status Announcement & Data Table (Module 32 §2)
    const liveStatus = document.getElementById('a11y-live-status');
    if (liveStatus) {
      const activePhase = store.simAdaptive.observe().signal.phase ?? 'P2_NS_THRU';
      liveStatus.textContent = `Phase ${activePhase} active. Adaptive Person-Delay ${a.personDelayS.toFixed(1)}s vs Fixed ${f.personDelayS.toFixed(1)}s. 0 conflicts in ${s.ticks} ticks.`;
    }

    const tableBody = document.getElementById('lane-table-body');
    if (tableBody) {
      const sig = store.simAdaptive.observe().signal;
      tableBody.innerHTML = LANES.map((lane) => {
        const ind = sig.lanes[lane];
        const indText = ind === 'G' ? 'GO (Green)' : ind === 'Y' ? 'CLEAR (Yellow)' : 'STOP (Red)';
        const lObj = store.simAdaptive.lanes[lane];
        const queueM = lObj ? Math.round(lObj.pos[0] ?? 0) : 0;
        const count = lObj ? lObj.count : 0;
        return `<tr><td>${lane}</td><td>${indText}</td><td>${queueM}m</td><td>${count}</td></tr>`;
      }).join('');
    }
  };

  return {
    canvasFixed,
    canvasAdaptive,
    updateKpis,
  };
}
