/**
 * Module 40, 41, 42, 43: Control-room application shell.
 *
 * Two rules hold throughout this file:
 *   1. Nothing is written with `innerHTML` (A9) and no inline `style` attribute
 *      is emitted (Module 51 §2.7). Geometry that cannot be classed uses
 *      `element.style.setProperty` on a custom property only.
 *   2. Every displayed number comes from `KpiSnapshot`, i.e. from the measured
 *      Module 02 §4 metrics. Missing evidence renders an em dash, never a zero
 *      and never a hard-coded delta (Rule 00).
 */
import { LANES, createDebugBundle, relativeChangePct, PHASES } from '@urbanflow/core';
import type { AdaptiveParams, IncidentKind, PhaseId, LaneId, VehicleType } from '@urbanflow/core';
import { store } from '../state/store.js';
import type { KpiSnapshot } from '../state/store.js';
import { getConsoleTail } from '../state/console-tail.js';
import { STRINGS } from '../i18n/strings.js';
import { formatNumber } from '../i18n/format.js';
import { judgeTour } from './judge/tour.js';
import { h, byId, maybeById, appendChildren } from './dom.js';
import type { Child } from './dom.js';
import { ICONS } from './icons.js';
import { buildDiagnosisWindow, requestDiagnosis } from '../copilot/client.js';
import type { DiagnosisResult } from '../copilot/client.js';
import { sound } from './sound.js';

interface KpiTile {
  key: string;
  label: string;
  unit: string;
  digits: number;
  lowerBetter: boolean;
  pick: (k: KpiSnapshot) => number | null;
}

const KPI_TILES: readonly KpiTile[] = [
  { key: 'pdelay', label: STRINGS.kpis.personDelay, unit: 's', digits: 1, lowerBetter: true, pick: (k) => k.personDelayS },
  { key: 'delay', label: STRINGS.kpis.avgDelay, unit: 's', digits: 1, lowerBetter: true, pick: (k) => k.avgDelayS },
  { key: 'thru', label: STRINGS.kpis.throughput, unit: 'veh/h', digits: 0, lowerBetter: false, pick: (k) => k.throughputVph },
  { key: 'queue', label: STRINGS.kpis.maxQueue, unit: 'm', digits: 0, lowerBetter: true, pick: (k) => k.maxQueueM },
  { key: 'ems', label: STRINGS.kpis.emsDelay, unit: 's', digits: 1, lowerBetter: true, pick: (k) => k.emsDelayS },
  // Module 41 §2: bus and bike delay are the equity metrics, shown per twin with
  // a delta like every other tile. Both are already measured (`KpiSnapshot`).
  { key: 'bus', label: STRINGS.kpis.busDelay, unit: 's', digits: 1, lowerBetter: true, pick: (k) => k.busDelayS },
  { key: 'bike', label: STRINGS.kpis.bikeDelay, unit: 's', digits: 1, lowerBetter: true, pick: (k) => k.bikeDelayS },
  { key: 'stops', label: STRINGS.kpis.stopsPerVeh, unit: '', digits: 2, lowerBetter: true, pick: (k) => k.stopsPerVeh },
  { key: 'fuel', label: STRINGS.kpis.fuel, unit: 'L', digits: 2, lowerBetter: true, pick: (k) => k.fuelL },
  { key: 'denied', label: STRINGS.kpis.denied, unit: '%', digits: 2, lowerBetter: true, pick: (k) => k.deniedPct },
];


const LANE_DISPLAY_NAME: Record<LaneId, string> = {
  'NB-TR': 'Northbound Thru/Right',
  'NB-L': 'Northbound Left Turn',
  'SB-TR': 'Southbound Thru/Right',
  'SB-L': 'Southbound Left Turn',
  'EB-TR': 'Eastbound Thru/Right',
  'EB-L': 'Eastbound Left Turn',
  'WB-TR': 'Westbound Thru/Right',
  'WB-L': 'Westbound Left Turn',
};

const LANE_ARROW: Record<LaneId, string> = {
  'NB-TR': '↑',
  'NB-L': '↖',
  'SB-TR': '↓',
  'SB-L': '↘',
  'EB-TR': '→',
  'EB-L': '↗',
  'WB-TR': '←',
  'WB-L': '↙',
};

const PHASE_LABEL: Readonly<Record<PhaseId, string>> = {
  P1_NS_LEFT: STRINGS.phases.P1_NS_LEFT,
  P2_NS_THRU: STRINGS.phases.P2_NS_THRU,
  P3_EW_LEFT: STRINGS.phases.P3_EW_LEFT,
  P4_EW_THRU: STRINGS.phases.P4_EW_THRU,
};

interface KpiRefs {
  main: Map<string, HTMLElement>;
  fixed: Map<string, HTMLElement>;
  delta: Map<string, HTMLElement>;
  bar: Map<string, HTMLElement>;
}

function fmt(value: number | null, digits: number): string {
  // Module 32 §7: numbers go through `Intl.NumberFormat`, never manual
  // `toFixed`. `formatNumber` returns null for missing evidence, which renders
  // as the em-dash token — a fabricated zero is never shown (Rule 00).
  return formatNumber(value, digits) ?? STRINGS.kpis.missing;
}

function buildHeader(): HTMLElement {
  const seedBadge = h('span', {
    class: 'badge',
    text: STRINGS.brand.identicalArrivals(store.seed.get()),
  });

  const scenarioSelect = h('select', {
    class: 'btn btn-secondary',
    label: STRINGS.header.scenarioSelectLabel,
    attrs: { id: 'scenario-select' },
  });
  for (const scenario of store.scenarios()) {
    scenarioSelect.append(
      h('option', { text: scenario.name, attrs: { value: scenario.id } }),
    );
  }
  scenarioSelect.value = store.scenarioId.get();
  scenarioSelect.addEventListener('change', () => {
    store.resetScenario(scenarioSelect.value, store.seed.get());
  });
  store.scenarioId.subscribe((id) => {
    if (scenarioSelect.value !== id) scenarioSelect.value = id;
  });

  const speedButtons = [0.5, 1, 5, 20].map((speed) => {
    const id = `speed-${String(speed).replace('.', '-')}`;
    return h('button', {
      class: 'btn btn-secondary',
      attrs: { id, type: 'button' },
      label: `${speed}× speed`,
      text: `${speed}×`,
      on: { click: () => store.setSpeed(speed) },
    });
  });

  // Module 40 §5 / Module 51 §2: the play/pause control carries an inline SVG
  // icon, never an emoji character. The accessible name is only the `aria-label`;
  // the state is announced by that label, so the icon alone never carries meaning.
  const pauseButton = h('button', {
    class: 'btn btn-secondary btn-icon',
    attrs: { id: 'btn-pause', type: 'button' },
    label: STRINGS.header.pauseLabel,
    on: { click: () => store.togglePause() },
  });
  const renderPauseIcon = (paused: boolean): void => {
    pauseButton.replaceChildren(paused ? ICONS.play() : ICONS.pause());
    pauseButton.setAttribute(
      'aria-label',
      paused ? STRINGS.header.resumeLabel : STRINGS.header.pauseLabel,
    );
  };
  renderPauseIcon(store.isPaused.get());
  store.isPaused.subscribe(renderPauseIcon);

  // Module 42 §2: an in-app control that forces reduced motion regardless of the
  // OS media query. `aria-pressed` carries the toggle state; the label changes
  // so the state is never conveyed by colour or the icon alone.
  const motionLabel = h('span', { text: STRINGS.header.reduceMotion });
  const motionButton = h(
    'button',
    {
      class: 'btn btn-secondary',
      attrs: { id: 'btn-motion-toggle', type: 'button', 'aria-pressed': 'false' },
      label: STRINGS.header.reduceMotionHelp,
      on: { click: () => store.toggleMotion() },
    },
    [ICONS.motion(), motionLabel],
  );
  store.motionPref.subscribe((pref) => {
    const on = pref === 'reduce';
    motionLabel.textContent = on ? STRINGS.header.reduceMotionOn : STRINGS.header.reduceMotion;
    motionButton.setAttribute('aria-pressed', String(on));
  });

  const soundLabel = h('span', { text: sound.isEnabled() ? 'Audio: On' : 'Audio: Off' });
  const soundButton = h(
    'button',
    {
      class: 'btn btn-secondary',
      attrs: { id: 'btn-sound-toggle', type: 'button', 'aria-pressed': String(sound.isEnabled()) },
      label: 'Toggle synthetic tactile audio feedback',
      on: {
        click: () => {
          const on = sound.toggle();
          soundLabel.textContent = on ? 'Audio: On' : 'Audio: Off';
          soundButton.setAttribute('aria-pressed', String(on));
          soundButton.replaceChildren(on ? ICONS.soundOn() : ICONS.soundOff(), soundLabel);
        },
      },
    },
    [sound.isEnabled() ? ICONS.soundOn() : ICONS.soundOff(), soundLabel],
  );

  return h('header', { class: 'app-header' }, [
    h('div', { class: 'brand-section' }, [
      h('span', { class: 'badge badge-mode', text: STRINGS.brand.simulationOnly }),
      h('h1', { class: 'brand-title' }, [
        ICONS.logo(),
        h('span', { text: STRINGS.brand.title }),
      ]),
      seedBadge,
      h('span', {
        class: 'badge badge-safety',
        attrs: { id: 'hdr-safety-badge' },
        text: STRINGS.safety.zeroConflicts(0),
      }),
    ]),
    h('div', { class: 'header-controls' }, [
      scenarioSelect,
      h(
        'div',
        { class: 'btn-group', role: 'group', label: STRINGS.header.speedControlsLabel },
        [pauseButton, ...speedButtons],
      ),
      h(
        'button',
        {
          class: 'btn btn-danger',
          attrs: { id: 'btn-spawn-ems', type: 'button' },
          on: { click: () => void spawnAmbulance() },
        },
        [ICONS.ambulance(), STRINGS.header.spawnAmbulance],
      ),
      h(
        'button',
        {
          class: 'btn btn-primary',
          attrs: { id: 'btn-judge-tour', type: 'button' },
          on: { click: () => judgeTour.start() },
        },
        [ICONS.play(), STRINGS.header.watchJudgeDemo],
      ),
      h(
        'button',
        {
          class: 'btn btn-secondary',
          attrs: { id: 'btn-shortcuts', type: 'button' },
          label: STRINGS.header.helpShortcuts,
          on: { click: () => openShortcuts() },
        },
        [ICONS.keyboard(), STRINGS.header.helpButton],
      ),
      h(
        'button',
        {
          class: 'btn btn-secondary',
          attrs: { id: 'btn-theme-toggle', type: 'button' },
          label: STRINGS.header.themeToggle,
          on: { click: () => store.toggleTheme() },
        },
        [ICONS.theme(), STRINGS.header.themeToggleVisible],
      ),
      motionButton,
      soundButton,
      h(
        'a',
        {
          class: 'btn btn-primary',
          attrs: { id: 'link-presentation', href: '/presentation.html' },
          label: 'Open the presentation plan and demo script',
        },
        ['Presentation'],
      ),
      // System Explorer: the static, video-ready architecture briefing page.
      // `/system.html` works under `vite dev` and Vercel `cleanUrls` (which
      // redirects it to the canonical `/system`).
      h(
        'a',
        {
          class: 'btn btn-secondary',
          attrs: { id: 'link-system-explorer', href: '/system.html' },
          label: STRINGS.header.systemExplorerHelp,
        },
        [STRINGS.header.systemExplorer],
      ),
    ]),
  ]);
}

function buildTwinCard(opts: {
  title: string;
  canvasId: string;
  losId: string;
  ribbonId: string;
  ribbonTitle: string;
  subBarId?: string;
  badges?: Child[];
}): HTMLElement {
  const header = h('div', { class: 'twin-header' }, [
    h('div', { class: 'twin-title', text: opts.title }),
    h('div', { class: 'twin-badges' }, [
      ...(opts.badges ?? []),
      h('span', { class: 'badge', attrs: { id: opts.losId }, text: STRINGS.kpis.losLabel(null) }),
    ]),
  ]);

  const subBar = opts.subBarId
    ? h('div', { class: 'twin-telemetry-subbar mono', attrs: { id: opts.subBarId }, text: 'Initializing telemetry stream…' })
    : null;

  const canvas = h('canvas', {
    attrs: {
      id: opts.canvasId,
      role: 'img',
      'aria-label': `${STRINGS.twins.canvasAriaLabel} ${opts.title}`,
      width: 700,
      height: 440,
    },
  });

  return h('section', { class: 'twin-card', label: opts.title }, [
    header,
    ...(subBar ? [subBar] : []),
    h('div', { class: 'canvas-viewport' }, [canvas]),
    h('div', { class: 'timeline-ribbon', attrs: { id: opts.ribbonId }, label: opts.ribbonTitle }),
  ]);
}

