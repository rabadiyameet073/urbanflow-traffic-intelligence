/**
 * Module 16 §6: The Debug Bundle
 *
 * Captures self-contained, reproducible simulation and operational diagnostics
 * for instant one-click export and headless replay without leaking secrets or PII.
 *
 * The bundle is built in `core`, so it may not read the clock or the user agent
 * itself (ADR-001, Module 10 §3): both are supplied by the IO shell that owns the
 * export button, which is the only place that knows the human's wall clock.
 */
import { z } from 'zod';

export const DebugBundleSchema = z.object({
  appVersion: z.string(),
  seed: z.number().finite().int(),
  scenarioId: z.string(),
  // `unknown`, not `any`: a replayed input log is untrusted input (Module 14 §4.5).
  inputLog: z.array(z.object({
    t: z.number().finite(),
    action: z.string(),
    payload: z.unknown().optional(),
  })),
  /**
   * Simulated time at export, so a replay can stop on the exact tick the hash
   * was taken. Optional because bundles written before T23 lack it; a missing
   * value means "replay the default window", not "assume zero".
   */
  tSimS: z.number().finite().nonnegative().optional(),
  stateHash: z.string(),
  userAgent: z.string(),
  consoleLogs: z.array(z.string()),
  kernelCounters: z.record(z.number().finite()),
  featureFlags: z.record(z.boolean()),
  degradationLevel: z.enum(['Full', 'Level1', 'Level2', 'Level3', 'Level4']),
  exportedAt: z.string(),
});

export type DebugBundle = z.infer<typeof DebugBundleSchema>;

/**
 * Creates a sanitized, reproducible debug bundle object.
 *
 * `appVersion`, `exportedAt` and `userAgent` are required: they are facts about
 * the *host*, and a default here would be a fabricated identifier in a bug report
 * (Rule 00). `stateHash` is what `pnpm repro` compares, so it is required too.
 */
export function createDebugBundle(params: {
  appVersion: string;
  seed: number;
  scenarioId: string;
  /** ISO-8601 from the IO shell's real clock, at the moment of export. */
  exportedAt: string;
  /** `navigator.userAgent` from the IO shell. */
  userAgent: string;
  inputLog?: Array<{ t: number; action: string; payload?: unknown }>;
  /** Simulated time of the export, forwarded from the worker's read model. */
  tSimS?: number;
  stateHash: string;
  consoleLogs?: string[];
  kernelCounters?: Record<string, number>;
  featureFlags?: Record<string, boolean>;
  degradationLevel?: 'Full' | 'Level1' | 'Level2' | 'Level3' | 'Level4';
}): DebugBundle {
  return {
    appVersion: params.appVersion,
    seed: params.seed,
    scenarioId: params.scenarioId,
    inputLog: params.inputLog ?? [],
    ...(params.tSimS === undefined ? {} : { tSimS: params.tSimS }),
    stateHash: params.stateHash,
    userAgent: params.userAgent,
    consoleLogs: (params.consoleLogs ?? []).slice(-50), // last 50 logs only
    kernelCounters: params.kernelCounters ?? {},
    featureFlags: params.featureFlags ?? { copilot: true, liveRooms: true, visionMode: true },
    degradationLevel: params.degradationLevel ?? 'Full',
    exportedAt: params.exportedAt,
  };
}

/**
 * Validates a debug bundle.
 */
export function validateDebugBundle(raw: unknown): { valid: boolean; data?: DebugBundle; error?: string } {
  const result = DebugBundleSchema.safeParse(raw);
  if (result.success) {
    return { valid: true, data: result.data };
  }
  return { valid: false, error: result.error.message };
}

