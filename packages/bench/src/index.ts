/**
 * Benchmark runner entrypoint
 */
import fs from 'node:fs';
import path from 'node:path';
import { runFullBenchmark } from './runner.js';
import { runEvpSweep } from './evp_sweep.js';

console.log('Running UrbanFlow Paired-Seed Benchmark on held-out seeds [1001..1005]...');
const results = runFullBenchmark([1001, 1002, 1003, 1004, 1005]);

const outDir = path.resolve(process.cwd(), 'out');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const outPath = path.join(outDir, 'results.json');
fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8');

console.log('Running EVP Detection-Distance Sweep (150m, 300m, 500m)...');
const evpResults = runEvpSweep([42, 43, 44, 45, 46]);
const evpOutPath = path.join(outDir, 'ems-sweep.json');
fs.writeFileSync(evpOutPath, JSON.stringify(evpResults, null, 2), 'utf-8');

console.log(`Benchmark completed successfully! Results written to: ${outPath} and ${evpOutPath}`);
console.table(
  results.scenarios.map((s) => ({
    Scenario: s.name,
    'Fixed (s)': s.metrics.personDelayS.fixed,
    'Adaptive (s)': s.metrics.personDelayS.adaptive,
    'Improvement (%)': `${s.metrics.personDelayS.relPct}%`,
    '95% CI': `[${s.metrics.personDelayS.relCI95[0]}, ${s.metrics.personDelayS.relCI95[1]}]`,
    Expectation: s.expectation,
  })),
);