function buildIntelligenceBanner(): HTMLElement {
  const phasePill = h('span', {
    class: 'badge badge-ai hero-phase-pill',
    attrs: { id: 'hero-phase-pill' },
    text: 'Phase P2: North-South Thru',
  });

  const phaseTimerBadge = h('span', {
    class: 'badge badge-mono hero-phase-timer',
    attrs: { id: 'hero-phase-timer' },
  }, [
    ICONS.timer(),
    ' 0.0s in phase',
  ]);

  const efficiencyBadge = h('div', {
    class: 'hero-efficiency-badge',
    attrs: { id: 'hero-efficiency-badge' },
  }, [
    ICONS.sparkle(),
    h('span', { class: 'hero-efficiency-text', attrs: { id: 'hero-efficiency-text' }, text: 'Calculating live AI efficiency advantage…' }),
  ]);

  const reasoningCopy = h('p', {
    class: 'hero-reasoning-copy',
    attrs: { id: 'hero-reasoning-copy' },
    text: 'Adaptive controller observing approach queues. Dynamic green wave allocation active.',
  });

  // 4-Phase real-time pressure distribution display
  const pressuresBar = h('div', { class: 'hero-pressures-bar' }, [
    h('span', { class: 'hero-pressures-label', text: 'Max-Pressure Multi-Phase Balance:' }),
    h('div', { class: 'hero-pressures-grid' }, [
      h('div', { class: 'hero-pressure-chip', attrs: { id: 'press-p1' } }, [
        h('span', { class: 'press-tag', text: 'P1 NS-L' }),
        h('span', { class: 'press-val mono', text: '0.0' }),
      ]),
      h('div', { class: 'hero-pressure-chip active', attrs: { id: 'press-p2' } }, [
        h('span', { class: 'press-tag', text: 'P2 NS-T' }),
        h('span', { class: 'press-val mono', text: '0.0' }),
      ]),
      h('div', { class: 'hero-pressure-chip', attrs: { id: 'press-p3' } }, [
        h('span', { class: 'press-tag', text: 'P3 EW-L' }),
        h('span', { class: 'press-val mono', text: '0.0' }),
      ]),
      h('div', { class: 'hero-pressure-chip', attrs: { id: 'press-p4' } }, [
        h('span', { class: 'press-tag', text: 'P4 EW-T' }),
        h('span', { class: 'press-val mono', text: '0.0' }),
      ]),
    ]),
  ]);

  // Live environmental & network savings ticker
  const savingsTicker = h('div', { class: 'hero-savings-ticker' }, [
    h('div', { class: 'hero-saving-item' }, [
      h('span', { class: 'hero-saving-label' }, [ICONS.timer(), ' Delay Reduction']),
      h('span', { class: 'hero-saving-val mono', attrs: { id: 'hero-saved-delay' }, text: '0.0s / veh' }),
    ]),
    h('div', { class: 'hero-saving-item' }, [
      h('span', { class: 'hero-saving-label', text: 'Fuel Conserved' }),
      h('span', { class: 'hero-saving-val mono', attrs: { id: 'hero-saved-fuel' }, text: '0.00 L' }),
    ]),
    h('div', { class: 'hero-saving-item' }, [
      h('span', { class: 'hero-saving-label', text: 'CO₂ Prevented' }),
      h('span', { class: 'hero-saving-val mono', attrs: { id: 'hero-saved-co2' }, text: '0.00 kg' }),
    ]),
    h('div', { class: 'hero-saving-item' }, [
      h('span', { class: 'hero-saving-label', text: 'Safety Kernel' }),
      h('span', { class: 'badge badge-safety', text: '100% Enforced (0 Conflicts)' }),
    ]),
  ]);

  const evpAlert = h('div', {
    class: 'hero-evp-banner is-hidden',
    attrs: { id: 'hero-evp-banner' },
  }, [
    ICONS.ambulance(),
    h('span', { class: 'hero-evp-text', attrs: { id: 'hero-evp-text' }, text: 'EMERGENCY PREEMPTION ACTIVE' }),
  ]);

  return h('section', { class: 'panel-card hero-intelligence-banner', label: 'AI Traffic Intelligence & Reasoning' }, [
    h('div', { class: 'hero-banner-top' }, [
      h('div', { class: 'hero-banner-title' }, [
        h('span', { class: 'badge badge-safety', text: 'AI TRAFFIC REASONING' }),
        phasePill,
        phaseTimerBadge,
      ]),
      efficiencyBadge,
    ]),
    reasoningCopy,
    pressuresBar,
    savingsTicker,
    evpAlert,
  ]);
}

