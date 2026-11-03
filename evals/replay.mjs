/**
 * Module 24 §9: deterministic eval replay — no API key, no simulator.
 *
 * Baselines:
 *   - rule-based heuristic: `TemplateProvider.diagnose` recomputed live
 *     (deterministic, zero cost, zero latency to charge);
 *   - Llama fallback / Muse Spark: *recorded* provider responses from
 *     `evals/fixtures/responses/<source>/<id>.json`, captured by
 *     `evals/live.mjs`. A source without fixtures is reported as such —
 *     the report never fills a gap with an assumed number (Rule 00).
 *
 * The report at `evals/out/report.md` is fully generated; it must never be
 * hand-edited. A prompt or model change is a regression when the recorded
 * primary source drops below `evals/floor.json`'s top-1 floor.
 *
 * Usage: pnpm build && pnpm eval:replay [-- --record-floor]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  FLOOR_FILE,
  INCIDENTS_FILE,
  OUT_DIR,
  REPORT_FILE,
  RESPONSES_DIR,
  causeAccuracy,
  loadCore,
  loadEdge,
  proposalsPassingKernel,
  severityAgreement,
  summariseLatency,
} from './harness.mjs';

if (!existsSync(INCIDENTS_FILE)) {
  console.error('missing evals/fixtures/incidents.json — run `pnpm eval:gen` once and commit it.');
  process.exit(1);
}

const dataset = JSON.parse(readFileSync(INCIDENTS_FILE, 'utf8'));
const core = await loadCore();
const edge = await loadEdge();
const template = new edge.TemplateProvider();

/** Recorded fixtures are validated on load: a corrupt fixture fails loudly. */
function loadRecorded(source, id) {
  const file = path.join(RESPONSES_DIR, source, `${id}.json`);
  if (!existsSync(file)) return null;
  const record = JSON.parse(readFileSync(file, 'utf8'));
  const parsed = edge.DiagnosisV1Schema.safeParse(record.diagnosis);
  if (!parsed.success) {
    throw new Error(`recorded response ${path.relative(process.cwd(), file)} is not schema-valid`);
  }
  return {
    diagnosis: parsed.data,
    latencyMs: typeof record.latencyMs === 'number' ? record.latencyMs : null,
    costMicroUsd: typeof record.costMicroUsd === 'number' ? record.costMicroUsd : 0,
    recordedAt: record.recordedAt ?? null,
    promptVersion: record.promptVersion ?? 'unknown',
  };
}

function evaluate(source, diagnose) {
  const results = [];
  const latencies = [];
  let costMicroUsd = 0;
  let missing = 0;

  for (const incident of dataset.incidents) {
    const outcome = diagnose(incident);
    if (!outcome) {
      missing++;
      continue;
    }
    results.push({
      diagnosis: outcome.diagnosis,
      label: incident.label,
      expectedSeverity: incident.expectedSeverity,
      cause: incident.label.cause,
    });
    if (outcome.latencyMs !== null) latencies.push(outcome.latencyMs);
    costMicroUsd += outcome.costMicroUsd;
  }

  if (results.length === 0) return null;

  const latency = summariseLatency(latencies);
  return {
    source,
    answered: results.length,
    missing,
    top1: causeAccuracy(results, { top2: false }),
    top2: causeAccuracy(results, { top2: true }),
    severity: severityAgreement(results),
    kernel: proposalsPassingKernel(results, core.AdaptiveParamsSchema),
    latency,
    costUsd: Number((costMicroUsd / 1_000_000).toFixed(6)),
    perClass: perClassAccuracy(results),
  };
}

function perClassAccuracy(results) {
  const byCause = new Map();
  for (const { diagnosis, cause } of results) {
    const entry = byCause.get(cause) ?? { hit: 0, total: 0 };
    if (diagnosis.rootCauseHypotheses[0]?.cause === cause) entry.hit++;
    entry.total++;
    byCause.set(cause, entry);
  }
  const out = {};
  for (const [cause, { hit, total }] of byCause) {
    out[cause] = { hit, total, pct: total > 0 ? Math.round((hit / total) * 1000) / 10 : null };
  }
  return out;
}

const baselines = [];
baselines.push(
  evaluate('heuristic', (incident) => ({
    diagnosis: template.diagnose(incident.window),
    latencyMs: 0,
    costMicroUsd: 0,
  })),
);
for (const source of ['llama-fallback', 'muse-spark']) {
  baselines.push(
    evaluate(source, (incident) => loadRecorded(source, incident.id)),
  );
}
const measured = baselines.filter(Boolean);

