/**
 * Module 16 §6: The Repro CLI (pnpm repro <bundle.json>)
 *
 * Reads a self-contained Debug Bundle, replays the exact simulation headless,
 * and asserts that the resulting state hash matches bit-identically across environments.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  DebugBundle,
  validateDebugBundle,
  SimEngine,
  AdaptiveController,
  FixedTimeController,
  SafetyKernel,
  TIMING,
  SCENARIO_LIBRARY,
  BenchmarkScenario,
} from '@urbanflow/core';

export interface ReproResult {
  reproduced: boolean;
  expectedHash: string;
  actualHash: string;
  scenarioId: string;
  seed: number;
  ticks: number;
}

export function runRepro(bundle: DebugBundle, defaultTicks = 600): ReproResult {
  const scenario = SCENARIO_LIBRARY.find((s: BenchmarkScenario) => s.id === bundle.scenarioId) ?? SCENARIO_LIBRARY[0]!;
  const config = scenario.buildConfig(bundle.seed);

  const sim = new SimEngine({
    seed: bundle.seed,
    laneDemandVph: config.laneDemandVph,
  });
  const kernel = new SafetyKernel();
  const ctrl = new AdaptiveController();

  const totalTicks = bundle.inputLog.length > 0
    ? Math.max(defaultTicks, Math.ceil(bundle.inputLog[bundle.inputLog.length - 1]!.t / TIMING.SIM_DT_S))
    : defaultTicks;

  for (let t = 0; t < totalTicks; t++) {
    const obs = sim.observe();
    const action = ctrl.decide(obs);
    const signal = kernel.step(action, null, TIMING.SIM_DT_S);
    sim.step(signal);
  }

  const actualHash = sim.stateHash();
  const reproduced = actualHash === bundle.stateHash;

  return {
    reproduced,
    expectedHash: bundle.stateHash,
    actualHash,
    scenarioId: bundle.scenarioId,
    seed: bundle.seed,
    ticks: totalTicks,
  };
}

// CLI runner if executed directly
if (process.argv[1]?.endsWith('repro.ts') || process.argv[1]?.endsWith('repro.js')) {
  const bundlePath = process.argv[2];
  if (!bundlePath) {
    console.error('Usage: pnpm repro <path/to/debug-bundle.json>');
    process.exit(1);
  }

  const fullPath = path.resolve(process.cwd(), bundlePath);
  if (!fs.existsSync(fullPath)) {
    console.error(`File not found: ${fullPath}`);
    process.exit(1);
  }

  const rawJson = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
  const validation = validateDebugBundle(rawJson);
  if (!validation.valid || !validation.data) {
    console.error(`Invalid debug bundle schema: ${validation.error}`);
    process.exit(1);
  }

  console.log(`Replaying Debug Bundle for scenario: ${validation.data.scenarioId}, seed: ${validation.data.seed}...`);
  const result = runRepro(validation.data);

  if (result.reproduced) {
    console.log(`[Repro SUCCESS] State hash verified bit-identically: ${result.actualHash}`);
    process.exit(0);
  } else {
    console.error(`[Repro MISMATCH] Expected hash ${result.expectedHash}, but got ${result.actualHash}`);
    process.exit(1);
  }
}