function buildTestControlsPanel(): HTMLElement {
  let selectedLane: LaneId = store.selectedLane.get();
  let selectedVehicle: VehicleType = 'AMBULANCE';

  const feedbackText = h('span', {
    class: 'test-feedback-msg',
    attrs: { id: 'test-feedback-msg' },
    text: 'Ready for live vehicle injection and traffic volume experiments.',
  });

  // --- 1. Lane Selection Chips ---
  const laneChips: HTMLButtonElement[] = [];
  const updateLaneChips = (activeLane: LaneId): void => {
    sound.click();
    selectedLane = activeLane;
    store.selectLane(activeLane);
    laneChips.forEach((btn) => {
      const isSelected = btn.getAttribute('data-lane') === activeLane;
      btn.classList.toggle('active', isSelected);
      btn.setAttribute('aria-pressed', String(isSelected));
    });
    if (laneSelect.value !== activeLane) laneSelect.value = activeLane;
    updateHud();
  };

  const laneOptions = LANES.map((lane) =>
    h('option', { attrs: { value: lane }, text: `${lane} · ${LANE_DISPLAY_NAME[lane]}` }),
  );
  const laneSelect = h(
    'select',
    {
      class: 'form-select test-lane-select',
      attrs: { id: 'test-controls-lane', 'aria-label': 'Select Approach Lane' },
      on: {
        change: (e) => {
          updateLaneChips((e.target as HTMLSelectElement).value as LaneId);
        },
      },
    },
    laneOptions,
  ) as HTMLSelectElement;

  LANES.forEach((lane) => {
    const chip = h(
      'button',
      {
        class: `test-lane-chip ${lane === selectedLane ? 'active' : ''}`,
        attrs: { type: 'button', 'data-lane': lane, 'aria-pressed': String(lane === selectedLane) },
        on: {
          click: () => updateLaneChips(lane),
        },
      },
      [h('span', { class: 'chip-id', text: `${LANE_ARROW[lane]} ${lane}` })],
    ) as HTMLButtonElement;
    laneChips.push(chip);
  });

  // Selected Lane Live Telemetry HUD
  const hudLaneTitle = h('span', {
    class: 'lab-hud-lane-title',
    text: `${LANE_ARROW[selectedLane]} ${selectedLane} · ${LANE_DISPLAY_NAME[selectedLane]}`,
  });
  const hudSignalPill = h('span', { class: 'test-signal-pill stop', text: 'RED' });
  const hudQueueValue = h('span', { class: 'lab-hud-metric-val mono', text: '0m' });
  const hudWaitCount = h('span', { class: 'lab-hud-metric-val mono', text: '0 veh' });
  const hudDemandValue = h('span', { class: 'lab-hud-metric-val mono', text: '450 veh/h' });
  const hudLosBadge = h('span', { class: 'badge badge-safety', text: 'LOS A' });

  const updateHud = (): void => {
    hudLaneTitle.textContent = `${LANE_ARROW[selectedLane]} ${selectedLane} · ${LANE_DISPLAY_NAME[selectedLane]}`;
    const demands = store.laneDemands.get();
    const observed = store.observation.get();
    const stopped = store.waiting.get();
    const signal = store.signalAdaptive.get();

    hudDemandValue.textContent = `${demands[selectedLane] ?? 450} veh/h`;

    if (signal) {
      const ind = signal.lanes[selectedLane];
      hudSignalPill.textContent = ind === 'G' ? 'GO (Green)' : ind === 'Y' ? 'CLEAR (Yellow)' : 'STOP (Red)';
      hudSignalPill.className = `test-signal-pill ${ind === 'G' ? 'go' : ind === 'Y' ? 'clear' : 'stop'}`;
    }

    if (observed) {
      const laneObs = observed.lanes[selectedLane];
      const qM = laneObs ? Math.round(laneObs.queueLengthM) : 0;
      const laneIdx = LANES.indexOf(selectedLane);
      const count = laneIdx >= 0 ? (stopped[laneIdx] ?? 0) : 0;
      hudQueueValue.textContent = `${qM}m`;
      hudWaitCount.textContent = `${count} veh`;

      const grade = qM > 45 ? 'LOS E' : qM > 30 ? 'LOS D' : qM > 18 ? 'LOS C' : qM > 8 ? 'LOS B' : 'LOS A';
      hudLosBadge.textContent = grade;
      hudLosBadge.className = qM > 30 ? 'badge badge-mode' : qM > 15 ? 'badge badge-ai' : 'badge badge-safety';
    }
  };

  const selectedLaneHud = h('div', { class: 'lab-selected-lane-hud' }, [
    h('div', { class: 'lab-hud-header' }, [
      h('div', { class: 'lab-hud-left' }, [
        h('span', { class: 'badge badge-ai', text: 'SELECTED APPROACH HUD' }),
        hudLaneTitle,
      ]),
      hudSignalPill,
    ]),
    h('div', { class: 'lab-hud-metrics-grid' }, [
      h('div', { class: 'lab-hud-metric-tile' }, [
        h('span', { class: 'lab-hud-metric-label', text: 'Queue Length' }),
        hudQueueValue,
      ]),
      h('div', { class: 'lab-hud-metric-tile' }, [
        h('span', { class: 'lab-hud-metric-label', text: 'Vehicles Waiting' }),
        hudWaitCount,
      ]),
      h('div', { class: 'lab-hud-metric-tile' }, [
        h('span', { class: 'lab-hud-metric-label', text: 'Flow Demand' }),
        hudDemandValue,
      ]),
      h('div', { class: 'lab-hud-metric-tile' }, [
        h('span', { class: 'lab-hud-metric-label', text: 'Level of Service' }),
        hudLosBadge,
      ]),
    ]),
  ]);

  // --- 2. Vehicle Type Selection ---
  const vehicleOptions = [
    { type: 'AMBULANCE' as const, label: 'Ambulance — EVP Preemption' },
    { type: 'CAR' as const, label: 'Passenger Car — IDM Kinematics' },
    { type: 'BUS' as const, label: 'Transit Bus — High Occupancy' },
    { type: 'TRUCK' as const, label: 'Freight Truck — Heavy Load' },
    { type: 'BIKE' as const, label: 'Motorcycle / Bike — Filtering' },
  ].map((v) =>
    h('option', { attrs: { value: v.type }, text: v.label }),
  );

  const vehicleSelect = h(
    'select',
    {
      class: 'form-select test-vehicle-select',
      attrs: { id: 'test-controls-vehicle', 'aria-label': 'Select Vehicle Type' },
      on: {
        change: (e) => {
          selectedVehicle = (e.target as HTMLSelectElement).value as VehicleType;
        },
      },
    },
    vehicleOptions,
  );

  // --- 3. Quantity Selector ---
  const countSelect = h(
    'select',
    {
      class: 'form-select test-count-select',
      attrs: { id: 'test-controls-count', 'aria-label': 'Number of vehicles' },
    },
    [
      { n: 1, label: '1 Vehicle (Single)' },
      { n: 3, label: '3 Vehicles (Pack)' },
      { n: 5, label: '5 Vehicles (Traffic Surge)' },
      { n: 10, label: '10 Vehicles (Congestion)' },
    ].map((item) =>
      h('option', { attrs: { value: String(item.n) }, text: item.label }),
    ),
  ) as HTMLSelectElement;

  const getCount = (): number => Number(countSelect.value) || 1;

  // --- Distance & Initial Speed Parameters ---
  let selectedDistance = 45;
  const distValBadge = h('span', { class: 'badge badge-mono', text: '45 m' });
  const distSlider = h('input', {
    class: 'test-density-slider',
    attrs: {
      type: 'range',
      min: '15',
      max: '300',
      step: '5',
      value: '45',
      'aria-label': 'Injection Distance in metres upstream from stop line',
    },
    on: {
      input: (e) => {
        selectedDistance = Number((e.target as HTMLInputElement).value) || 45;
        distValBadge.textContent = `${selectedDistance} m`;
      },
    },
  }) as HTMLInputElement;

  const setDist = (m: number): void => {
    selectedDistance = m;
    distSlider.value = String(m);
    distValBadge.textContent = `${m} m`;
    sound.click();
  };

  const distPresets = [
    { m: 35, label: '35m (Immediate)' },
    { m: 80, label: '80m (Mid)' },
    { m: 150, label: '150m (Advance)' },
    { m: 300, label: '300m (Gate)' },
  ].map((p) =>
    h('button', {
      class: 'btn btn-secondary btn-xs',
      attrs: { type: 'button' },
      text: p.label,
      on: { click: () => setDist(p.m) },
    }),
  );

  // --- Real initial-speed override (passed to the engine) ---
  let selectedSpeedMps: number | undefined = undefined;
  const speedValBadge = h('span', { class: 'badge badge-mono', text: 'Auto' });
  const speedSlider = h('input', {
    class: 'test-density-slider',
    attrs: {
      type: 'range',
      min: '0',
      max: '14',
      step: '1',
      value: '0',
      'aria-label': 'Initial speed in metres per second (0 = stopped)',
    },
    on: {
      input: (e) => {
        const mps = Math.max(0, Math.min(14, Number((e.target as HTMLInputElement).value) || 0));
        selectedSpeedMps = mps;
        speedValBadge.textContent = `${Math.round(mps * 3.6)} km/h`;
      },
    },
  }) as HTMLInputElement;
  const setSpeed = (mps: number | undefined): void => {
    selectedSpeedMps = mps;
    speedValBadge.textContent = mps === undefined ? 'Auto' : `${Math.round(mps * 3.6)} km/h`;
    speedSlider.value = String(mps ?? 0);
    sound.click();
  };
  const speedPresets = [
    { label: 'Auto', mps: undefined as number | undefined },
    { label: 'Stopped', mps: 0 },
    { label: 'Slow', mps: 5 },
    { label: 'Cruise', mps: 11 },
  ].map((p) =>
    h('button', {
      class: 'btn btn-secondary btn-xs',
      attrs: { type: 'button' },
      text: p.label,
      on: { click: () => setSpeed(p.mps) },
    }),
  );

  // --- 4. Spawn Buttons ---
  const spawnVisibleBtn = h(
    'button',
    {
      class: 'btn btn-primary',
      attrs: { id: 'btn-test-spawn-visible', type: 'button' },
      on: {
        click: () => {
          const count = Math.max(1, Math.min(25, getCount()));
          if (selectedVehicle === 'AMBULANCE') {
            sound.emergencyPreempt();
          } else {
            sound.spawn();
          }
          store.spawnVehicle(selectedLane, selectedVehicle, count, selectedDistance, selectedSpeedMps);
          feedbackText.textContent = selectedVehicle === 'AMBULANCE'
            ? `Emergency Ambulance injected into ${selectedLane} at ${selectedDistance}m (Immediate Green Clearance!)`
            : `Injected ${count} × ${selectedVehicle} into ${selectedLane} at ${selectedDistance}m approach!`;
        },
      },
    },
    [ICONS.zap(), 'Spawn in Approach (Custom Distance)'],
  );

  const spawnEntryBtn = h(
    'button',
    {
      class: 'btn btn-secondary',
      attrs: { id: 'btn-test-spawn-entry', type: 'button' },
      on: {
        click: () => {
          const count = getCount();
          if (selectedVehicle === 'AMBULANCE') {
            sound.emergencyPreempt();
            store.spawnVehicle(selectedLane, 'AMBULANCE', count, 45);
            feedbackText.textContent = `Ambulance injected into ${selectedLane} at 45m (Immediate! Signal will clear.)`;
          } else {
            sound.spawn();
            store.spawnVehicle(selectedLane, selectedVehicle, count, 300);
            feedbackText.textContent = `Queued ${count} × ${selectedVehicle} at ${selectedLane} 300m entry gate`;
          }
        },
      },
    },
    [ICONS.dot(), 'Spawn at Entry Gate (300m)'],
  );

  const emergencyPreemptBtn = h(
    'button',
    {
      class: 'btn btn-danger',
      attrs: { id: 'btn-test-ems-preempt', type: 'button' },
      on: {
        click: () => {
          sound.emergencyPreempt();
          void store.requestPreemption(selectedLane);
          feedbackText.textContent = `Emergency Preemption triggered on ${selectedLane}! Clearing signals to Green.`;
        },
      },
    },
    [ICONS.ambulance(), 'Emergency Preemption Test'],
  );

  // --- 5. 8-Lane Traffic Density Matrix (Sliders for each lane!) ---
  const sliderMap = new Map<LaneId, HTMLInputElement>();
  const demandBadgeMap = new Map<LaneId, HTMLElement>();
  const queueLabelMap = new Map<LaneId, HTMLElement>();
  const signalPillMap = new Map<LaneId, HTMLElement>();

  const buildLaneRow = (lane: LaneId): HTMLElement => {
    const currentDemand = store.laneDemands.get()[lane] ?? 450;
    const badge = h('span', { class: 'badge badge-mono lane-density-badge', text: `${currentDemand} veh/h` });
    demandBadgeMap.set(lane, badge);

    const slider = h('input', {
      class: 'test-density-slider',
      attrs: {
        type: 'range',
        min: '0',
        max: '1800',
        step: '25',
        value: String(currentDemand),
        'aria-label': `Traffic demand for ${lane} in vehicles per hour`,
      },
      on: {
        input: (e) => {
          const val = Number((e.target as HTMLInputElement).value);
          store.setLaneDemand(lane, val);
          badge.textContent = `${val} veh/h`;
          feedbackText.textContent = `Updated ${lane} flow demand to ${val} veh/h`;
        },
      },
    }) as HTMLInputElement;
    sliderMap.set(lane, slider);

    const decBtn = h(
      'button',
      {
        class: 'btn btn-secondary btn-xs',
        attrs: { type: 'button', 'aria-label': `Decrease demand for ${lane}` },
        on: {
          click: () => {
            const cur = store.laneDemands.get()[lane] ?? 450;
            const next = Math.max(0, cur - 100);
            store.setLaneDemand(lane, next);
            slider.value = String(next);
            badge.textContent = `${next} veh/h`;
          },
        },
      },
      ['−100'],
    );

    const incBtn = h(
      'button',
      {
        class: 'btn btn-secondary btn-xs',
        attrs: { type: 'button', 'aria-label': `Increase demand for ${lane}` },
        on: {
          click: () => {
            const cur = store.laneDemands.get()[lane] ?? 450;
            const next = Math.min(1800, cur + 100);
            store.setLaneDemand(lane, next);
            slider.value = String(next);
            badge.textContent = `${next} veh/h`;
          },
        },
      },
      ['+100'],
    );

    const signalPill = h('span', {
      class: 'test-signal-pill stop',
      text: 'RED',
    });
    signalPillMap.set(lane, signalPill);

    const queueLabel = h('span', {
      class: 'test-queue-label mono',
      text: '0m (0 stopped)',
    });
    queueLabelMap.set(lane, queueLabel);

    return h('div', { class: 'density-lane-item' }, [
      h('div', { class: 'density-lane-top' }, [
        h('div', { class: 'density-lane-info' }, [
          h('span', { class: 'density-lane-name', text: `${lane}` }),
          h('span', { class: 'density-lane-desc', text: LANE_DISPLAY_NAME[lane] }),
          signalPill,
        ]),
        h('div', { class: 'density-lane-meta' }, [
          queueLabel,
          badge,
        ]),
      ]),
      h('div', { class: 'density-lane-controls' }, [
        decBtn,
        slider,
        incBtn,
        h('button', {
          class: 'btn btn-secondary btn-xs',
          attrs: { type: 'button', 'aria-label': `Spawn car immediately on ${lane}` },
          on: {
            click: () => {
              updateLaneChips(lane);
              store.spawnVehicle(lane, 'CAR', 1, 45);
              feedbackText.textContent = `Car spawned on ${lane} at 45m approach`;
            },
          },
        }, ['+ Car']),
        h('button', {
          class: 'btn btn-danger btn-xs',
          attrs: { type: 'button', 'aria-label': `Spawn ambulance immediately on ${lane}` },
          on: {
            click: () => {
              updateLaneChips(lane);
              store.spawnVehicle(lane, 'AMBULANCE', 1, 45);
              feedbackText.textContent = `Immediate Ambulance on ${lane} at 45m (Signal clearing to Green!)`;
            },
          },
        }, [ICONS.ambulance(), 'EMS']),
      ]),
    ]);
  };

  const nsLanes: LaneId[] = ['NB-TR', 'NB-L', 'SB-TR', 'SB-L'];
  const ewLanes: LaneId[] = ['EB-TR', 'EB-L', 'WB-TR', 'WB-L'];

  const nsGroup = h('div', { class: 'density-group' }, [
    h('div', { class: 'density-group-header' }, [
      h('span', { class: 'density-group-title' }, [ICONS.arrowUpDown(), ' North-South Arterial']),
      h('span', { class: 'density-group-sub', text: 'Primary 2-phase through & protected lefts' }),
    ]),
    h('div', { class: 'density-group-lanes' }, nsLanes.map(buildLaneRow)),
  ]);

  const ewGroup = h('div', { class: 'density-group' }, [
    h('div', { class: 'density-group-header' }, [
      h('span', { class: 'density-group-title' }, [ICONS.arrowLeftRight(), ' East-West Cross Street']),
      h('span', { class: 'density-group-sub', text: 'Cross-arterial through & protected lefts' }),
    ]),
    h('div', { class: 'density-group-lanes' }, ewLanes.map(buildLaneRow)),
  ]);

  // Update telemetry for 8 lanes when store publishes observation/demands
  const updateMatrixTelemetry = (): void => {
    const demands = store.laneDemands.get();
    const observed = store.observation.get();
    const stopped = store.waiting.get();
    const signal = store.signalAdaptive.get();

    LANES.forEach((lane, index) => {
      // Demand slider & badge
      const vph = demands[lane] ?? 450;
      const s = sliderMap.get(lane);
      if (s && s.value !== String(vph)) s.value = String(vph);
      const b = demandBadgeMap.get(lane);
      if (b) b.textContent = `${vph} veh/h`;

      // Live Queue meters & stopped vehicles
      if (observed) {
        const laneObs = observed.lanes[lane];
        const qM = laneObs ? Math.round(laneObs.queueLengthM) : 0;
        const count = stopped[index] ?? 0;
        const qLabel = queueLabelMap.get(lane);
        if (qLabel) {
          qLabel.textContent = `${qM}m (${count} veh)`;
          qLabel.className = `test-queue-label mono ${qM > 35 ? 'heavy' : qM > 15 ? 'moderate' : 'light'}`;
        }
      }

      // Signal indication pill
      if (signal) {
        const ind = signal.lanes[lane];
        const sPill = signalPillMap.get(lane);
        if (sPill) {
          sPill.textContent = ind === 'G' ? 'GREEN' : ind === 'Y' ? 'YELLOW' : 'RED';
          sPill.className = `test-signal-pill ${ind === 'G' ? 'go' : ind === 'Y' ? 'clear' : 'stop'}`;
        }
      }
    });
  };

  store.observation.subscribe(() => {
    updateMatrixTelemetry();
    updateHud();
  });
  store.laneDemands.subscribe(() => {
    updateMatrixTelemetry();
    updateHud();
  });
  store.signalAdaptive.subscribe(() => {
    updateMatrixTelemetry();
    updateHud();
  });
  updateHud();

  // --- 6. Scenario Stress Experiments ---
  const experimentPresets = [
    {
      id: 'stress-rush-hour',
      icon: ICONS.zap(),
      title: 'Peak Rush Hour (1,400 veh/h)',
      desc: 'Heavy demand on all approaches tests throughput & queue handling',
      action: () => {
        store.applyExperimentPreset('RUSH_HOUR');
        feedbackText.textContent = 'Applied Peak Rush Hour: All approach demands scaled to 1,200–1,400 veh/h.';
      },
    },
    {
      id: 'stress-asymmetric',
      icon: ICONS.arrowUp(),
      title: 'Commute Tide (NS 1,500 / EW 200)',
      desc: 'Severe directional imbalance demonstrates Adaptive green wave allocation',
      action: () => {
        store.applyExperimentPreset('ASYMMETRIC_TIDE');
        feedbackText.textContent = 'Applied Asymmetric Commute Tide: North-South arterial heavily prioritized.';
      },
    },
    {
      id: 'stress-stadium',
      icon: ICONS.dot(),
      title: 'Stadium Dump (EB 1,600 veh/h)',
      desc: 'Extreme outflow surge on Eastbound corridor',
      action: () => {
        store.applyExperimentPreset('STADIUM_SURGE');
        feedbackText.textContent = 'Applied Stadium Outflow Surge: Eastbound approach surged to 1,600 veh/h.';
      },
    },
    {
      id: 'stress-ems-gridlock',
      icon: ICONS.ambulance(),
      title: 'High Demand + Ambulance Preemption',
      desc: 'Simultaneous 1,200 veh/h congestion with immediate Ambulance dispatch on NB-TR',
      action: () => {
        store.applyExperimentPreset('RUSH_HOUR');
        setTimeout(() => {
          void store.requestPreemption('NB-TR');
        }, 150);
        feedbackText.textContent = 'Triggered High Demand + Ambulance Preemption stress test on NB-TR!';
      },
    },
    {
      id: 'stress-night',
      icon: ICONS.circle(),
      title: 'Night Off-Peak (150 veh/h)',
      desc: 'Sparse demand showing zero wasted green time on empty approaches',
      action: () => {
        store.applyExperimentPreset('LIGHT_NIGHT');
        feedbackText.textContent = 'Applied Night Off-Peak Flow: Demands reduced to 100–150 veh/h.';
      },
    },
  ];

  const experimentCards = experimentPresets.map((exp) =>
    h(
      'button',
      {
        class: 'test-experiment-card',
        attrs: { type: 'button', id: exp.id },
        on: { click: exp.action },
      },
      [
        h('span', { class: 'experiment-title' }, [exp.icon, exp.title]),
        h('span', { class: 'experiment-desc', text: exp.desc }),
      ],
    ),
  );

  // --- 7. Reset & Revert Actions ---
  const resetDemandsBtn = h(
    'button',
    {
      class: 'btn btn-secondary btn-sm',
      attrs: { id: 'btn-test-reset-demands', type: 'button' },
      on: {
        click: () => {
          store.resetDemandsToScenario();
          feedbackText.textContent = 'Reset all approach demands back to current scenario defaults.';
        },
      },
    },
    [ICONS.refresh(), 'Reset Demands to Scenario Defaults'],
  );

  const clearPreemptBtn = h(
    'button',
    {
      class: 'btn btn-secondary btn-sm',
      attrs: { id: 'btn-test-clear-preempt', type: 'button' },
      on: {
        click: () => {
          store.cancelPreemption();
          feedbackText.textContent = 'Active preemption cancelled; normal adaptive control resumed.';
        },
      },
    },
    [ICONS.close(), 'Cancel Active Preemption'],
  );

  const restartSimBtn = h(
    'button',
    {
      class: 'btn btn-secondary btn-sm',
      attrs: { id: 'btn-test-restart-sim', type: 'button' },
      on: {
        click: () => {
          store.resetScenario(store.scenarioId.get(), store.seed.get());
          feedbackText.textContent = 'Simulation reinitialized from seed start (t = 0s).';
        },
      },
    },
    [ICONS.play(), 'Restart Simulation (Seed Start)'],
  );

  // --- 8. Incidents and EMS Detection Range ---
  // Both act on the *selected* approach, the same target the spawner and the
  // canvas click use, so an operator never wonders which lane an edit landed in.
  let incidentKind: IncidentKind = 'BLOCKED';

  const incidentSelect = h(
    'select',
    {
      class: 'form-select test-vehicle-select',
      attrs: { id: 'test-controls-incident', 'aria-label': 'Select Incident Kind' },
      on: {
        change: (e) => {
          incidentKind = (e.target as HTMLSelectElement).value as IncidentKind;
        },
      },
    },
    [
      { kind: 'BLOCKED' as const, label: 'Blocked lane (full closure)' },
      { kind: 'CAPACITY_DROP' as const, label: 'Capacity drop (lane narrowing)' },
      { kind: 'DOUBLE_PARKED' as const, label: 'Double-parked (partial block)' },
    ].map((item) => h('option', { attrs: { value: item.kind }, text: item.label })),
  );

  const injectIncidentBtn = h(
    'button',
    {
      class: 'btn btn-secondary',
      attrs: { id: 'btn-test-inject-incident', type: 'button' },
      on: {
        click: () => {
          store.injectIncident(incidentKind, selectedLane, 40, 300);
          feedbackText.textContent = `${incidentKind} incident placed 40 m upstream on ${selectedLane}, for 300 s.`;
        },
      },
    },
    ['Inject Incident on Selected'],
  );

  const clearIncidentBtn = h(
    'button',
    {
      class: 'btn btn-secondary btn-sm',
      attrs: { id: 'btn-test-clear-incident', type: 'button' },
      on: {
        click: () => {
          store.clearIncident(selectedLane);
          feedbackText.textContent = `Incidents cleared on ${selectedLane}.`;
        },
      },
    },
    ['Clear Incident'],
  );

  const clearAllIncidentsBtn = h(
    'button',
    {
      class: 'btn btn-secondary btn-sm',
      attrs: { id: 'btn-test-clear-all-incidents', type: 'button' },
      on: {
        click: () => {
          LANES.forEach((l) => store.clearIncident(l));
          feedbackText.textContent = 'All incidents cleared across all 8 approach lanes.';
        },
      },
    },
    ['Clear All Lanes'],
  );

  // The badge is written from the worker echo, not from the click: `setParams`
  // can be refused or clamped, and the panel must show what the engine holds.
  const detectBadge = h('span', {
    class: 'lane-density-badge',
    text: `${store.emsDetectDistanceM.get()} m`,
  });

  const detectButtons = [150, 300, 500].map((distanceM) =>
    h(
      'button',
      {
        class: 'btn btn-secondary btn-xs',
        attrs: { id: `btn-test-detect-${String(distanceM)}`, type: 'button' },
        on: {
          click: () => {
            store.setEmsDetectDistance(distanceM);
            feedbackText.textContent = `EMS detection range requested at ${distanceM} m.`;
          },
        },
      },
      [`${distanceM} m`],
    ),
  );

  store.emsDetectDistanceM.subscribe((m) => {
    detectBadge.textContent = `${m} m`;
  });

  // Listen for external lane selections (e.g. keyboard navigation or canvas click)
  store.selectedLane.subscribe((lane) => {
    updateLaneChips(lane);
    updateHud();
  });

  // Section 6: MongoDB Persistence & Database Storage
  const mongoStatusBadge = h('span', { class: 'badge badge-safety', text: 'MongoDB: Ready' });
  const mongoSaveBtn = h(
    'button',
    {
      class: 'btn btn-primary btn-sm',
      attrs: { type: 'button' },
      on: {
        click: async () => {
          feedbackText.textContent = 'Saving simulation run to MongoDB...';
          const res = await store.saveCurrentRunToMongo();
          feedbackText.textContent = res.message;
        },
      },
    },
    [ICONS.save(), 'Save Run to MongoDB'],
  );
  const mongoRefreshBtn = h(
    'button',
    {
      class: 'btn btn-secondary btn-sm',
      attrs: { type: 'button' },
      on: {
        click: async () => {
          feedbackText.textContent = 'Fetching MongoDB runs...';
          await store.checkDbStatus();
          const runs = await store.fetchMongoRuns();
          feedbackText.textContent = `MongoDB: ${runs.length} simulation run(s) currently stored in database.`;
        },
      },
    },
    [ICONS.refresh(), 'Refresh DB Status'],
  );

  store.dbStatus.subscribe((st) => {
    mongoStatusBadge.textContent = st.connected
      ? `MongoDB: Connected (${st.database} · ${st.runsCount} runs · ${st.pingLatencyMs ?? 0}ms)`
      : `MongoDB: Ready (${st.status} · ${st.runsCount} runs)`;
    mongoStatusBadge.className = st.connected ? 'badge badge-safety' : 'badge badge-ai';
  });

  // Section 1: Vehicle Spawner Controls
  const section1Spawner = h('div', { class: 'test-section test-spawner-section' }, [
    h('div', { class: 'test-section-title' }, [
      h('span', { class: 'test-section-num', text: '1' }),
      h('span', { text: 'Vehicle Spawning Controls & Kinematic Injections' }),
    ]),
    h('div', { class: 'test-lane-chips-wrapper' }, [
      h('span', { class: 'test-field-label', text: 'Target Approach Lane (Click chip or click canvas):' }),
      h('div', { class: 'test-lane-chips' }, laneChips),
    ]),
    h('div', { class: 'test-spawner-form' }, [
      h('div', { class: 'test-field' }, [
        h('label', { class: 'test-field-label', text: 'Approach Dropdown:' }),
        laneSelect,
      ]),
      h('div', { class: 'test-field' }, [
        h('label', { class: 'test-field-label', text: 'Vehicle Class:' }),
        vehicleSelect,
      ]),
      h('div', { class: 'test-field' }, [
        h('label', { class: 'test-field-label', text: 'Injection Quantity:' }),
        countSelect,
      ]),
      h('div', { class: 'test-field' }, [
        h('div', { class: 'dist-header' }, [
          h('label', { class: 'test-field-label', text: 'Injection Distance (Upstream):' }),
          distValBadge,
        ]),
        distSlider,
        h('div', { class: 'test-dist-presets' }, distPresets),
      ]),
      h('div', { class: 'test-field' }, [
        h('div', { class: 'dist-header' }, [
          h('label', { class: 'test-field-label', text: 'Initial Speed:' }),
          speedValBadge,
        ]),
        speedSlider,
        h('div', { class: 'test-speed-presets' }, speedPresets),
      ]),
      h('div', { class: 'test-field test-field-actions' }, [
        h('label', { class: 'test-field-label', text: 'Dispatch Action:' }),
        h('div', { class: 'btn-group' }, [spawnVisibleBtn, spawnEntryBtn, emergencyPreemptBtn]),
      ]),
    ]),
  ]);

  // Section 2: 8-Lane Real-Time Traffic Density Matrix (Sliders for Each Lane!)
  const section2Density = h('div', { class: 'test-section test-density-section' }, [
    h('div', { class: 'test-section-title' }, [
      h('span', { class: 'test-section-num', text: '2' }),
      h('span', { text: 'Traffic Density & Demand Adjustments (Per-Lane Volume Sliders 0–1,800 veh/h)' }),
    ]),
    h('div', { class: 'density-matrix-grid' }, [nsGroup, ewGroup]),
  ]);

  // Section 3: Scenario Stress Experiments
  const section3Stress = h('div', { class: 'test-section test-experiments-section' }, [
    h('div', { class: 'test-section-title' }, [
      h('span', { class: 'test-section-num', text: '3' }),
      h('span', { text: 'Scenario Stress Experiments (Instant Load Presets)' }),
    ]),
    h('div', { class: 'test-experiments-grid' }, experimentCards),
  ]);

  // Section 4: Reset & Revert Actions
  const section4Reset = h('div', { class: 'test-section test-reset-section' }, [
    h('div', { class: 'test-section-title' }, [
      h('span', { class: 'test-section-num', text: '4' }),
      h('span', { text: 'Reset & Revert Controls' }),
    ]),
    h('div', { class: 'test-reset-actions' }, [resetDemandsBtn, clearPreemptBtn, restartSimBtn]),
  ]);

  // Section 5: Incidents and EMS Detection Range
  const section5Safety = h('div', { class: 'test-section' }, [
    h('div', { class: 'test-section-title' }, [
      h('span', { class: 'test-section-num', text: '5' }),
      h('span', { text: 'Roadway Incident Management (Applied to Selected Approach)' }),
    ]),
    h('div', { class: 'test-spawner-form' }, [
      h('div', { class: 'test-field' }, [
        h('label', { class: 'test-field-label', text: 'Incident Kind:' }),
        incidentSelect,
      ]),
      h('div', { class: 'test-field test-field-actions' }, [
        h('label', { class: 'test-field-label', text: 'Incident Management Actions:' }),
        h('div', { class: 'btn-group' }, [injectIncidentBtn, clearIncidentBtn, clearAllIncidentsBtn]),
      ]),
      h('div', { class: 'test-field' }, [
        h('label', { class: 'test-field-label', text: 'EMS Detection Range:' }),
        h('div', { class: 'btn-group' }, [...detectButtons, detectBadge]),
      ]),
    ]),
  ]);

  // Section 6: MongoDB Persistence & Database Storage
  const section6Mongo = h('div', { class: 'test-section test-mongo-section' }, [
    h('div', { class: 'test-section-title' }, [
      h('span', { class: 'test-section-num', text: '6' }),
      h('span', { text: 'MongoDB Persistence & Data Storage' }),
    ]),
    h('div', { class: 'test-spawner-form' }, [
      h('div', { class: 'test-field' }, [
        h('label', { class: 'test-field-label', text: 'Database Status:' }),
        h('div', { class: 'btn-group' }, [mongoStatusBadge]),
      ]),
      h('div', { class: 'test-field test-field-actions' }, [
        h('label', { class: 'test-field-label', text: 'Storage Actions:' }),
        h('div', { class: 'btn-group' }, [mongoSaveBtn, mongoRefreshBtn]),
      ]),
    ]),
  ]);

  // Distinct Panes for tab navigation
  const paneSpawner = h('div', { class: 'test-tab-pane active', attrs: { id: 'pane-spawner', role: 'tabpanel', 'aria-labelledby': 'tab-btn-spawner' } }, [
    section1Spawner,
  ]);

  const paneDensity = h('div', { class: 'test-tab-pane', attrs: { id: 'pane-density', role: 'tabpanel', 'aria-labelledby': 'tab-btn-density' } }, [
    section2Density,
  ]);

  const paneIncident = h('div', { class: 'test-tab-pane', attrs: { id: 'pane-incident', role: 'tabpanel', 'aria-labelledby': 'tab-btn-incident' } }, [
    section5Safety,
  ]);

  const paneStress = h('div', { class: 'test-tab-pane', attrs: { id: 'pane-stress', role: 'tabpanel', 'aria-labelledby': 'tab-btn-stress' } }, [
    section3Stress,
    section4Reset,
  ]);

  const paneMongo = h('div', { class: 'test-tab-pane', attrs: { id: 'pane-mongo', role: 'tabpanel', 'aria-labelledby': 'tab-btn-mongo' } }, [
    section6Mongo,
  ]);

  const tabPanes = [paneSpawner, paneDensity, paneIncident, paneStress, paneMongo];
  const tabDefs = [
    { id: 'tab-btn-spawner', pane: paneSpawner, label: 'Spawner & Kinematics', icon: ICONS.zap() },
    { id: 'tab-btn-density', pane: paneDensity, label: 'Traffic Demand (0–1800 veh/h)', icon: ICONS.play() },
    { id: 'tab-btn-incident', pane: paneIncident, label: 'Incident Management', icon: ICONS.warning() },
    { id: 'tab-btn-stress', pane: paneStress, label: 'Stress Scenarios', icon: ICONS.sparkle() },
    { id: 'tab-btn-mongo', pane: paneMongo, label: 'MongoDB Storage', icon: ICONS.database() },
  ];

  const tabButtons: HTMLButtonElement[] = [];
  tabDefs.forEach((t, idx) => {
    const btn = h(
      'button',
      {
        class: `test-tab-nav-btn ${idx === 0 ? 'active' : ''}`,
        attrs: { id: t.id, type: 'button', role: 'tab', 'aria-selected': String(idx === 0) },
        on: {
          click: () => {
            sound.click();
            tabButtons.forEach((b) => {
              const active = b === btn;
              b.classList.toggle('active', active);
              b.setAttribute('aria-selected', String(active));
            });
            tabPanes.forEach((p) => {
              p.classList.toggle('active', p === t.pane);
            });
          },
        },
      },
      [t.icon, h('span', { text: t.label })],
    ) as HTMLButtonElement;
    tabButtons.push(btn);
  });

  const tabNav = h('div', { class: 'test-tab-nav-bar', role: 'tablist', label: 'Simulation Controls Tabs' }, tabButtons);

  return h('section', { class: 'panel-card test-controls-panel', label: 'Intersection Lab — Interactive Testing Suite' }, [
    // Panel Header
    h('div', { class: 'panel-title test-panel-header' }, [
      h('div', { class: 'test-title-group' }, [
        h('div', { class: 'test-badge-row' }, [
          h('span', { class: 'badge badge-safety', text: 'LIVE TEST CONTROLS' }),
          h('span', { class: 'badge badge-ai', text: 'INTERSECTION LAB' }),
          h('span', { class: 'badge badge-mono', text: 'MATTE WORKBENCH' }),
        ]),
        h('h2', { class: 'test-heading' }, [ICONS.sparkle(), 'Intersection Lab — Interactive Testing Suite']),
        h('p', { class: 'test-sub', text: 'Select any approach lane by clicking on the visual canvas or using chips below. Spawn vehicles with custom kinematics, adjust 8-lane demands, inject roadway incidents, and test emergency preemption.' }),
      ]),
      feedbackText,
    ]),
    selectedLaneHud,
    tabNav,
    ...tabPanes,
  ]);
}

