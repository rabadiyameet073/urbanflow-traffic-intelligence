#!/usr/bin/env node
/**
 * docs:check — Rule 00 enforcement.
 *
 * Fails when a judge-facing document drifts from the benchmark artefacts.
 *
 * Three checks:
 *   1. Every scenario table row that names a scenario must quote the exact
 *      `personDelayS` fixed/adaptive means from results.json (2 dp).
 *   2. Every EVP sweep row must quote the exact measured means from
 *      ems-sweep.json (2 dp).
 *   3. Banned claims and unfilled placeholders must not appear.
 *
 * Run: node scripts/docs-check.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const DOCS = ['README.md', path.join('docs', 'validation', 'RESULTS.md')];
const BANNED = [
  'production-ready',
  'guaranteed safe',
  'guaranteed to reduce',
  'certified safe',
  'reduces congestion by',
  'up to 40%',
  '<measured>',
];
const PLACEHOLDER = /<\s*(?:measured|todo|tbd|xx)\s*>/i;

const problems = [];

function readJson(rel) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) {
    problems.push(`missing artefact: ${rel} (run \`pnpm bench\`)`);
    return null;
  }
  return JSON.parse(fs.readFileSync(abs, 'utf-8'));
}

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function fmt(n) {
  return Number(n).toFixed(2);
}

const results = readJson(path.join('packages', 'bench', 'out', 'results.json'));
const sweep = readJson(path.join('packages', 'bench', 'out', 'ems-sweep.json'));

for (const rel of DOCS) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) {
    problems.push(`missing document: ${rel}`);
    continue;
  }
  const lines = fs.readFileSync(abs, 'utf-8').split(/\r?\n/);
  const whole = lines.join('\n');

  // Check 3 — banned claims.
  for (const phrase of BANNED) {
    if (whole.toLowerCase().includes(phrase.toLowerCase())) {
      problems.push(`${rel}: banned claim "${phrase}"`);
    }
  }
  const placeholder = whole.match(PLACEHOLDER);
  if (placeholder) {
    problems.push(`${rel}: unfilled placeholder ${placeholder[0]}`);
  }

  // Check 1 — scenario rows.
  if (results) {
    for (const scenario of results.scenarios) {
      const key = slug(scenario.name);
      const wanted = [fmt(scenario.metrics.personDelayS.fixed), fmt(scenario.metrics.personDelayS.adaptive)];
      const rows = lines.filter((line) => line.trimStart().startsWith('|') && slug(line).includes(key));
      if (rows.length === 0) continue;
      // At least one row for the scenario (the person-delay table) must quote both
      // measured means. Secondary tables may legitimately show other metrics only.
      const quoted = rows.some((row) => wanted.every((value) => row.includes(value)));
      if (!quoted) {
        problems.push(
          `${rel}: no table row for "${scenario.name}" quotes ${wanted[0]}s / ${wanted[1]}s from results.json\n    ${rows[0].trim()}`,
        );
      }
    }
  }

  // Check 2 — EVP sweep rows.
  if (sweep) {
    for (const point of sweep.distances) {
      const rowPattern = new RegExp(`^\\|\\s*${point.distanceM}\\s*m\\s*\\|`);
      const row = lines.find((line) => rowPattern.test(line));
      if (!row) continue;
      for (const value of [fmt(point.fixedEmsDelayS.mean), fmt(point.adaptiveEmsDelayS.mean)]) {
        if (!row.includes(value)) {
          problems.push(
            `${rel}: EVP row for ${point.distanceM} m does not quote ${value}s from ems-sweep.json\n    ${row.trim()}`,
          );
        }
      }
    }
  }
}

if (problems.length > 0) {
  console.error('docs:check FAILED\n');
  for (const p of problems) console.error(`  - ${p}`);
  console.error(`\n${problems.length} problem(s). Regenerate docs from the artefacts, do not retype numbers.`);
  process.exit(1);
}

console.log(
  `docs:check OK — ${results?.scenarios.length ?? 0} scenarios and ${sweep?.distances.length ?? 0} sweep points verified against the artefacts.`,
);
