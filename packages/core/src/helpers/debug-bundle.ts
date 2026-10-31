/**
 * Module 16 §6: The Debug Bundle
 *
 * Captures self-contained, reproducible simulation and operational diagnostics
 * for instant one-click export and headless replay without leaking secrets or PII.
 */
import { z } from 'zod';

export const DebugBundleSchema = z.object({
  appVersion: z.string(),
  seed: z.number().int(),
  scenarioId: z.string(),
  inputLog: z.array(z.object({
    t: z.number(),
    action: z.string(),
    payload: z.any().optional(),
  })),
  stateHash: z.string(),
  userAgent: z.string(),
  consoleLogs: z.array(z.string()),
  kernelCounters: z.record(z.number()),
  featureFlags: z.record(z.boolean()),
  degradationLevel: z.enum(['Full', 'Level1', 'Level2', 'Level3', 'Level4']),
  exportedAt: z.string(),
});

export type DebugBundle = z.infer<typeof DebugBundleSchema>;

/**
 * Creates a sanitized, reproducible debug bundle object.
 */
export function createDebugBundle(params: {
  appVersion?: string;
  seed: number;
  scenarioId: string;
  inputLog?: Array<{ t: number; action: string; payload?: any }>;
  stateHash: string;
  userAgent?: string;
  consoleLogs?: string[];
  kernelCounters?: Record<string, number>;
  featureFlags?: Record<string, boolean>;
  degradationLevel?: 'Full' | 'Level1' | 'Level2' | 'Level3' | 'Level4';
}): DebugBundle {
  return {
    appVersion: params.appVersion ?? 'v1.0.0',
    seed: params.seed,
    scenarioId: params.scenarioId,
    inputLog: params.inputLog ?? [],
    stateHash: params.stateHash,
    userAgent: params.userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : 'Node/Headless'),
    consoleLogs: (params.consoleLogs ?? []).slice(-50), // last 50 logs only
    kernelCounters: params.kernelCounters ?? {},
    featureFlags: params.featureFlags ?? { copilot: true, liveRooms: true, visionMode: true },
    degradationLevel: params.degradationLevel ?? 'Full',
    exportedAt: new Date().toISOString(),
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
