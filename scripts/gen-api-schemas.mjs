#!/usr/bin/env node
/**
 * Module 22 §8: JSON Schemas are generated into `docs/api/*.schema.json` by a
 * script, and CI checks them for drift.
 *
 *   node scripts/gen-api-schemas.mjs           # write docs/api/*.schema.json
 *   node scripts/gen-api-schemas.mjs --check   # fail if committed files drifted
 *
 * The single source of truth is the zod schemas in `@urbanflow/core` (Rule 12);
 * nothing here is hand-written twice. Conversion uses zod's own `toJSONSchema`
 * (zod >= 3.25), so no new dependency enters the tree (Rule 18).
 *
 * Requires `pnpm build` first: the generator loads the compiled ESM output in
 * `packages/core/dist` because CI's Node (20) cannot import `.ts` sources.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const root = process.cwd();
const OUT_DIR = path.join(root, 'docs', 'api');
const CHECK = process.argv.includes('--check');

const CORE_DIST = path.join(root, 'packages', 'core', 'dist', 'index.js');
if (!fs.existsSync(CORE_DIST)) {
  process.stderr.write('packages/core/dist is missing — run `pnpm build` first.\n');
  process.exit(1);
}

// Anchor module resolution inside the core package so `zod` resolves to the
// same installation the compiled schemas were linked against.
const coreRequire = createRequire(CORE_DIST);
const { z } = coreRequire('zod');
if (typeof z.toJSONSchema !== 'function') {
  process.stderr.write('zod >= 3.25 is required for z.toJSONSchema.\n');
  process.exit(1);
}

const core = await import(pathToFileURL(CORE_DIST).href);

/**
 * Frozen wire contracts only — the Kafka/HTTP surface a second system would
 * consume. Copilot output shapes are documented in docs/API.md; their schema
 * objects live in the edge bundle (`copilot/schemas.ts`), out of scope here.
 */
const SCHEMAS = {
  'kafka-envelope': core.KafkaEnvelopeSchema,
  'lane-telemetry': core.LaneTelemetryPayloadSchema,
  'signal-state': core.SignalStatePayloadSchema,
  'lane-metrics': core.LaneMetricsPayloadSchema,
  'anomaly-event': core.AnomalyEventPayloadSchema,
  'evp-request': core.EvpRequestSchema,
  'signed-evp': core.SignedEvpSchema,
  'sim-config': core.SimConfigSchema,
  'adaptive-params': core.AdaptiveParamsSchema,
};

function generate() {
  const emitted = new Map();
  for (const [name, schema] of Object.entries(SCHEMAS)) {
    if (!schema) throw new Error(`core export missing: ${name}`);
    const json = JSON.stringify(z.toJSONSchema(schema), null, 2) + '\n';
    emitted.set(`${name}.schema.json`, json);
  }
  return emitted;
}

const problems = [];
const generated = generate();

if (!CHECK && !fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

for (const [file, json] of generated) {
  const abs = path.join(OUT_DIR, file);
  if (CHECK) {
    if (!fs.existsSync(abs)) problems.push(`missing schema file: docs/api/${file}`);
    else if (fs.readFileSync(abs, 'utf-8') !== json)
      problems.push(`drift: docs/api/${file} (run \`pnpm api:gen\`)`);
  } else {
    fs.writeFileSync(abs, json, 'utf-8');
  }
}

if (CHECK && problems.length) {
  for (const p of problems) process.stderr.write(`${p}\n`);
  process.exit(1);
}
process.stdout.write(`${CHECK ? 'ok' : 'wrote'} ${generated.size} schemas in docs/api/\n`);
