/**
 * Module 25 §6: portable launcher for the held-out regression gate.
 * Sets the opt-in env flag and runs the gated vitest file, so the same
 * `pnpm test:regression` works on Windows and CI without extra dependencies.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const result = spawnSync(
  process.execPath,
  [
    path.join(ROOT, 'node_modules', 'vitest', 'vitest.mjs'),
    'run',
    path.join('packages', 'bench', 'test', 'regression.test.ts'),
  ],
  {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, URBANFLOW_REGRESSION: '1' },
  },
);
process.exit(result.status ?? 1);