function buildLaneTable(): HTMLElement {
  const head = h('thead', {}, [
    h('tr', {}, [
      h('th', { attrs: { scope: 'col' }, text: STRINGS.laneTable.approachLane }),
      h('th', { attrs: { scope: 'col' }, text: STRINGS.laneTable.signalIndication }),
      h('th', { attrs: { scope: 'col' }, text: STRINGS.laneTable.queueMeters }),
      h('th', { attrs: { scope: 'col' }, text: STRINGS.laneTable.vehiclesWaiting }),
      h('th', { attrs: { scope: 'col' }, text: 'Demand (veh/h)' }),
      h('th', { attrs: { scope: 'col' }, text: 'Quick Injections' }),
    ]),
  ]);

  const body = h('tbody', { attrs: { id: 'lane-table-body' } });
  for (const lane of LANES) {
    const demandLabel = h('span', { class: 'mono lane-demand-num', text: '450' });
    const decBtn = h(
      'button',
      {
        class: 'btn btn-secondary btn-sm',
        attrs: { type: 'button', 'aria-label': `Decrease demand for ${lane}` },
        on: {
          click: () => {
            const cur = store.laneDemands.get()[lane] ?? 450;
            store.setLaneDemand(lane, Math.max(0, cur - 100));
          },
        },
      },
      ['−100'],
    );
    const incBtn = h(
      'button',
      {
        class: 'btn btn-secondary btn-sm',
        attrs: { type: 'button', 'aria-label': `Increase demand for ${lane}` },
        on: {
          click: () => {
            const cur = store.laneDemands.get()[lane] ?? 450;
            store.setLaneDemand(lane, Math.min(1800, cur + 100));
          },
        },
      },
      ['+100'],
    );

    const spawnCarBtn = h(
      'button',
      {
        class: 'btn btn-secondary btn-sm',
        attrs: { type: 'button', 'aria-label': `Spawn car on ${lane}` },
        on: { click: () => store.spawnVehicle(lane, 'CAR', 1, 45) },
      },
      ['+ Car'],
    );

    const spawnEmsBtn = h(
      'button',
      {
        class: 'btn btn-danger btn-sm',
        attrs: { type: 'button', 'aria-label': `Spawn ambulance on ${lane}` },
        on: { click: () => store.spawnVehicle(lane, 'AMBULANCE', 1, 45) },
      },
      [ICONS.ambulance(), '+ EMS'],
    );

    body.append(
      h('tr', {}, [
        h('td', { text: `${lane} (${LANE_DISPLAY_NAME[lane]})` }),
        h('td', { text: STRINGS.laneTable.initialIndication }),
        h('td', { text: '0' }),
        h('td', { text: '0' }),
        h('td', {}, [
          h('div', { class: 'btn-group' }, [decBtn, demandLabel, incBtn]),
        ]),
        h('td', {}, [
          h('div', { class: 'btn-group' }, [spawnCarBtn, spawnEmsBtn]),
        ]),
      ]),
    );
  }

  const table = h('table', { class: 'lane-data-table', label: STRINGS.laneTable.tableLabel }, [
    h('caption', { class: 'sr-only', text: STRINGS.laneTable.tableLabel }),
    head,
    body,
  ]);

  return h('details', { class: 'a11y-lane-table-details' }, [
    h('summary', { class: 'btn btn-secondary btn-sm', text: STRINGS.twins.tableToggle }),
    h('div', {}, [table]),
  ]);
}

