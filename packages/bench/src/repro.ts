/**
 * Module 16 §6: The Repro CLI (pnpm repro <bundle.json>)
 *
 * Reads a self-contained Debug Bundle, replays the exact simulation headless,
 * and asserts that the resulting state hash matches bit-identically across environments.
 *
 * The replay runs a full `TwinWorld` — both twins, the kernel and the EVP
 * manager — and re-applies every command in the bundle's input log at the tick
 * it was recorded, because a bundle from an edited session is not a bundle
 * from a clean one. Ignoring the log (as earlier builds did) silently answered
 * a question nobody asked; a mismatch now means the *bundle* failed to
 * reproduce, which is the only honest reading.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  DebugBundle,
  validateDebugBundle,
  parseCommand,
  TwinWorld,
  TIMING,
  SCENARIO_LIBRARY,
  BenchmarkScenario,
  DEFAULT_SIM_CONFIG,
  SimConfigSchema,
} from '@urbanflow/core';
import type { SimConfig, WorkerCommand } from '@urbanflow/core';

export interface ReproResult {
  reproduced: boolean;
  expectedHash: string;
  actualHash: string;
  scenarioId: string;
  seed: number;
  ticks: number;
  /** Input-log entries whose payload failed wire validation and were skipped. */
  skippedCommands: number;
}

export function runRepro(bundle: DebugBundle, defaultTicks = 600): ReproResult {
  const scenario = SCENARIO_LIBRARY.find((s: BenchmarkScenario) => s.id === bundle.scenarioId) ?? SCENARIO_LIBRARY[0]!;
  // A scenario builds a *partial* config; `TwinWorld` needs the complete shape,
  // resolved exactly like the web store does, or the replay starts from a
  // different world than the one the operator watched.
  const config: SimConfig = SimConfigSchema.parse({
    ...DEFAULT_SIM_CONFIG,
    ...scenario.buildConfig(bundle.seed),
    seed: bundle.seed,
  });
  const world = new TwinWorld(bundle.scenarioId, bundle.seed, config);

  // Group the log by tick, exactly as `TwinWorld` recorded it.
  const byTick = new Map<number, WorkerCommand[]>();
  let skippedCommands = 0;
  for (const entry of bundle.inputLog) {
    const parsed = parseCommand(entry.payload);
    if (!parsed.ok) {
      skippedCommands++;
      continue;
    }
    const tick = Math.round(entry.t / TIMING.SIM_DT_S);
    const bucket = byTick.get(tick) ?? [];
    bucket.push(parsed.command);
    byTick.set(tick, bucket);
  }

  // Stop on the tick the export was taken at when the bundle says (T23);
  // older bundles without `tSimS` fall back to the last entry or the default.
  const lastEntryT = bundle.inputLog.length > 0 ? bundle.inputLog[bundle.inputLog.length - 1]!.t : 0;
  const horizonT = bundle.tSimS ?? lastEntryT;
  const totalTicks = Math.max(defaultTicks, Math.ceil(horizonT / TIMING.SIM_DT_S));

  for (let t = 0; t < totalTicks; t++) {
    for (const command of byTick.get(t) ?? []) {
      world.applyExternalCommand(command);
    }
    world.tick();
  }

  const actualHash = world.stateHash();
  const reproduced = actualHash === bundle.stateHash;

  return {
    reproduced,
    expectedHash: bundle.stateHash,
    actualHash,
    scenarioId: bundle.scenarioId,
    seed: bundle.seed,
    ticks: totalTicks,
    skippedCommands,
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
  if (result.skippedCommands > 0) {
    console.warn(`Note: ${result.skippedCommands} input-log entries failed wire validation and were skipped.`);
  }

  if (result.reproduced) {
    console.log(`[Repro SUCCESS] State hash verified bit-identically: ${result.actualHash}`);
    process.exit(0);
  } else {
    console.error(`[Repro MISMATCH] Expected hash ${result.expectedHash}, but got ${result.actualHash}`);
    process.exit(1);
  }
}
