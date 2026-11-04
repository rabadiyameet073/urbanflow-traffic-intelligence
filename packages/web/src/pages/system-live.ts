/**
 * System Explorer — Live core section.
 *
 * Every other section on this page transcribes the repository. This one *runs*
 * it: the same deterministic `TwinWorld` the dashboard worker executes, ticking
 * at the fixed 0.1 s step in real time inside this tab. Each number shown is
 * measured from the engine's own read models (Rule 00 — measured values in,
 * never re-derived by the view), so a judge watching the demo sees the real
 * backend output, not an animation standing in for it.
 */
import { h, setClass } from '../ui/dom.js';
import { ICONS } from '../ui/icons.js';
import { DEFAULT_SIM_CONFIG, LANES, SimConfigSchema, TwinWorld } from '@urbanflow/core';
import type { LaneId, MetricsSnapshot } from '@urbanflow/core';

const SEED = 4242;
const TICK_MS = 100; // one 0.1 s engine tick per 100 ms wall time = 1× real time
const LANE_LEN_M = DEFAULT_SIM_CONFIG.laneLengthM;
const MOTION_OK = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** North–south-heavy demand: the two controllers diverge visibly within a minute. */
const DEMAND: Record<LaneId, number> = {
  'NB-TR': 900, 'NB-L': 450,
  'SB-TR': 900, 'SB-L': 450,
  'EB-TR': 750, 'EB-L': 375,
  'WB-TR': 750, 'WB-L': 375,
};

function makeWorld(): TwinWorld {
  const config = SimConfigSchema.parse({
    ...DEFAULT_SIM_CONFIG,
    seed: SEED,
    laneDemandVph: DEMAND,
  });
  return new TwinWorld('system-explorer-live', SEED, config);
}

function fmt(n: number | null, digits: number, unit: string): string {
  return n === null ? '—' : `${n.toFixed(digits)}${unit}`;
}

const KPI_DEFS: ReadonlyArray<{ label: string; get: (m: MetricsSnapshot) => string }> = [
  { label: 'Avg vehicle delay', get: (m) => fmt(m.avgDelayS, 1, ' s') },
  { label: 'Person delay', get: (m) => fmt(m.personDelayS, 1, ' s') },
  { label: 'Throughput', get: (m) => fmt(m.throughputVph, 0, ' veh/h') },
  { label: 'Max queue', get: (m) => fmt(m.maxQueueM, 0, ' m') },
  { label: 'Level of service', get: (m) => m.los ?? '—' },
  { label: 'EMS runs', get: (m) => (m.emsRuns === 0 ? '—' : `${m.emsRuns}${m.emsDelayS === null ? '' : ` · ${m.emsDelayS.toFixed(1)} s avg`}`) },
  { label: 'Denied entries', get: (m) => `${m.deniedEntries} (${m.deniedPct.toFixed(1)}%)` },
];

interface LaneRowRefs {
  row: HTMLElement;
  dot: HTMLElement;
  fill: HTMLElement;
  count: HTMLElement;
  queue: HTMLElement;
}