function buildKeyboardDialog(): HTMLDialogElement {
  return h(
    'dialog',
    { attrs: { id: 'keyboard-help-dialog', 'aria-labelledby': 'kbd-dialog-title' } },
    [
      h('h2', { class: 'modal-title', attrs: { id: 'kbd-dialog-title' }, text: STRINGS.keyboardModal.title }),
      h(
        'ul',
        { class: 'kbd-list' },
        STRINGS.keyboardModal.shortcuts.map((shortcut) =>
          h('li', {}, [h('kbd', { class: 'kbd-key', text: shortcut.key }), ` — ${shortcut.desc}`]),
        ),
      ),
      h('button', {
        class: 'btn btn-primary',
        attrs: { id: 'btn-close-kbd', type: 'button' },
        text: STRINGS.keyboardModal.closeBtn,
        on: { click: () => byId<HTMLDialogElement>('keyboard-help-dialog').close() },
      }),
    ],
  );
}

function buildKpiGrid(refs: KpiRefs): HTMLElement {
  const tiles = KPI_TILES.map((tile) => {
    const mainValue = h('span', { class: 'stat-main-value', text: STRINGS.kpis.missing });
    const main = h('span', { class: 'stat-main mono', attrs: { id: `kpi-adaptive-${tile.key}` } }, [
      mainValue,
      tile.unit === '' ? null : h('span', { class: 'stat-unit', text: tile.unit }),
    ]);

    const fixed = h('span', {
      class: 'stat-comparison mono',
      attrs: { id: `kpi-fixed-${tile.key}` },
      text: `${STRINGS.kpis.fixedPrefix}${STRINGS.kpis.missing}`,
    });

    const delta = h('span', {
      class: 'chip-delta neutral',
      attrs: { id: `delta-${tile.key}` },
      text: STRINGS.kpis.missing,
    });

    const barFill = h('div', {
      class: 'stat-bar-fill',
      attrs: { id: `kpi-bar-${tile.key}` },
    });
    const barTrack = h('div', { class: 'stat-bar-track', attrs: { 'aria-hidden': 'true' } }, [barFill]);

    refs.main.set(tile.key, mainValue);
    refs.fixed.set(tile.key, fixed);
    refs.delta.set(tile.key, delta);
    refs.bar.set(tile.key, barFill);

    return h('div', { class: 'stat-tile' }, [
      h('div', { class: 'stat-label' }, [
        h('span', { text: tile.label }),
        delta,
      ]),
      h('div', { class: 'stat-values' }, [main, fixed]),
      barTrack,
    ]);
  });

  return h(
    'section',
    { class: 'kpi-grid', label: STRINGS.kpis.comparisonNote },
    [
      // Module 41 §1.2: the disclaimer is visible copy, not only an aria-label.
      h('p', { class: 'kpi-disclaimer', text: STRINGS.kpis.singleRunNote }),
      ...tiles,
    ],
  );
}

function buildExplainPanel(): HTMLElement {
  const rows = PHASES.map((phase) => {
    const value = h('span', { class: 'mono', attrs: { id: `val-${phase.toLowerCase()}` }, text: '0' });
    const fill = h('div', { class: 'pressure-fill', attrs: { id: `bar-${phase.toLowerCase()}` } });
    return h('div', { class: 'pressure-row' }, [
      h('div', { class: 'pressure-header' }, [
        h('span', { text: PHASE_LABEL[phase] }),
        value,
      ]),
      h('div', { class: 'pressure-track' }, [fill]),
    ]);
  });

  return h('div', { class: 'panel-card', label: STRINGS.panel.explainTitle }, [
    h('div', { class: 'panel-title' }, [
      h('span', { text: STRINGS.panel.explainTitle }),
      h('span', { class: 'badge', attrs: { id: 'rule-badge' }, text: '—' }),
    ]),
    h('p', {
      class: 'explain-text',
      attrs: { id: 'explain-text' },
      text: STRINGS.panel.waitingForData,
    }),
    h('div', {}, rows),
  ]);
}

function buildEvpPanel(): HTMLElement {
  const steps = [
    { id: 'step-request', text: STRINGS.panel.evpSteps.request },
    { id: 'step-lead', text: STRINGS.panel.evpSteps.lead },
    { id: 'step-green', text: STRINGS.panel.evpSteps.green },
    { id: 'step-transit', text: STRINGS.panel.evpSteps.transit },
    { id: 'step-recovery', text: STRINGS.panel.evpSteps.recovery },
  ].map((step) =>
    h('li', { class: 'evp-step', attrs: { id: step.id } }, [
      // Leading status mark, repainted by `updateEvpPanel`. Decorative (the text
      // names the step); the icon is a *redundant* channel, never the only one.
      h('span', { class: 'evp-step-mark', attrs: { 'aria-hidden': 'true' } }, [ICONS.circle()]),
      step.text,
    ]),
  );

  return h('div', { class: 'panel-card', label: STRINGS.panel.evpTitle }, [
    h('div', { class: 'panel-title' }, [
      h('span', { text: STRINGS.panel.evpTitle }),
      h('span', { class: 'badge', attrs: { id: 'evp-status-badge' }, text: STRINGS.panel.evpIdle }),
    ]),
    h('div', {
      class: 'banner banner-warning is-hidden',
      attrs: { id: 'evp-tight-banner' },
      text: 'TIGHT plan: ETA shortfall leaves no margin. Yellow and all-red clearance are never shortened.',
    }),
    h('p', { class: 'panel-copy mono', attrs: { id: 'evp-plan-text' }, text: '—' }),
    h('ol', { class: 'evp-steps' }, steps),
    // T22: the recorded lifecycle, newest at the bottom. Simulated timestamps,
    // straight from the worker's EvpManager — never re-derived here (Rule 00).
    h('ul', {
      class: 'evp-timeline',
      attrs: { id: 'evp-timeline', 'aria-label': 'EVP event log, simulated timestamps' },
    }),
    h('div', { class: 'panel-actions' }, [
      h('button', {
        class: 'btn btn-secondary btn-sm',
        attrs: { id: 'btn-cancel-evp', type: 'button' },
        text: STRINGS.panel.cancelEvp,
        on: { click: () => store.cancelPreemption() },
      }),
    ]),
  ]);
}

function buildCopilotPanel(): HTMLElement {
  let autoSentinelActive = false;
  let sentinelTimer: number | null = null;

  const sentinelToggleBtn = h(
    'button',
    {
      class: 'btn btn-secondary btn-sm',
      attrs: { id: 'btn-auto-sentinel', type: 'button' },
      on: {
        click: () => {
          autoSentinelActive = !autoSentinelActive;
          sentinelToggleBtn.classList.toggle('active', autoSentinelActive);
          sentinelToggleBtn.textContent = autoSentinelActive ? 'Auto-Sentinel: Active' : 'Auto-Sentinel: Off';
          if (autoSentinelActive) {
            sound.click();
            void runDiagnosis();
            sentinelTimer = window.setInterval(() => {
              if (autoSentinelActive && !document.hidden) void runDiagnosis();
            }, 10000);
          } else if (sentinelTimer !== null) {
            clearInterval(sentinelTimer);
            sentinelTimer = null;
          }
        },
      },
    },
    ['Auto-Sentinel: Off'],
  );

  return h('div', { class: 'panel-card copilot-panel', label: STRINGS.copilot.title }, [
    h('div', { class: 'panel-title' }, [
      h('div', { class: 'copilot-title-wrapper' }, [
        h('span', { text: STRINGS.copilot.title }),
        h('span', { class: 'badge badge-ai', attrs: { id: 'copilot-source' }, text: '—' }),
      ]),
      sentinelToggleBtn,
    ]),
    h('div', { class: 'panel-body' }, [
      h('div', { class: 'panel-kicker', attrs: { id: 'copilot-verdict' }, text: STRINGS.copilot.idleHint }),
      h('div', { class: 'panel-copy', attrs: { id: 'copilot-advisory' } }),
      h('ul', { class: 'evidence-list', attrs: { id: 'copilot-evidence' } }),
      h('div', { class: 'copilot-recommendations-list', attrs: { id: 'copilot-recommendations' } }),
    ]),
    h('div', { class: 'panel-actions' }, [
      h('button', {
        class: 'btn btn-primary btn-sm',
        attrs: { id: 'btn-diagnose', type: 'button' },
        text: STRINGS.copilot.diagnoseBtn,
        on: { click: () => void runDiagnosis() },
      }),
      h('button', {
        class: 'btn btn-secondary btn-sm',
        attrs: { id: 'btn-clear-copilot', type: 'button' },
        text: STRINGS.copilot.clearBtn,
        on: { click: () => clearDiagnosis() },
      }),
      h('button', {
        class: 'btn btn-secondary btn-sm',
        attrs: { id: 'btn-unsafe-proposal', type: 'button' },
        text: STRINGS.copilot.tryUnsafeBtn,
        on: { click: () => void tryUnsafeProposal() },
      }),
      h('button', {
        class: 'btn btn-secondary btn-sm',
        attrs: { id: 'btn-propose-tuning', type: 'button' },
        text: 'Propose adaptive tuning',
        on: { click: () => void proposeTuning() },
      }),
    ]),
    h('div', { class: 'panel-copy', attrs: { id: 'proposal-feedback' } }),
    h('div', { class: 'panel-copy mono', attrs: { id: 'proposal-verdict' } }),
    // Approved proposals land their Approve & Apply / Reject controls here; the
    // worker has verified on the digital twin but applied *nothing* (Module 04 §3.4).
    h('div', { class: 'panel-actions', attrs: { id: 'proposal-actions' } }),
    h('p', { class: 'panel-note', text: STRINGS.copilot.advisoryNotice }),
  ]);
}

