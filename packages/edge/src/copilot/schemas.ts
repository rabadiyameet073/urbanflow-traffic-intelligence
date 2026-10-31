/**
 * Module 24 & Module 04: Copilot Output Schemas & Semantic Verifiers
 */
import { z } from 'zod';
import { AdaptiveParamsSchema } from '@urbanflow/core';

export const ROOT_CAUSES = [
  'BLOCKED_LANE',
  'CAPACITY_DROP',
  'DEMAND_SURGE',
  'SIGNAL_FAULT',
  'BUS_BUNCHING',
  'EMS_OBSTRUCTED',
  'NORMAL_VARIATION',
] as const;

export const HypothesisSchema = z.object({
  cause: z.enum(ROOT_CAUSES),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()).max(4),
});

export const RecommendedActionSchema = z.object({
  type: z.enum(['ADJUST_PARAMS', 'ADVISE_DIVERSION', 'DISPATCH_CREW', 'MONITOR']),
  params: AdaptiveParamsSchema.partial().optional(),
  rationale: z.string(),
});

export const DiagnosisV1Schema = z.object({
  severity: z.enum(['info', 'warning', 'critical']),
  rootCauseHypotheses: z.array(HypothesisSchema).min(1).max(3),
  spillbackRisk: z.object({
    upstream: z.boolean(),
    minutesToSpillback: z.number().nullable(),
  }),
  recommendedActions: z.array(RecommendedActionSchema),
  advisoryText: z.string().max(280),
  signMessage: z.array(z.string().regex(/^[A-Z0-9 .,:!/-]{0,24}$/)).max(2),
});

export type DiagnosisV1 = z.infer<typeof DiagnosisV1Schema>;

/**
 * Semantic check: verify that all numbers cited in evidence[] exist in input JSON.
 */
export function verifySemanticNumbers(diagnosis: DiagnosisV1, rawInput: string): boolean {
  // Extract all numeric tokens from rawInput
  const inputNumbers = new Set(
    (rawInput.match(/-?\d+(\.\d+)?/g) ?? []).map((n) => parseFloat(n).toFixed(1)),
  );

  for (const hypo of diagnosis.rootCauseHypotheses) {
    for (const ev of hypo.evidence) {
      const citedNumbers = ev.match(/-?\d+(\.\d+)?/g) ?? [];
      for (const num of citedNumbers) {
        const rounded = parseFloat(num).toFixed(1);
        if (!inputNumbers.has(rounded)) {
          // Permissive tolerance check (+- 0.5 for rounding)
          const parsed = parseFloat(num);
          let foundApprox = false;
          for (const inNum of inputNumbers) {
            if (Math.abs(parseFloat(inNum) - parsed) <= 0.6) {
              foundApprox = true;
              break;
            }
          }
          if (!foundApprox) return false;
        }
      }
    }
  }
  return true;
}
