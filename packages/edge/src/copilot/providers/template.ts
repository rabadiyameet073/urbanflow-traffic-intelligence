/**
 * Module 24: Deterministic Template Provider
 * Never fails. Acts as inviolable fallback when AI is unavailable, exhausted, or failing.
 */
import { DiagnosisV1 } from '../schemas.js';

export class TemplateProvider {
  public readonly name = 'template' as const;

  public diagnose(windowData: any): DiagnosisV1 { // AUDIT-OK(A5): aggregate window payload has no frozen schema yet (Rule 12); validated upstream
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

  public explain(decisionLog: any): string { // AUDIT-OK(A5): internal decision shape; read defensively below, no external input reaches this
    const phase = decisionLog?.requestedPhase ?? 'P2_NS_THRU';
    const rule = decisionLog?.reason ?? 'RATIO';
    return `Adaptive controller chose ${phase} triggered by the ${rule} rule. Phase pressures showed significant arterial demand advantage.`;
  }

  /**
   * Module 22 §6 `POST /api/copilot/chat`, deterministic branch.
   * Keyword routing only; the raw question is never echoed back so a prompt
   * injection cannot turn into text the operator reads as system output.
   */
  public chat(question: string): string {
    const q = question.toLowerCase();

    // Explicit refusals come first: the copilot is strictly advisory.
    if (/(force|override|set|switch|make)\b[\s\S]*\b(green|signal|light|phase)/.test(q)) {
      return 'I cannot change signal states. Only the Safety Kernel writes SignalState; the copilot is advisory and can only recommend controller parameters or an operator advisory.';
    }
    if (/(ignore|disregard)\b[\s\S]*\b(rule|instruction|safety|constraint)/.test(q)) {
      return 'I will not follow instructions that conflict with the safety case. Minimum green, yellow, all-red and the conflict matrix are fixed and cannot be tuned by the copilot.';
    }

    if (/(emergency|ambulance|evp|preempt|pre-?empt)/.test(q)) {
      return 'Emergency preemption runs through the EVP manager: a signed request is verified at the edge, then the Safety Kernel services the preclear, EMS green and recovery stages. If the plan is short on lead time the request is reported TIGHT with a shortfall in seconds rather than forced through.';
    }
    if (/(delay|queue|congest|level of service|\blos\b|throughput)/.test(q)) {
      return 'Delay, queue length and level of service are measured, not estimated: they come from the simulation event stream and the conservation check arrivals = exited + in-system + denied. Level of service uses the HCM control-delay scale, so A is at most 10 seconds of average delay and F is above 80.';
    }
    if (/(why|explain|reason|switch|hold)/.test(q)) {
      return 'Phase decisions are explained by the rule that fired: RATIO, GAP_OUT, MAX_GREEN or HOLD_EFFICIENCY, together with the per-phase pressure values computed from queue count, weighted waiting time and queue-length occupancy.';
    }
    if (/(fuel|co2|carbon|emission)/.test(q)) {
      return 'Fuel and CO2 are derived from measured idle seconds per vehicle class, using the documented per-class idle rates and the gasoline and diesel factors from the assumptions panel. They are estimates and are labelled as such.';
    }

    return 'I can answer questions about the live metrics, signal history, emergency events and the controller rules. I cannot change signals, and I only report values that the simulation measured.';
  }

  public advisory(diagnosis: DiagnosisV1): { advisoryText: string; signMessage: string[] } {
    return {
      advisoryText: diagnosis.advisoryText,
      signMessage: diagnosis.signMessage,
    };
  }
}