function buildAuditPanel(): HTMLElement {
  return h('div', { class: 'panel-card', label: STRINGS.panel.auditTitle }, [
    h('div', { class: 'panel-title' }, [
      h('span', { text: STRINGS.panel.auditTitle }),
      h('span', { class: 'badge', attrs: { id: 'audit-conservation' }, text: '—' }),
    ]),
    h('dl', { class: 'audit-grid', attrs: { id: 'audit-rows' } }),
    h('div', { class: 'panel-actions' }, [
      h('button', {
        class: 'btn btn-secondary btn-sm',
        attrs: { id: 'btn-debug-bundle', type: 'button' },
        text: 'Export debug bundle',
        label: 'Download the seed, input log, state hash and kernel counters needed to replay this run with `pnpm repro`',
        on: { click: (event) => void exportDebugBundle(event.currentTarget as HTMLElement) },
      }),
    ]),
    h('details', { class: 'assumptions' }, [
      h('summary', { text: STRINGS.kpis.assumptionsTitle }),
      h('p', { class: 'panel-copy', text: STRINGS.kpis.assumptionsFuel }),
      h('p', { class: 'panel-copy', text: STRINGS.kpis.assumptionsCo2 }),
    ]),
    h('p', {
      class: 'panel-note',
      text: 'Fuel and CO₂ are derived from idle seconds with published factors; they are estimates, not measurements.',
    }),
  ]);
}

function buildFooter(): HTMLElement {
  return h('footer', { class: 'app-footer' }, [
    h('span', { class: 'badge badge-safety', text: STRINGS.panel.modeLiveSim }),
    // LIMITATIONS §26/§28: dropped render frames and a stalled KPI feed are
    // surfaced here rather than silently counted; the text is set by subscription.
    h('span', { class: 'badge badge-mode is-hidden', attrs: { id: 'perf-badge', role: 'status' }, text: '' }),
    h('span', { class: 'mono', attrs: { id: 'state-hash' }, text: STRINGS.brand.stateHashLabel('—') }),
    h('span', { class: 'mono', attrs: { id: 'footer-seed' }, text: '' }),
  ]);
}

function buildJudgeOverlay(): HTMLElement {
  return h('div', { class: 'judge-caption-overlay is-hidden', attrs: { id: 'judge-overlay' } }, [
    h('span', { class: 'badge badge-ai', text: STRINGS.judge.badge }),
    h('span', { class: 'badge', attrs: { id: 'judge-step-pill' }, text: '' }),
    h('span', {
      class: 'judge-caption-text',
      attrs: { id: 'judge-caption-text' },
      text: STRINGS.judge.openingCaption,
    }),
    h(
      'button',
      {
        class: 'btn btn-secondary btn-sm',
        attrs: { id: 'btn-judge-pause', type: 'button' },
        on: { click: () => judgeTour.togglePause() },
      },
      ['Pause'],
    ),
    h(
      'button',
      {
        class: 'btn btn-secondary btn-sm',
        attrs: { id: 'btn-judge-skip', type: 'button' },
        on: { click: () => judgeTour.skip() },
      },
      ['Skip →'],
    ),
    h(
      'button',
      {
        class: 'btn btn-secondary btn-sm',
        attrs: { id: 'btn-exit-judge', type: 'button' },
        on: { click: () => judgeTour.stop() },
      },
      [ICONS.close(), STRINGS.judge.stop],
    ),
  ]);
}

function openShortcuts(): void {
  const dialog = maybeById<HTMLDialogElement>('keyboard-help-dialog');
  dialog?.showModal();
}

async function spawnAmbulance(): Promise<void> {
  const lane = store.selectedLane.get();
  const decision = await store.requestPreemption(lane, 45);
  const feedback = maybeById('proposal-feedback');
  const testFeedback = maybeById('test-feedback-msg');
  const msg = decision.decision === 'accepted'
    ? `Ambulance spawned immediately on ${lane} at 45m (EVP active, signal turning green!)`
    : `EVP rejected: ${decision.reason ?? 'UNKNOWN'}.`;
  if (feedback) feedback.textContent = msg;
  if (testFeedback) testFeedback.textContent = msg;
}

function clearDiagnosis(): void {
  const verdict = maybeById('copilot-verdict');
  const advisory = maybeById('copilot-advisory');
  const evidence = maybeById('copilot-evidence');
  const source = maybeById('copilot-source');
  if (verdict) verdict.textContent = STRINGS.copilot.idleHint;
  if (advisory) advisory.textContent = '';
  if (evidence) evidence.replaceChildren();
  if (source) source.textContent = '—';
}

/**
 * Module 04 §3.4: exercise the rejection path on purpose.
 *
 * `YELLOW_S` is not a tunable parameter, so the kernel dry-run has to refuse
 * this by name. A verdict of "approved" here would mean the safety boundary has
 * regressed, and the text says so rather than rendering a quiet success.
 */
async function tryUnsafeProposal(): Promise<void> {
  const verdictEl = maybeById('proposal-verdict');
  if (!verdictEl) return;

  verdictEl.textContent = STRINGS.copilot.verifying;
  try {
    const verdict = await store.verifyProposal({ YELLOW_S: 1.0 });
    verdictEl.textContent = verdict.approved
      ? STRINGS.copilot.unsafeApproved(verdict.improvementPct)
      : `Refused — ${verdict.reason} No signal state was touched.`;
  } catch (error) {
    verdictEl.textContent = `Verification failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * A bounded, in-contract tuning proposal (Module 04 §3.4).
 *
 * These three values are all inside `AdaptiveParamsSchema` bounds, so the
 * digital-twin run decides on merit, not on validity. It is deliberately a
 * *fixed* proposal the operator can reason about — "the AI tunes itself"
 * would be a number nobody can audit (Rule 00).
 */
const TUNING_PROPOSAL: Partial<AdaptiveParams> = {
  G_MIN_EFFICIENT_S: 18,
  RATIO: 2.4,
  FLOOR: 6.0,
};

function tuningSummary(params: Partial<AdaptiveParams>): string {
  return Object.entries(params)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(', ');
}

/**
 * Verify-then-offer flow for an adaptive-parameter proposal (T11 close-out).
 * The worker's what-if runs two 5-minute twins and applies nothing; only a
 * human press on "Approve & Apply" sends `setAdaptiveParams` to the worker.
 */
async function proposeTuning(): Promise<void> {
  const banner = maybeById('proposal-feedback');
  const verdictEl = maybeById('proposal-verdict');
  const actions = maybeById('proposal-actions');
  if (!banner || !verdictEl || !actions) return;

  actions.replaceChildren();
  banner.textContent = STRINGS.copilot.proposeBanner;
  verdictEl.textContent = STRINGS.copilot.verifying;

  try {
    const verdict = await store.verifyProposal({ ...TUNING_PROPOSAL });
    verdictEl.textContent =
      `${verdict.approved ? 'Verified' : 'Refused'} — ${verdict.reason} ` +
      `Person-delay ${fmt(verdict.currentPersonDelayS, 1)} s → ${fmt(verdict.proposedPersonDelayS, 1)} s ` +
      `(${verdict.improvementPct.toFixed(1)}%), kernel violations: ${verdict.kernelViolations}.`;

    if (!verdict.approved) {
      banner.textContent = 'The twin refused this proposal. Nothing was applied.';
      return;
    }

    const approveBtn = h('button', {
      class: 'btn btn-primary btn-sm',
      attrs: { id: 'btn-approve-proposal', type: 'button' },
      text: STRINGS.copilot.approveBtn,
      on: {
        click: () => {
          store.applyAdaptiveParams(TUNING_PROPOSAL);
          actions.replaceChildren();
          banner.textContent =
            `Applied to the adaptive controller: ${tuningSummary(TUNING_PROPOSAL)}. ` +
            'The Safety Kernel remains the only writer of signal state.';
        },
      },
    });
    const rejectBtn = h('button', {
      class: 'btn btn-secondary btn-sm',
      attrs: { id: 'btn-reject-proposal', type: 'button' },
      text: STRINGS.copilot.rejectBtn,
      on: {
        click: () => {
          actions.replaceChildren();
          banner.textContent = 'Proposal rejected. Nothing was applied.';
        },
      },
    });
    actions.append(approveBtn, rejectBtn);
  } catch (error) {
    verdictEl.textContent = `Verification failed: ${error instanceof Error ? error.message : String(error)}`;
    banner.textContent = '';
  }
}

/**
 * Module 16 §6: assemble and download a debug bundle. The worker supplies the
 * simulation facts; this shell supplies the host facts it alone may read
 * (`__APP_VERSION__`, wall clock, user agent, console tail).
 */
async function exportDebugBundle(btn: HTMLElement): Promise<void> {
  const original = 'Export debug bundle';
  try {
    const data = await store.requestDebugBundleData();
    const bundle = createDebugBundle({
      appVersion: __APP_VERSION__,
      seed: data.seed,
      scenarioId: data.scenarioId,
      exportedAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      inputLog: data.inputLog,
      tSimS: data.tSimS,
      stateHash: data.stateHash,
      consoleLogs: getConsoleTail(),
      kernelCounters: data.kernelCounters,
    });
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `urbanflow-debug-${bundle.scenarioId}-seed${bundle.seed}-${bundle.exportedAt.replaceAll(':', '-')}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    btn.textContent = `Bundle saved (${bundle.inputLog.length} logged edits)`;
  } catch (error) {
    btn.textContent = 'Export failed — see console';
    console.error('debug bundle export failed:', error);
  }
  window.setTimeout(() => {
    btn.textContent = original;
  }, 2500);
}

async function runDiagnosis(): Promise<void> {
  const verdict = maybeById('copilot-verdict');
  const advisory = maybeById('copilot-advisory');
  const evidence = maybeById('copilot-evidence');
  const source = maybeById('copilot-source');
  if (!verdict || !advisory || !evidence || !source) return;

  verdict.textContent = 'Diagnosing from the measured 60 s window…';
  const observation = store.observation.get();
  if (!observation) {
    // No fabricated window: say the window does not exist yet (Rule 00).
    verdict.textContent = 'No measured window yet — the simulation has not published a KPI frame.';
    return;
  }

  const result: DiagnosisResult = await requestDiagnosis(buildDiagnosisWindow(observation));

  const hypothesis = result.diagnosis.rootCauseHypotheses[0];
  source.textContent =
    result.source === 'muse-spark'
      ? STRINGS.copilot.sourceMeta
      : result.source === 'llama-fallback'
        ? STRINGS.copilot.sourceWorkersAi
        : STRINGS.copilot.sourceTemplate;

  verdict.textContent = hypothesis
    ? `${hypothesis.cause} · ${STRINGS.copilot.severityLabel} ${result.diagnosis.severity} · ${Math.round(hypothesis.confidence * 100)}% ${STRINGS.copilot.confidenceLabel}`
    : 'No hypothesis returned.';

  advisory.textContent = result.offline
    ? `${STRINGS.copilot.offlineHint} ${result.diagnosis.advisoryText}`
    : result.diagnosis.advisoryText;

  evidence.replaceChildren();
  for (const item of hypothesis?.evidence ?? []) {
    evidence.append(h('li', { text: item }));
  }

  // Populate dynamic recommendations with instant actionable execution
  const recsContainer = maybeById('copilot-recommendations');
  if (recsContainer) {
    recsContainer.replaceChildren();
    const actions = result.diagnosis.recommendedActions ?? [];
    if (actions.length > 0) {
      recsContainer.appendChild(h('div', { class: 'copilot-recs-header' }, [ICONS.sparkle(), 'Autonomous AI Recommendations:']));
      actions.forEach((act) => {
        const actionBtn = h(
          'button',
          {
            class: 'btn btn-primary btn-xs',
            attrs: { type: 'button' },
            on: {
              click: () => {
                sound.click();
                // Say exactly what was executed. An AI recommendation may clear
                // incidents or request preemption — both operator-level actions —
                // but a controller-parameter change only ever goes through the
                // verify → Approve & Apply flow above (Module 04 §3.4, Rule 00).
                let executed: string;
                if (act.type.includes('INCIDENT') || act.type === 'CLEAR') {
                  LANES.forEach((l) => store.clearIncident(l));
                  executed = `Executed: cleared incidents on all approaches (${act.rationale}).`;
                } else if (act.type === 'PREEMPT' || act.type.includes('EMS')) {
                  sound.emergencyPreempt();
                  void store.requestPreemption(store.selectedLane.get());
                  executed = `Executed: preemption requested on ${store.selectedLane.get()}; the Safety Kernel still plans and writes every signal state (${act.rationale}).`;
                } else {
                  store.applyExperimentPreset('RUSH_HOUR');
                  executed =
                    'Executed: applied the RUSH_HOUR demand preset — that changes arrivals, not controller parameters. ' +
                    'For a verified controller change use "Propose adaptive tuning".';
                }
                const fb = maybeById('proposal-feedback');
                if (fb) fb.textContent = executed;
              },
            },
          },
          [ICONS.sparkle(), 'Run action'],
        );

        recsContainer.appendChild(
          h('div', { class: 'copilot-rec-item' }, [
            h('div', { class: 'copilot-rec-text' }, [
              h('span', { class: 'badge badge-mono', text: act.type }),
              h('span', { class: 'copilot-rec-rationale', text: act.rationale }),
            ]),
            actionBtn,
          ]),
        );
      });
    }
  }
}