// ------------------------------------------------------------------ floor
const floor = existsSync(FLOOR_FILE) ? JSON.parse(readFileSync(FLOOR_FILE, 'utf8')) : { primarySource: 'muse-spark', top1PctFloor: null };
const primary = measured.find((b) => b.source === floor.primarySource) ?? null;
let floorStatus = 'no floor recorded — run `pnpm eval:replay -- --record-floor` after the first trusted run';
if (process.argv.includes('--record-floor')) {
  if (!primary || primary.top1.pct === null) {
    console.error('cannot record a floor: primary source has no measured answers');
    process.exit(1);
  }
  writeFileSync(
    FLOOR_FILE,
    JSON.stringify({ primarySource: floor.primarySource, top1PctFloor: primary.top1.pct, recordedAt: new Date().toISOString() }, null, 2) + '\n',
    'utf8',
  );
  floorStatus = `floor recorded at top-1 ${primary.top1.pct}% (${floor.primarySource})`;
} else if (typeof floor.top1PctFloor === 'number' && primary) {
  floorStatus =
    primary.top1.pct >= floor.top1PctFloor
      ? `PASS — top-1 ${primary.top1.pct}% ≥ recorded floor ${floor.top1PctFloor}%`
      : `REGRESSION — top-1 ${primary.top1.pct}% < recorded floor ${floor.top1PctFloor}%`;
}

// ------------------------------------------------------------------ report
const pctOr = (v) => (v === null || v === undefined ? 'not measured' : `${v}%`);
const msOr = (v) => (v === null || v === undefined ? 'not measured' : `${Math.round(v)} ms`);

const lines = [
  '# Copilot eval report',
  '',
  `<!-- AUTO-GENERATED by evals/replay.mjs on ${new Date().toISOString()}. Do not hand-edit; rerun the script. -->`,
  '',
  `Dataset: ${dataset.incidents.length} labelled incidents (${path.relative(process.cwd(), INCIDENTS_FILE)}).`,
  'Heuristic baseline recomputed live; provider baselines replay recorded fixtures.',
  '',
  '| baseline | answered | top-1 cause | top-2 cause | severity agreement | proposals passing kernel | p50 latency | p95 latency | est. cost |',
  '|---|---|---|---|---|---|---|---|---|',
];
for (const b of measured) {
  lines.push(
    `| ${b.source} | ${b.answered}/${dataset.incidents.length}${b.missing > 0 ? ` (${b.missing} without fixtures)` : ''} | ${pctOr(b.top1.pct)} | ${pctOr(b.top2.pct)} | ${pctOr(b.severity.pct)} | ${pctOr(b.kernel.pct)}${b.kernel.withProposal > 0 ? ` (${b.kernel.pass}/${b.kernel.withProposal})` : ''} | ${msOr(b.latency.p50)} | ${msOr(b.latency.p95)} | $${b.costUsd.toFixed(4)} |`,
  );
}
const omitted = baselines.length - measured.length;
if (omitted > 0) {
  lines.push('', `Baselines without recorded fixtures are omitted (${omitted}): run \`pnpm eval:live\` (needs \`META_API_KEY\`) to record them.`);
}
lines.push('', '## Per-class top-1 accuracy', '');
for (const b of measured) {
  lines.push(`### ${b.source}`, '', '| class | top-1 |', '|---|---|');
  for (const [cause, entry] of Object.entries(b.perClass)) {
    lines.push(`| ${cause} | ${pctOr(entry.pct)} (${entry.hit}/${entry.total}) |`);
  }
  lines.push('');
}
lines.push(
  '## Honesty notes',
  '',
  '- "% proposals with positive what-if Δ" is measured by the paired-seed benchmark (`packages/bench`), not by this replay, and is therefore **not reported here** rather than being estimated.',
  '- Report where Muse Spark loses to the heuristic; that comparison is the point of the table above.',
  '',
  '## Regression floor',
  '',
  `- ${floorStatus}`,
  '',
);
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(REPORT_FILE, lines.join('\n'), 'utf8');
console.log(`report written to ${path.relative(process.cwd(), REPORT_FILE)}`);
for (const b of measured) {
  console.log(`${b.source}: top-1 ${pctOr(b.top1.pct)} · top-2 ${pctOr(b.top2.pct)} · severity ${pctOr(b.severity.pct)} · cost $${b.costUsd.toFixed(4)}`);
}

// CI gate: a recorded regression against the floor fails the run.
if (typeof floor.top1PctFloor === 'number' && primary && primary.top1.pct < floor.top1PctFloor) {
  process.exit(1);
}