export function buildLiveView(): HTMLElement {
  let world = makeWorld();
  let ticks = 0;
  let timer: number | null = null;

  // --- Controls -------------------------------------------------------------

  const clockLabel = h('span', { class: 'mono sys-live-clock', text: 't = 0.0 s · tick 0' });
  const runLabel = h('span', { text: ' Start engine' });
  const runBtn = h(
    'button',
    {
      class: 'btn btn-primary',
      attrs: { type: 'button', id: 'sys-live-run', 'aria-pressed': 'false' },
      label: 'Run or pause the real deterministic engine at 10 Hz',
      on: { click: (): void => (timer === null ? start() : stop()) },
    },
    [ICONS.play(), runLabel],
  );
  const emsBtn = h(
    'button',
    {
      class: 'btn btn-secondary',
      attrs: { type: 'button', id: 'sys-live-ems' },
      label: 'Request emergency preemption for the NB through lane',
      on: { click: injectEms },
    },
    [ICONS.ambulance(), h('span', { text: ' Inject ambulance' })],
  );
  const resetBtn = h(
    'button',
    {
      class: 'btn btn-secondary',
      attrs: { type: 'button', id: 'sys-live-reset' },
      label: 'Hard-reset to the same seed — determinism means the same future',
      on: { click: resetRun },
    },
    [ICONS.refresh(), h('span', { text: ' Reset run' })],
  );

  const phaseChip = h('span', { class: 'sys-live-chip', text: 'boot · all red' });
  const evpChip = h('span', { class: 'sys-live-chip', text: 'EVP IDLE' });
  const conservationChip = h('span', { class: 'sys-live-chip', text: 'conservation —' });
  const verdict = h('p', {
    class: 'sys-live-verdict mono',
    attrs: { id: 'sys-live-verdict', role: 'status' },
    text: 'Press Start engine (already running unless you prefer reduced motion). Every value below is measured from this page’s own engine instance.',
  });

  // --- Lane board -------------------------------------------------------------

  const laneRows = new Map<LaneId, LaneRowRefs>();
  const laneList = h('div', { class: 'sys-live-lanes', attrs: { role: 'list' } });
  for (const lane of LANES) {
    const dot = h('span', { class: 'sys-live-dot dot-R', attrs: { 'aria-hidden': 'true' } });
    const fill = h('div', { class: 'sys-live-track-fill' });
    const count = h('span', { class: 'sys-live-num mono', text: '0' });
    const queue = h('span', { class: 'sys-live-num mono', text: '0 m' });
    const row = h('div', { class: 'sys-live-lane', attrs: { role: 'listitem' } }, [
      h('span', { class: 'sys-live-lane-name mono', text: lane }),
      dot,
      h('div', { class: 'sys-live-track', label: `${lane} queue occupancy` }, [fill]),
      queue,
      count,
    ]);
    laneRows.set(lane, { row, dot, fill, count, queue });
    laneList.append(row);
  }

  // --- KPI table ---------------------------------------------------------------

  const kpiCells: Array<{ fixed: HTMLElement; adaptive: HTMLElement }> = [];
  const tbody = h('tbody');
  for (const def of KPI_DEFS) {
    const fixedCell = h('td', { class: 'mono', text: '—' });
    const adaptiveCell = h('td', { class: 'mono', text: '—' });
    kpiCells.push({ fixed: fixedCell, adaptive: adaptiveCell });
    tbody.append(h('tr', {}, [h('th', { attrs: { scope: 'row' } }, [def.label]), fixedCell, adaptiveCell]));
  }
  const kpiTable = h('table', { class: 'sys-live-kpis' }, [
    h('thead', {}, [
      h('tr', {}, [
        h('th', { attrs: { scope: 'col' } }, ['Metric']),
        h('th', { attrs: { scope: 'col' } }, ['Fixed-time twin']),
        h('th', { attrs: { scope: 'col' } }, ['Adaptive twin']),
      ]),
    ]),
    tbody,
  ]);

  const hashLabel = h('span', { class: 'mono sys-live-hash', text: `seed ${SEED}` });

  const board = h('div', { class: 'sys-two-col sys-live-grid' }, [
    h('div', {}, [
      h('h3', { class: 'sys-detail-title', text: 'Lane board — adaptive intersection (measured observation)' }),
      h('p', {
        class: 'sys-hint',
        text: 'Dot = the live lane indication from the safety kernel. Bar = contiguous queue length against the 300 m approach. Right numbers = vehicles in lane and queue metres.',
      }),
      laneList,
      h('h3', { class: 'sys-detail-title', text: 'Twin KPIs — same arrivals, one difference: the controller' }),
      kpiTable,
    ]),
    h('div', { class: 'sys-detail' }, [
      h('h3', { class: 'sys-detail-title', text: 'What you are looking at' }),
      h('p', {
        class: 'sys-detail-body',
        text: 'This is packages/core running unmodified in the browser: two SimEngines on one seed, each behind its own single-writer SafetyKernel, one fixed-time and one adaptive controller. The dashboard runs the identical classes inside a Web Worker; here they run on this thread so the page can speak for itself on camera.',
      }),
      h('ul', { class: 'sys-detail-list' }, [
        h('li', { text: 'Inject ambulance: a real EvpRequest through the same PRECLEAR → EMS_GREEN → RECOVERY machine, validated against the live simulation.' }),
        h('li', { text: 'Reset run: same seed, same inputs — the state hash proves the future is identical (bit determinism, ADR-0014).' }),
        h('li', { text: 'Conservation chip: arrivals = exited + in-system + denied, recomputed every tick; the suite proves the law as a test.' }),
      ]),
      hashLabel,
    ]),
  ]);

  // --- Render / loop -------------------------------------------------------------

  function render(): void {
    const obs = world.observation('adaptive');
    const sig = world.signal('adaptive');
    const kpis = world.kpis();
    const evp = world.evpStatus();

    clockLabel.textContent = `t = ${obs.simTimeS.toFixed(1)} s · tick ${ticks}`;
    phaseChip.textContent =
      sig.phase === null ? 'boot · all red' : `phase ${sig.phase} · ${sig.indication} · ${sig.timeInStateS.toFixed(1)} s`;
    evpChip.textContent = evp === null ? 'EVP IDLE' : `EVP ${evp.stage}`;
    setClass(evpChip, 'is-hot', evp !== null);

    const balanced = kpis.adaptive.conservation.balanced;
    conservationChip.textContent = balanced
      ? `conservation closes · ${kpis.adaptive.conservation.arrivals} = ${kpis.adaptive.conservation.exited} + ${kpis.adaptive.conservation.inSystem} + ${kpis.adaptive.conservation.denied}`
      : 'conservation OPEN — a bug, not a rounding';
    setClass(conservationChip, 'is-hot', !balanced);

    for (const lane of LANES) {
      const o = obs.lanes[lane];
      const refs = laneRows.get(lane);
      if (!o || !refs) continue;
      const ind = sig.lanes[lane];
      refs.dot.classList.remove('dot-G', 'dot-Y', 'dot-R');
      refs.dot.classList.add(ind === 'G' ? 'dot-G' : ind === 'Y' ? 'dot-Y' : 'dot-R');
      const pct = Math.min(100, (o.queueLengthM / LANE_LEN_M) * 100);
      refs.fill.style.width = `${pct.toFixed(1)}%`;
      refs.count.textContent = String(o.vehicleCount);
      refs.queue.textContent = `${o.queueLengthM.toFixed(0)} m`;
      setClass(refs.row, 'is-ems', o.nearestEmsDistanceM !== null);
    }

    const rows = [kpis.fixed, kpis.adaptive];
    for (let i = 0; i < KPI_DEFS.length; i++) {
      const def = KPI_DEFS[i]!;
      const cells = kpiCells[i]!;
      cells.fixed.textContent = def.get(rows[0]!);
      cells.adaptive.textContent = def.get(rows[1]!);
    }

    hashLabel.textContent = `stateHash ${world.stateHash()} · seed ${SEED}`;
  }

  function start(): void {
    if (timer !== null) return;
    timer = window.setInterval(() => {
      world.tick();
      ticks += 1;
      render();
    }, TICK_MS);
    runLabel.textContent = ' Pause engine';
    runBtn.setAttribute('aria-pressed', 'true');
    runBtn.replaceChildren(ICONS.pause(), runLabel);
  }

  function stop(): void {
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
    runLabel.textContent = ' Start engine';
    runBtn.setAttribute('aria-pressed', 'false');
    runBtn.replaceChildren(ICONS.play(), runLabel);
  }

  function injectEms(): void {
    const res = world.requestPreemption('NB-TR');
    verdict.textContent = `EVP ${res.id} → ${res.decision}${res.reason === null || res.reason === undefined ? '' : ` (${res.reason})`} — watch the NB-TR row and the phase chip.`;
    render();
  }

  function resetRun(): void {
    const wasRunning = timer !== null;
    stop();
    world.reset(SEED);
    ticks = 0;
    render();
    verdict.textContent = 'Reset to the same seed. Run it twice: the state hashes match tick for tick — that is the determinism claim, live on screen.';
    if (wasRunning) start();
  }

  // A hidden tab must not burn cycles; restore the user’s running choice.
  // A label check would be wrong here — stop() rewrites it — so keep a flag.
  let runningBeforeHide = false;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      runningBeforeHide = timer !== null;
      stop();
    } else if (runningBeforeHide) {
      runningBeforeHide = false;
      start();
    }
  });

  const wrap = h('section', { class: 'sys-live', attrs: { 'aria-label': 'Live core demonstration' } }, [
    h('p', {
      class: 'sys-hint',
      text: 'Not an animation: the real @urbanflow/core engine ticking in this tab at the fixed 0.1 s step. Frontend, kernel, engines and metrics — live backend output, rendered from measurements.',
    }),
    h('div', { class: 'sys-live-controls' }, [runBtn, emsBtn, resetBtn]),
    h('div', { class: 'sys-live-chips' }, [phaseChip, evpChip, conservationChip]),
    verdict,
    board,
  ]);

  render();
  if (MOTION_OK) start();
  return wrap;
}
