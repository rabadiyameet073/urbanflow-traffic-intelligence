/**
 * Module 24 §9: live eval smoke — 5 incidents against the real Muse Spark
 * endpoint, printing accuracy and cost, and *recording* each schema-valid
 * response to `evals/fixtures/responses/muse-spark/<id>.json` so `replay.mjs`
 * (and CI) can rerun the same numbers without a key ever leaving this script.
 *
 * Requires `META_API_KEY` (and optionally `META_MODEL`) in the environment.
 * This is the only evals entry that makes paid calls; it is never wired into
 * `pnpm verify`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { INCIDENTS_FILE, RESPONSES_DIR, loadEdge, loadEdgeMeta } from './harness.mjs';

const apiKey = process.env.META_API_KEY ?? '';
if (apiKey.length <= 5) {
  console.error('META_API_KEY is required for eval:live (5 incidents, paid calls).');
  process.exit(1);
}
if (!existsSync(INCIDENTS_FILE)) {
  console.error('missing evals/fixtures/incidents.json — run `pnpm eval:gen` first.');
  process.exit(1);
}

const dataset = JSON.parse(readFileSync(INCIDENTS_FILE, 'utf8'));
const edge = await loadEdge();
const { MetaProvider, DIAGNOSIS_JSON_SCHEMA, PROMPTS, USER_TURNS, MAX_TOKENS } = await loadEdgeMeta();

const provider = new MetaProvider(apiKey, process.env.META_BASE_URL ?? 'https://api.meta.ai/v1', process.env.META_MODEL);

// Deterministic sample: the first incident of each of the first five classes.
const seen = new Set();
const sample = [];
for (const incident of dataset.incidents) {
  if (!seen.has(incident.label.cause)) {
    seen.add(incident.label.cause);
    sample.push(incident);
  }
  if (sample.length === 5) break;
}

const outDir = path.join(RESPONSES_DIR, 'muse-spark');
mkdirSync(outDir, { recursive: true });

let hits = 0;
let answered = 0;
let totalCostMicroUsd = 0;

for (const incident of sample) {
  const controller = new AbortController();
  const raw = await provider.complete(
    {
      task: 'diagnose',
      promptVersion: 'diagnose.v1',
      system: PROMPTS['diagnose.v1'],
      input: `${USER_TURNS.diagnose}\n${JSON.stringify(incident.window)}`,
      maxTokens: MAX_TOKENS.diagnose,
      temperature: 0.1,
      jsonSchema: DIAGNOSIS_JSON_SCHEMA,
    },
    { signal: controller.signal, timeoutMs: 6_000 },
  );
  controller.abort();

  if (!raw.ok) {
    console.log(`${incident.id}: provider failure (${raw.code ?? 'unknown'}) — not recorded`);
    continue;
  }

  const text = raw.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  let parsedJson = null;
  try {
    parsedJson = JSON.parse(text);
  } catch {
    /* handled by schema check below */
  }
  const validated = parsedJson ? edge.DiagnosisV1Schema.safeParse(parsedJson) : null;
  if (!validated || !validated.success) {
    const issues = validated ? validated.error.issues[0] : null;
    console.log(
      `${incident.id}: schema-invalid output (${issues ? `${issues.path.join('.')}: ${issues.message}` : 'not JSON'}) — not recorded`,
    );
    continue;
  }

  answered++;
  const top1 = validated.data.rootCauseHypotheses[0]?.cause;
  const hit = top1 === incident.label.cause;
  if (hit) hits++;
  totalCostMicroUsd += raw.costMicroUsd;

  const file = path.join(outDir, `${incident.id}.json`);
  if (!existsSync(file) || process.env.EVAL_OVERWRITE === '1') {
    writeFileSync(
      file,
      JSON.stringify(
        {
          recordedAt: new Date().toISOString(),
          promptVersion: 'diagnose.v1',
          model: provider.modelId,
          latencyMs: raw.latencyMs,
          costMicroUsd: raw.costMicroUsd,
          diagnosis: validated.data,
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );
  }
  console.log(`${incident.id}: label=${incident.label.cause} top1=${top1} ${hit ? 'HIT' : 'MISS'} · ${Math.round(raw.latencyMs)} ms · $${(raw.costMicroUsd / 1_000_000).toFixed(6)}`);
}

console.log('');
console.log(`live smoke: top-1 ${hits}/${answered} answered of ${sample.length} · est. cost $${(totalCostMicroUsd / 1_000_000).toFixed(6)}`);
console.log(`recorded fixtures under ${path.relative(process.cwd(), outDir)} — commit them so evals/replay.mjs is key-free.`);
