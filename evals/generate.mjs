/**
 * Module 24 §9: incident dataset generator.
 *
 * Produces the 30 labelled diagnosis windows (BLOCKED_LANE ×6, CAPACITY_DROP
 * ×4, DEMAND_SURGE ×6, SIGNAL_FAULT ×4, BUS_BUNCHING ×3, EMS_OBSTRUCTED ×3,
 * NORMAL_VARIATION ×4) by driving the *real* deterministic simulator with
 * distinct seeds and lanes, then capturing the window shortly after each
 * fault injection. Output is committed once (`evals/fixtures/incidents.json`)
 * so CI replays never need the simulator again.
 *
 * Fault injection discipline (Rule 06): normal stepping always routes
 * controller → SafetyKernel → sim. The SIGNAL_FAULT class is the single
 * documented exception — a frozen signal is fed straight to the physics twin
 * *offline*, to manufacture evidence of a stuck indication for diagnosis
 * fixtures. No product code path may do this; the engine, kernel and replay
 * pipeline are untouched.
 *
 * Usage: pnpm build && pnpm eval:gen [--force]
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  INCIDENT_CLASSES,
  INCIDENTS_FILE,
  FIXTURES_DIR,
  RESPONSES_DIR,
  buildWindow,
  loadCore,
} from './harness.mjs';

const BASE_DEMAND = {
  'NB-TR': 450, 'NB-L': 150,
  'SB-TR': 450, 'SB-L': 150,
  'EB-TR': 450, 'EB-L': 150,
  'WB-TR': 450, 'WB-L': 150,
};

const TRIGGER_S = 300;
const CAPTURE_S = 480;
const DURATION_S = 540;

const core = await loadCore();
const { SimEngine, SafetyKernel, AdaptiveController, DEFAULT_SIM_CONFIG, LANES, TIMING } = core;

/** One labelled incident: drive the twin, inject the class's fault, capture. */
function runIncident(cause, index, seed) {
  const lane = LANES[(index * 2 + 1) % LANES.length];
  const sim = new SimEngine({
    ...DEFAULT_SIM_CONFIG,
    seed,
    durationS: DURATION_S,
    laneDemandVph: { ...BASE_DEMAND },
  });
  const kernel = new SafetyKernel();
  const controller = new AdaptiveController();

  const ticks = Math.floor(DURATION_S / TIMING.SIM_DT_S);
  let injected = false;
  let emsSpawned = false;
  let frozenSignal = null;
  let captured = null;

  for (let t = 0; t < ticks; t++) {
    const simTimeS = t * TIMING.SIM_DT_S;
    const obs = sim.observe();

    if (!injected && simTimeS >= TRIGGER_S) {
      injectFault(cause, sim, lane);
      injected = true;
    }
    if (cause === 'EMS_OBSTRUCTED' && injected && !emsSpawned && simTimeS >= TRIGGER_S + 30) {
      sim.spawnEms(lane);
      emsSpawned = true;
    }

    let signal;
    if (cause === 'SIGNAL_FAULT' && injected) {
      // Offline fixture manufacture of a stuck indication — see header note.
      frozenSignal = { ...frozenSignal, timeInStateS: frozenSignal ? frozenSignal.timeInStateS + TIMING.SIM_DT_S : 0 };
      signal = frozenSignal ?? forcedAllRed(obs);
    } else {
      const action = controller.decide(obs);
      signal = kernel.step(action, null, TIMING.SIM_DT_S);
      if (cause === 'SIGNAL_FAULT' && !injected) frozenSignal = signal;
    }
    sim.step(signal);

    if (Math.abs(simTimeS - CAPTURE_S) < TIMING.SIM_DT_S / 2) {
      captured = sim.observe();
    }
  }

  if (!captured) throw new Error(`incident capture failed for ${cause}#${index}`);
  return {
    id: `${slug(cause)}-${index + 1}`,
    label: { cause, lane },
    expectedSeverity: INCIDENT_CLASSES.find((c) => c.cause === cause).expectedSeverity,
    seed,
    triggerS: TRIGGER_S,
    captureS: CAPTURE_S,
    window: buildWindow(captured),
  };
}

function injectFault(cause, sim, lane) {
  switch (cause) {
    case 'BLOCKED_LANE':
      sim.setIncident('BLOCKED', lane, 60);
      break;
    case 'CAPACITY_DROP':
      sim.setIncident('CAPACITY_DROP', lane, 90);
      break;
    case 'DEMAND_SURGE':
      sim.applyParams({ laneDemandVph: { [lane]: 1500 } });
      break;
    case 'BUS_BUNCHING':
      // Heavy transit share on one approach: slow acceleration chains platoons.
      sim.applyParams({ modalSplit: { BUS: 0.45 } });
      break;
    case 'EMS_OBSTRUCTED':
      // The obstruction the EMS will crawl behind; the vehicle spawns after.
      sim.setIncident('BLOCKED', lane, 120);
      break;
    case 'SIGNAL_FAULT':
    case 'NORMAL_VARIATION':
      break; // signal freeze handled in the step loop; normal has no fault
    default:
      throw new Error(`unknown class ${cause}`);
  }
}

/** Boot-equivalent stuck state for the frozen-signal fixture: phase null, all red. */
function forcedAllRed(obs) {
  const lanes = {};
  for (const id of LANES) lanes[id] = obs.signal.lanes[id] ?? 'R';
  return { phase: null, indication: 'ALL_RED', timeInStateS: 0, lanes };
}

function slug(cause) {
  return cause.toLowerCase();
}

if (existsSync(INCIDENTS_FILE) && !process.argv.includes('--force')) {
  console.error(`evals/fixtures/incidents.json already exists — regenerate with --force.`);
  process.exit(1);
}

const incidents = [];
let seedCursor = 0;
for (const { cause, count } of INCIDENT_CLASSES) {
  for (let i = 0; i < count; i++) {
    seedCursor += 1;
    incidents.push(runIncident(cause, i, 2000 + seedCursor * 7));
  }
}

mkdirSync(FIXTURES_DIR, { recursive: true });
const dataset = {
  schemaVersion: 1,
  generatedBy: 'evals/generate.mjs',
  generator: {
    triggerS: TRIGGER_S,
    captureS: CAPTURE_S,
    durationS: DURATION_S,
    baseDemandVph: BASE_DEMAND,
    note: 'SIGNAL_FAULT windows freeze the indication offline to manufacture stuck-signal evidence; no product path bypasses the Safety Kernel.',
  },
  incidents,
};
writeFileSync(INCIDENTS_FILE, JSON.stringify(dataset, null, 2) + '\n', 'utf8');
// `pnpm eval:live` drops recorded provider answers here; the directory must
// exist before the first .gitkeep write, or a fresh clone crashes after
// already producing the dataset.
mkdirSync(RESPONSES_DIR, { recursive: true });
writeFileSync(path.join(RESPONSES_DIR, '.gitkeep'), '', { encoding: 'utf8', flag: 'a' });
console.log(`wrote ${incidents.length} labelled incidents to ${path.relative(process.cwd(), INCIDENTS_FILE)}`);