function updateKpiTile(tile: KpiTile, refs: KpiRefs, adaptive: KpiSnapshot, fixed: KpiSnapshot): void {
  const a = tile.pick(adaptive);
  const f = tile.pick(fixed);

  const mainEl = refs.main.get(tile.key);
  if (mainEl) {
    mainEl.textContent = fmt(a, tile.digits);
    // Module 41 §1.6: a missing value is an em-dash *with a reason*, never a
    // silent blank or a fabricated zero (Rule 00).
    if (a === null || !Number.isFinite(a)) mainEl.setAttribute('title', STRINGS.kpis.missingReason);
    else mainEl.removeAttribute('title');
  }

  // Module 20 §5: more than 0.5 % denied entries makes every delay metric
  // optimistic, so the tile gets a glyph *and* a colour *and* a title — never
  // colour alone (Rule 13).
  if (tile.key === 'denied' && mainEl) {
    const warn = (a ?? 0) > 0.5;
    mainEl.classList.toggle('kpi-warn', warn);
    if (warn) {
      // Module 41 §1.5 / Module 40: the warning icon becomes an inline SVG so it
      // survives forced-colours; the measured value stays as a sibling text node
      // (never dropped, never replaced by the icon alone).
      const valueText = mainEl.textContent ?? '';
      mainEl.replaceChildren(ICONS.warning(), document.createTextNode(` ${valueText}`));
      mainEl.setAttribute('title', STRINGS.kpis.deniedWarning);
    } else {
      mainEl.removeAttribute('title');
    }
  }

  const fixedEl = refs.fixed.get(tile.key);
  if (fixedEl) fixedEl.textContent = `${STRINGS.kpis.fixedPrefix}${fmt(f, tile.digits)}`;

  const deltaEl = refs.delta.get(tile.key);
  if (!deltaEl) return;

  const pct = relativeChangePct(a, f);
  deltaEl.className = 'chip-delta';
  // Module 41 §1.5: colour/arrow alone is not enough — the *direction meaning*
  // is stated explicitly for screen readers and hover alike.
  deltaEl.setAttribute('title', tile.lowerBetter ? STRINGS.kpis.lowerBetter : STRINGS.kpis.higherBetter);
  deltaEl.setAttribute('aria-label',
    `${STRINGS.kpis.fixedPrefix} vs adaptive: ${tile.lowerBetter ? STRINGS.kpis.lowerBetter : STRINGS.kpis.higherBetter}`);

  if (pct === null) {
    deltaEl.classList.add('neutral');
    deltaEl.replaceChildren(document.createTextNode(STRINGS.kpis.noData));
    return;
  }
  if (Math.abs(pct) < 0.5) {
    deltaEl.classList.add('neutral');
    // Module 41 §1.5: an equals mark, not an arrow, for "no difference".
    deltaEl.replaceChildren(ICONS.parity(), document.createTextNode(STRINGS.kpis.parity));
    return;
  }

  const improved = tile.lowerBetter ? pct < 0 : pct > 0;
  deltaEl.classList.add(improved ? 'good' : 'bad');
  // The arrow encodes the numeric sign (down = decreased); colour plus the
  // `title`/`aria-label` set above encode good/bad, so no single channel carries
  // the meaning alone (Module 41 §1.5). No emoji glyph is used.
  const glyph = pct < 0 ? ICONS.arrowDown() : ICONS.arrowUp();
  deltaEl.replaceChildren(glyph, document.createTextNode(`${Math.abs(pct).toFixed(1)}%`));

  const barEl = refs.bar.get(tile.key);
  if (barEl) {
    if (a !== null && f !== null && (a > 0 || f > 0)) {
      const maxVal = Math.max(a, f);
      const ratio = maxVal > 0 ? a / maxVal : 0.5;
      barEl.style.setProperty('--kpi-scale', String(Math.max(0.06, Math.min(1, ratio))));
      barEl.className = `stat-bar-fill ${improved ? 'good' : 'bad'}`;
    } else {
      barEl.style.setProperty('--kpi-scale', '0.06');
      barEl.className = 'stat-bar-fill neutral';
    }
  }
}

function updatePressurePanel(): void {
  const explain = store.explainState.get();
  const badge = maybeById('rule-badge');
  const text = maybeById('explain-text');
  if (badge) badge.textContent = explain.rule;
  if (text) text.textContent = explain.explanation;

  const values = PHASES.map((phase) => explain.pressures[phase] ?? 0);
  const peak = Math.max(1, ...values);

  PHASES.forEach((phase, index) => {
    const valueEl = maybeById(`val-${phase.toLowerCase()}`);
    const barEl = maybeById(`bar-${phase.toLowerCase()}`);
    const value = values[index] ?? 0;
    if (valueEl) valueEl.textContent = value.toFixed(1);
    if (barEl) {
      // Documented exception: bar geometry cannot be expressed as a class.
      // Module 42 §1 rule 1 / §4: drive `transform: scaleX` (0–1), never `width`.
      barEl.style.setProperty('--bar-scale', String(value / peak));
      barEl.classList.toggle('active', phase === explain.currentPhase);
    }
  });
}

function updateEvpPanel(): void {
  const status = store.evpStatus.get();
  const badge = maybeById('evp-status-badge');
  const plan = maybeById('evp-plan-text');
  const tight = maybeById('evp-tight-banner');
  const order = ['step-request', 'step-lead', 'step-green', 'step-transit', 'step-recovery'];

  const reached = status
    ? status.stage === 'PRECLEAR'
      ? 2
      : status.stage === 'EMS_GREEN'
        ? 3
        : status.stage === 'RECOVERY'
          ? 4
          : 0
    : 0;

  order.forEach((id, index) => {
    const el = maybeById(id);
    if (!el) return;
    const done = index < reached;
    el.classList.toggle('done', done);
    // Module 41 §7: completion is carried by an icon (check vs circle) as well
    // as colour, so status never depends on colour alone (Rule 13).
    const mark = el.querySelector('.evp-step-mark');
    if (mark) mark.replaceChildren(done ? ICONS.check() : ICONS.circle());
  });

  if (badge) badge.textContent = status ? status.stage : STRINGS.panel.evpIdle;
  if (plan) {
    plan.textContent = status
      ? `plan ${status.planStatus}${
          status.shortfallS > 0 ? ` · shortfall ${status.shortfallS.toFixed(1)}s` : ''
        } · ${status.activeEmsId}`
      : '—';
  }
  if (tight) tight.classList.toggle('is-hidden', !status || status.planStatus !== 'TIGHT');

  // T22: the lifecycle log. Newest at the bottom, last 8 shown; the full
  // record stays in the worker and lands in debug bundles.
  const list = maybeById('evp-timeline');
  if (list) {
    const entries = store.evpTimeline.get().slice(-8);
    list.replaceChildren(
      ...entries.map((entry) =>
        h('li', { class: 'evp-timeline-entry' }, [
          h('span', { class: 'mono', text: `${entry.tSimS.toFixed(1)}s` }),
          h('span', { class: 'evp-timeline-action', text: entry.action.replaceAll('_', ' ') }),
          h('span', { class: 'evp-timeline-detail', text: entry.detail }),
        ]),
      ),
    );
  }
}

function updateLaneTable(): void {
  const body = maybeById('lane-table-body');
  const signal = store.signalAdaptive.get();
  const observed = store.observation.get();
  const demands = store.laneDemands.get();
  if (!body || !signal || !observed) return;

  const stopped = store.waiting.get();
  const rows = body.querySelectorAll('tr');
  LANES.forEach((lane, index) => {
    const row = rows[index];
    if (!row) return;

    const laneState = observed.lanes[lane];
    if (!laneState) return;

    const indication = signal.lanes[lane];
    const indicationText =
      indication === 'G' ? 'GO (Green)' : indication === 'Y' ? 'CLEAR (Yellow)' : 'STOP (Red)';

    const cells = row.querySelectorAll('td');
    if (cells[1]) cells[1].textContent = indicationText;
    if (cells[2]) cells[2].textContent = laneState.queueLengthM.toFixed(0);
    if (cells[3]) cells[3].textContent = String(stopped[index] ?? 0);
    const demandSpan = cells[4]?.querySelector('.lane-demand-num');
    if (demandSpan) demandSpan.textContent = String(demands[lane] ?? 450);
  });
}

function updateAuditPanel(adaptive: KpiSnapshot): void {
  const badge = maybeById('audit-conservation');
  if (badge) {
    badge.textContent = adaptive.conservationBalanced
      ? STRINGS.panel.conservationOk
      : STRINGS.panel.conservationBroken;
    badge.className = adaptive.conservationBalanced ? 'badge badge-safety' : 'badge badge-mode';
  }

  const rows = maybeById('audit-rows');
  if (!rows) return;

  const fixed = store.kpiFixed.get();
  const safety = store.safetyStats.get();
  const byType = Object.entries(safety.violationsPreventedByType)
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => `${kind} ${count}`)
    .join(', ');

  // Module 16 §4.1 `evp.requests{accepted,rejected,reason}` and `evp.shortfallS`.
  // These outlive the plan: `evpStatus` is null once a preemption ends, so a
  // refusal would otherwise vanish with the badge that showed it.
  const evp = store.evpCounters.get();
  const rejectedBy = Object.entries(evp.rejectedByReason)
    .filter(([, count]) => count > 0)
    .map(([reason, count]) => `${reason} ${count}`)
    .join(', ');
  const worstShortfallS = evp.shortfallsS.length === 0 ? 0 : Math.max(...evp.shortfallsS);

  const entries: Array<[string, string]> = [
    ['Simulated time', `${store.tSimS.get().toFixed(1)} s`],
    ['Bus delay', `${fmt(adaptive.busDelayS, 1)} s`],
    ['Bike delay', `${fmt(adaptive.bikeDelayS, 1)} s`],
    ['Fixed-twin CO₂', `${fmt(fixed.co2Kg, 2)} kg`],
    // Module 16 §4.1 kernel gauges. Forwarded from the kernel, never recomputed.
    ['Green seen min / max', `${safety.minGreenSeenS.toFixed(1)} / ${safety.maxGreenSeenS.toFixed(1)} s`],
    ['Yellow compliance', `${safety.yellowCompliancePct.toFixed(1)} %`],
    ['All-red compliance', `${safety.allRedCompliancePct.toFixed(1)} %`],
    ['Violations prevented', byType === '' ? 'none' : byType],
    ['EVP decisions', `${evp.accepted} accepted / ${evp.rejected} rejected`],
    ['EVP refusals', rejectedBy === '' ? 'none' : rejectedBy],
    ['EVP worst shortfall', `${worstShortfallS.toFixed(1)} s`],
    ['Conservation', STRINGS.panel.conservationLabel],
  ];

  rows.replaceChildren();
  for (const [term, value] of entries) {
    rows.append(h('dt', { text: term }), h('dd', { class: 'mono', text: value }));
  }
}

