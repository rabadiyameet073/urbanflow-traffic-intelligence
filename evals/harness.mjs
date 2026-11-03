/**
 * Module 24 §9: shared eval harness.
 *
 * The evals run against *built* workspace packages (plain Node cannot import
 * the TS sources), exactly like scripts/gen-api-schemas.mjs. If a dist is
 * missing the scripts say so instead of quietly doing something else.
 *
 * Honesty contract (Rule 00): every metric in the report is computed from
 * committed fixtures or live-measured calls. A metric that cannot be measured
 * is reported as `null` and printed as "not measured" — never estimated.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const EVALS_DIR = HERE;
export const FIXTURES_DIR = path.join(HERE, 'fixtures');
export const RESPONSES_DIR = path.join(FIXTURES_DIR, 'responses');
export const OUT_DIR = path.join(HERE, 'out');
export const INCIDENTS_FILE = path.join(FIXTURES_DIR, 'incidents.json');
export const FLOOR_FILE = path.join(HERE, 'floor.json');
export const REPORT_FILE = path.join(OUT_DIR, 'report.md');

const CORE_DIST = path.resolve(HERE, '../packages/core/dist/index.js');
const EDGE_DIST = path.resolve(HERE, '../packages/edge/dist');

function assertBuilt(file, label) {
  if (!existsSync(file)) {
    throw new Error(`${label} dist not found at ${file} — run \`pnpm build\` first.`);
  }
}

/** Core is the single source of truth for the sim, kernel and contracts. */
export async function loadCore() {
  assertBuilt(CORE_DIST, '@urbanflow/core');
  return import(pathToFileURL(CORE_DIST).href);
}

/** Edge dist supplies the deterministic heuristic baseline and the Meta adapter. */
export async function loadEdge() {
  assertBuilt(path.join(EDGE_DIST, 'copilot/providers/template.js'), '@urbanflow/edge');
  const template = await import(pathToFileURL(path.join(EDGE_DIST, 'copilot/providers/template.js')).href);
  const schemas = await import(pathToFileURL(path.join(EDGE_DIST, 'copilot/schemas.js')).href);
  return { TemplateProvider: template.TemplateProvider, DiagnosisV1Schema: schemas.DiagnosisV1Schema };
}

export async function loadEdgeMeta() {
  assertBuilt(path.join(EDGE_DIST, 'copilot/providers/meta.js'), '@urbanflow/edge');
  const meta = await import(pathToFileURL(path.join(EDGE_DIST, 'copilot/providers/meta.js')).href);
  const prompts = await import(pathToFileURL(path.join(EDGE_DIST, 'copilot/prompts.js')).href);
  const llm = await import(pathToFileURL(path.join(EDGE_DIST, 'copilot/llm.js')).href);
  return { MetaProvider: meta.MetaProvider, DIAGNOSIS_JSON_SCHEMA: meta.DIAGNOSIS_JSON_SCHEMA, PROMPTS: prompts.PROMPTS, USER_TURNS: prompts.USER_TURNS, MAX_TOKENS: llm.MAX_TOKENS };
}

/**
 * Diagnosis window in the observation-shaped record the router and the
 * template baseline consume (`lanes` keyed by lane id, `queueLengthM` etc.).
 * Rounding matches the browser client so eval inputs are realistic payloads.
 */
export function buildWindow(obs) {
  const lanes = {};
  for (const lane of Object.values(obs.lanes)) {
    lanes[lane.laneId] = {
      lane: lane.laneId,
      vehicleCount: lane.vehicleCount,
      queueLengthM: round1(lane.queueLengthM),
      sumWeightedWaitS: round1(lane.sumWeightedWaitS),
      arrivalsLast10s: lane.arrivalsLast10s,
      dischargedLast10s: lane.dischargedLast10s,
      occupancyPct: round1(lane.occupancyPct),
    };
  }
  return {
    simTimeS: round1(obs.simTimeS),
    horizonS: 60,
    lanes,
    signal: {
      phase: obs.signal.phase,
      indication: obs.signal.indication,
      timeInStateS: round1(obs.signal.timeInStateS),
    },
  };
}

export function round1(value) {
  return Math.round(value * 10) / 10;
}

/**
 * The §9 dataset classes and their committed counts. Sum = 30 incidents,
 * across different seeds and lanes, exactly as the module prescribes.
 */
export const INCIDENT_CLASSES = [
  { cause: 'BLOCKED_LANE', count: 6, expectedSeverity: 'critical' },
  { cause: 'CAPACITY_DROP', count: 4, expectedSeverity: 'warning' },
  { cause: 'DEMAND_SURGE', count: 6, expectedSeverity: 'warning' },
  { cause: 'SIGNAL_FAULT', count: 4, expectedSeverity: 'critical' },
  { cause: 'BUS_BUNCHING', count: 3, expectedSeverity: 'info' },
  { cause: 'EMS_OBSTRUCTED', count: 3, expectedSeverity: 'warning' },
  { cause: 'NORMAL_VARIATION', count: 4, expectedSeverity: 'info' },
];

export function percentile(sortedValues, p) {
  if (sortedValues.length === 0) return null;
  const idx = (sortedValues.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedValues[lo];
  return sortedValues[lo] + (sortedValues[hi] - sortedValues[lo]) * (idx - lo);
}

/** top-1: the leading hypothesis is the labelled cause. top-2 adds the runner-up. */
export function causeAccuracy(results, { top2 = false } = {}) {
  let hit = 0;
  let total = 0;
  for (const { diagnosis, label } of results) {
    if (!diagnosis) continue;
    total++;
    const causes = diagnosis.rootCauseHypotheses.map((h) => h.cause);
    const ranked = top2 ? causes.slice(0, 2) : causes.slice(0, 1);
    if (ranked.includes(label.cause)) hit++;
  }
  return { hit, total, pct: total > 0 ? round1((hit / total) * 100) : null };
}

export function severityAgreement(results) {
  let hit = 0;
  let total = 0;
  for (const { diagnosis, expectedSeverity } of results) {
    if (!diagnosis) continue;
    total++;
    if (diagnosis.severity === expectedSeverity) hit++;
  }
  return { hit, total, pct: total > 0 ? round1((hit / total) * 100) : null };
}

/**
 * "% proposals passing the Kernel": every ADJUST_PARAMS action must parse
 * against the frozen AdaptiveParamsSchema bounds — the same gate the kernel
 * enforces before any proposal could ever reach a controller.
 */
export function proposalsPassingKernel(results, AdaptiveParamsSchema) {
  let pass = 0;
  let withProposal = 0;
  for (const { diagnosis } of results) {
    if (!diagnosis) continue;
    const proposals = diagnosis.recommendedActions.filter((a) => a.type === 'ADJUST_PARAMS');
    if (proposals.length === 0) continue;
    for (const proposal of proposals) {
      withProposal++;
      if (AdaptiveParamsSchema.partial().safeParse(proposal.params ?? {}).success) pass++;
    }
  }
  return {
    pass,
    withProposal,
    pct: withProposal > 0 ? round1((pass / withProposal) * 100) : null,
  };
}

export function summariseLatency(latencies) {
  const sorted = [...latencies].sort((a, b) => a - b);
  return { p50: percentile(sorted, 0.5), p95: percentile(sorted, 0.95) };
}
