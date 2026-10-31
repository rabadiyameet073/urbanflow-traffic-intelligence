/**
 * Module 24: Deterministic Template Provider
 * Never fails. Acts as inviolable fallback when AI is unavailable, exhausted, or failing.
 */
import { DiagnosisV1 } from '../schemas.js';

export class TemplateProvider {
  public readonly name = 'template' as const;

  public diagnose(windowData: any): DiagnosisV1 {
    // Inspect basic metrics from windowData
    let maxQueue = 0;
    let worstLane = 'NB-TR';

    if (windowData?.lanes) {
      for (const [lane, data] of Object.entries(windowData.lanes as Record<string, any>)) {
        if (data.queueLengthM > maxQueue) {
          maxQueue = data.queueLengthM;
          worstLane = lane;
        }
      }
    }

    if (maxQueue > 120) {
      return {
        severity: 'critical',
        rootCauseHypotheses: [
          {
            cause: 'BLOCKED_LANE',
            confidence: 0.88,
            evidence: [`Lane ${worstLane} queue reached ${maxQueue.toFixed(1)}m in window`],
          },
          {
            cause: 'DEMAND_SURGE',
            confidence: 0.45,
            evidence: [`Heavy inflow detected across approach`],
          },
        ],
        spillbackRisk: {
          upstream: true,
          minutesToSpillback: 4.5,
        },
        recommendedActions: [
          {
            type: 'DISPATCH_CREW',
            rationale: `Inspect possible physical blockage on ${worstLane}`,
          },
          {
            type: 'ADJUST_PARAMS',
            params: { G_MIN_EFFICIENT_S: 30, RATIO: 2.2 },
            rationale: `Flush congested arterial approach ${worstLane}`,
          },
        ],
        advisoryText: `Severe congestion on ${worstLane} (queue ${maxQueue.toFixed(0)}m). Traffic enforcement crew dispatched.`,
        signMessage: ['CONGESTION AHEAD', 'USE ALT ROUTE'],
      };
    }

    return {
      severity: 'info',
      rootCauseHypotheses: [
        {
          cause: 'NORMAL_VARIATION',
          confidence: 0.95,
          evidence: [`Queues across all lanes balanced within capacity limits`],
        },
      ],
      spillbackRisk: {
        upstream: false,
        minutesToSpillback: null,
      },
      recommendedActions: [
        {
          type: 'MONITOR',
          rationale: 'System operating within optimal efficiency bounds',
        },
      ],
      advisoryText: 'Traffic flowing normally through intersection.',
      signMessage: ['FLOW NORMAL', 'DRIVE SAFELY'],
    };
  }

  public explain(decisionLog: any): string {
    const phase = decisionLog?.requestedPhase ?? 'P2_NS_THRU';
    const rule = decisionLog?.reason ?? 'RATIO';
    return `Adaptive controller chose ${phase} triggered by the ${rule} rule. Phase pressures showed significant arterial demand advantage.`;
  }

  public advisory(diagnosis: DiagnosisV1): { advisoryText: string; signMessage: string[] } {
    return {
      advisoryText: diagnosis.advisoryText,
      signMessage: diagnosis.signMessage,
    };
  }
}