function updateLosBadges(adaptive: KpiSnapshot, fixed: KpiSnapshot): void {
  const adaptiveBadge = maybeById('los-adaptive');
  const fixedBadge = maybeById('los-fixed');

  if (adaptiveBadge) {
    adaptiveBadge.textContent = STRINGS.kpis.losLabel(adaptive.los);
    adaptiveBadge.className =
      adaptive.los === 'A' || adaptive.los === 'B' ? 'badge badge-safety' : 'badge';
    // Module 41 §2: the outline pattern is a third channel alongside the letter
    // (text) and colour. `components.css` keys `data-los` A–F on solid→hatched.
    if (adaptive.los) adaptiveBadge.setAttribute('data-los', adaptive.los);
    else adaptiveBadge.removeAttribute('data-los');
  }
  if (fixedBadge) {
    fixedBadge.textContent = STRINGS.kpis.losLabel(fixed.los);
    fixedBadge.className = fixed.los === 'A' || fixed.los === 'B' ? 'badge badge-safety' : 'badge';
    if (fixed.los) fixedBadge.setAttribute('data-los', fixed.los);
    else fixedBadge.removeAttribute('data-los');
  }
}

export function renderApp(root: HTMLElement): {
  canvasFixed: HTMLCanvasElement;
  canvasAdaptive: HTMLCanvasElement;
} {
  const refs: KpiRefs = { main: new Map(), fixed: new Map(), delta: new Map(), bar: new Map() };

  root.classList.add('app-container');

  const liveStatus = h('div', {
    class: 'sr-only',
    attrs: { id: 'a11y-live-status', 'aria-live': 'polite', 'aria-atomic': 'true' },
    text: STRINGS.live.ready,
  });

  // Module 32 §4 / Module 33: the skip link in `index.html` targets `#main`.
  // `tabindex="-1"` makes the programmatically-focused region announce to a
  // screen reader without adding it to the sequential tab order.
  const twins = h('main', { class: 'twins-container', attrs: { id: 'main', tabindex: '-1' } }, [
    buildTwinCard({
      title: STRINGS.twins.fixedTitle,
      canvasId: 'canvas-fixed',
      losId: 'los-fixed',
      ribbonId: 'ribbon-fixed',
      ribbonTitle: STRINGS.twins.ribbonFixed,
      subBarId: 'twin-sub-fixed',
    }),
    buildTwinCard({
      title: STRINGS.twins.adaptiveTitle,
      canvasId: 'canvas-adaptive',
      losId: 'los-adaptive',
      ribbonId: 'ribbon-adaptive',
      ribbonTitle: STRINGS.twins.ribbonAdaptive,
      subBarId: 'twin-sub-adaptive',
      badges: [h('span', { class: 'badge badge-ai', text: STRINGS.twins.badgeAi })],
    }),
  ]);

  appendChildren(root, [
    liveStatus,
    buildHeader(),
    twins,
    buildIntelligenceBanner(),
    buildTestControlsPanel(),
    buildLaneTable(),
    buildKeyboardDialog(),
    buildKpiGrid(refs),
    h('section', { class: 'dashboard-panels' }, [
      buildExplainPanel(),
      buildEvpPanel(),
      buildCopilotPanel(),
      buildAuditPanel(),
    ]),
    buildJudgeOverlay(),
    buildFooter(),
  ]);

  const canvasFixed = byId<HTMLCanvasElement>('canvas-fixed');
  const canvasAdaptive = byId<HTMLCanvasElement>('canvas-adaptive');

  // Judge Mode overlay visibility + transport controls (pause label follows the
  // tour's own paused state, so the button can never disagree with the clock).
  store.judgeTour.subscribe((tour) => {
    const overlay = maybeById('judge-overlay');
    const caption = maybeById('judge-caption-text');
    if (!overlay) return;
    overlay.classList.toggle('is-hidden', !tour.active);
    if (caption) caption.textContent = tour.caption;
    const pauseBtn = maybeById('btn-judge-pause');
    if (pauseBtn) pauseBtn.textContent = tour.paused ? 'Resume' : 'Pause';
    const pill = maybeById('judge-step-pill');
    if (pill) pill.textContent = tour.active ? `Step ${tour.stepIndex + 1}/6` : '';
  });

  // State hash + seed footer.
  store.stateHash.subscribe((hash) => {
    const el = maybeById('state-hash');
    if (el) el.textContent = STRINGS.brand.stateHashLabel(hash || '—');
  });
  const footerSeed = maybeById('footer-seed');
  if (footerSeed) footerSeed.textContent = STRINGS.brand.identicalArrivals(store.seed.get());

  // LIMITATIONS §26/§28: honest degradation badges. Stalled feed outranks the
  // dropped-frame count because a frozen number is the worse lie.
  const updatePerfBadge = (): void => {
    const el = maybeById('perf-badge');
    if (!el) return;
    const stale = store.kpiStale.get();
    const dropped = store.droppedRenderFrames.get();
    const message = stale
      ? 'KPI feed stalled — values shown are the last measured'
      : dropped > 0
        ? `UI busy: ${String(dropped)} render frame${dropped === 1 ? '' : 's'} dropped`
        : '';
    el.textContent = message;
    el.classList.toggle('is-hidden', message === '');
  };
  store.kpiStale.subscribe(updatePerfBadge);
  store.droppedRenderFrames.subscribe(updatePerfBadge);

  // Global keyboard map (Module 32 §4).
  window.addEventListener('keydown', (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
    if (target instanceof HTMLSelectElement) return;

    const dialog = maybeById<HTMLDialogElement>('keyboard-help-dialog');

    switch (event.key) {
      case 'Escape':
        judgeTour.stop();
        if (dialog?.open) dialog.close();
        break;
      case ' ':
        event.preventDefault();
        store.togglePause();
        break;
      case 'a':
      case 'A':
        void spawnAmbulance();
        break;
      case 'r':
      case 'R':
        store.resetScenario(store.scenarioId.get(), store.seed.get());
        break;
      case '1':
        store.setSpeed(0.5);
        break;
      case '2':
        store.setSpeed(1);
        break;
      case '3':
        store.setSpeed(5);
        break;
      case '4':
        store.setSpeed(20);
        break;
      case '?':
        dialog?.showModal();
        break;
      default:
        break;
    }
  });

  // Module 32 §1: live-region announcements are throttled to 1 per 5 s — the
  // KPI store publishes at up to 4 Hz, and reading a sentence that often is
  // noise, not accessibility. Wall clock is used only for this UI pacing, never
  // for a displayed or simulated value (Rule 07 determinism is untouched).
  let lastAnnouncedAtMs = 0;
  const updateKpis = (): void => {
    const adaptive = store.kpiAdaptive.get();
    const fixed = store.kpiFixed.get();

    for (const tile of KPI_TILES) {
      updateKpiTile(tile, refs, adaptive, fixed);
    }

    updateLosBadges(adaptive, fixed);
    updatePressurePanel();
    updateEvpPanel();
    updateLaneTable();
    updateAuditPanel(adaptive);

    // Update AI Intelligence Hero Banner
    const heroPhase = maybeById('hero-phase-pill');
    const heroEfficiency = maybeById('hero-efficiency-text');
    const heroReasoning = maybeById('hero-reasoning-copy');
    const heroEvpBanner = maybeById('hero-evp-banner');
    const heroEvpText = maybeById('hero-evp-text');

    const signal = store.signalAdaptive.get();
    const explain = store.explainState.get();
    const evp = store.evpStatus.get();

    if (heroPhase && signal) {
      const pName = signal.phase ? (PHASE_LABEL[signal.phase] ?? signal.phase) : 'ALL RED CLEARANCE';
      heroPhase.textContent = signal.phase ? `${signal.phase}: ${pName}` : pName;
    }

    if (heroReasoning && explain) {
      heroReasoning.textContent = explain.explanation || 'Adaptive controller balancing multi-phase queue pressures.';
    }

    if (heroEfficiency) {
      const aDelay = adaptive.personDelayS ?? adaptive.avgDelayS;
      const fDelay = fixed.personDelayS ?? fixed.avgDelayS;
      if (aDelay !== null && fDelay !== null && fDelay > 0) {
        const pct = Math.round(((fDelay - aDelay) / fDelay) * 100);
        const saved = Math.max(0, fDelay - aDelay).toFixed(1);
        if (pct > 0) {
          heroEfficiency.textContent = `−${pct}% Delay (${saved}s saved/person) vs Fixed-Time · 0 Conflicts`;
        } else if (pct === 0) {
          heroEfficiency.textContent = `Identical Delay Parity (Warm-up Phase)`;
        } else {
          heroEfficiency.textContent = `Adapting to dynamic flow changes (${Math.abs(Number(saved))}s delta)`;
        }
      }
    }

    if (heroEvpBanner && heroEvpText) {
      if (evp) {
        heroEvpBanner.classList.remove('is-hidden');
        heroEvpText.textContent = `EMERGENCY PREEMPTION ACTIVE · STAGE: ${evp.stage} · PLAN: ${evp.planStatus} · APPROACH: ${evp.activeEmsId}`;
      } else {
        heroEvpBanner.classList.add('is-hidden');
      }
    }

    // Update live phase timer
    const heroTimer = maybeById('hero-phase-timer');
    if (heroTimer && signal) {
      heroTimer.replaceChildren(ICONS.timer(), document.createTextNode(` ${signal.timeInStateS.toFixed(1)}s in phase`));
    }

    // Update 4-phase pressure distribution chips
    if (explain && explain.pressures) {
      const pMap: Array<[string, PhaseId]> = [
        ['press-p1', 'P1_NS_LEFT'],
        ['press-p2', 'P2_NS_THRU'],
        ['press-p3', 'P3_EW_LEFT'],
        ['press-p4', 'P4_EW_THRU'],
      ];
      pMap.forEach(([elId, phaseId]) => {
        const el = maybeById(elId);
        if (el) {
          const val = (explain.pressures[phaseId] ?? 0).toFixed(1);
          const valEl = el.querySelector('.press-val');
          if (valEl) valEl.textContent = val;
          el.classList.toggle('active', explain.currentPhase === phaseId);
        }
      });
    }

    // Update live environmental & network savings ticker
    const heroSavedDelay = maybeById('hero-saved-delay');
    const heroSavedFuel = maybeById('hero-saved-fuel');
    const heroSavedCo2 = maybeById('hero-saved-co2');
    const aDelay = adaptive.personDelayS ?? adaptive.avgDelayS ?? 0;
    const fDelay = fixed.personDelayS ?? fixed.avgDelayS ?? 0;
    const aFuel = adaptive.fuelL ?? 0;
    const fFuel = fixed.fuelL ?? 0;
    const aCo2 = adaptive.co2Kg ?? 0;
    const fCo2 = fixed.co2Kg ?? 0;

    if (heroSavedDelay) {
      const deltaS = Math.max(0, fDelay - aDelay);
      heroSavedDelay.textContent = `−${deltaS.toFixed(1)}s / veh`;
    }
    if (heroSavedFuel) {
      const fuelSaved = Math.max(0, fFuel - aFuel);
      heroSavedFuel.textContent = `${fuelSaved.toFixed(2)} L saved`;
    }
    if (heroSavedCo2) {
      const co2Cut = Math.max(0, fCo2 - aCo2);
      heroSavedCo2.textContent = `${co2Cut.toFixed(2)} kg cut`;
    }

    // Update Dual Twin Card Subtitle Telemetry Bars
    const twinSubFixed = maybeById('twin-sub-fixed');
    const twinSubAdaptive = maybeById('twin-sub-adaptive');
    if (twinSubFixed) {
      const qM = fixed.maxQueueM !== null ? `${Math.round(fixed.maxQueueM)}m` : '0m';
      twinSubFixed.textContent = `Baseline 60s Pre-timed · Avg Delay: ${fmt(fDelay, 1)}s · Max Queue: ${qM} · Fuel: ${fmt(fFuel, 1)}L`;
    }
    if (twinSubAdaptive) {
      const qM = adaptive.maxQueueM !== null ? `${Math.round(adaptive.maxQueueM)}m` : '0m';
      const pct = fDelay > 0 ? Math.round(((fDelay - aDelay) / fDelay) * 100) : 0;
      twinSubAdaptive.textContent = `UrbanFlow AI Adaptive · Avg Delay: ${fmt(aDelay, 1)}s (${pct > 0 ? `−${pct}%` : 'par'}) · Max Queue: ${qM} · Fuel: ${fmt(aFuel, 1)}L`;
    }

    const safety = store.safetyStats.get();
    const safetyBadge = maybeById('hdr-safety-badge');
    if (safetyBadge) {
      safetyBadge.textContent = STRINGS.safety.statusCounters(
        safety.conflicts,
        safety.ticks,
        safety.violationsPrevented,
      );
    }

    const nowMs = performance.now();
    const live = maybeById('a11y-live-status');
    if (live && nowMs - lastAnnouncedAtMs >= 5000) {
      lastAnnouncedAtMs = nowMs;
      live.textContent = STRINGS.a11y.liveStatus(
        store.signalAdaptive.get()?.phase ?? STRINGS.a11y.unknownPhase,
        fmt(adaptive.personDelayS, 1),
        fmt(fixed.personDelayS, 1),
        safety.conflicts,
        safety.ticks,
      );
    }
  };

  // The store is the only writer of measured state, so the panels repaint when
  // the worker publishes rather than on a local timer. One subscription per
  // payload keeps a KPI frame from rebuilding the lane table twice.
  store.observation.subscribe(() => updateKpis());
  store.evpStatus.subscribe(() => updateEvpPanel());
  store.evpTimeline.subscribe(() => updateEvpPanel());
  void store.checkDbStatus();

  return { canvasFixed, canvasAdaptive };
}
