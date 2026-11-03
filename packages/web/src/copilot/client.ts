/**
 * Module 04 & Module 22: Copilot client.
 *
 * The browser never authors a diagnosis. It assembles the measured 60 s window,
 * posts it to `/api/copilot/diagnose`, and renders whatever comes back together
 * with its provenance badge (`muse-spark`, `llama-fallback` or `template`).
 * When the gateway is unreachable the local deterministic template produces a
 * clearly-labelled, arithmetically-derived fallback - never prose about causes
 * nobody measured.
 */
import type { LaneObservation, Observation } from '@urbanflow/core';

export type CopilotSource = 'muse-spark' | 'llama-fallback' | 'template';

export interface DiagnosisHypothesis {
  cause: string;
  confidence: number;
  evidence: string[];
}

export interface DiagnosisView {
  severity: 'info' | 'warning' | 'critical';
  rootCauseHypotheses: DiagnosisHypothesis[];
  spillbackRisk: { upstream: boolean; minutesToSpillback: number | null };
  recommendedActions: Array<{ type: string; params?: Record<string, number>; rationale: string }>;
  advisoryText: string;
  signMessage: string[];
}

export interface DiagnosisResult {
  source: CopilotSource;
  latencyMs: number;
  diagnosis: DiagnosisView;
  /** True when the gateway was unreachable and the local template answered. */
  offline: boolean;
}

export interface LaneWindowSample {
  lane: string;
  vehicleCount: number;
  queueM: number;
  weightedWaitS: number;
  arrivalsLast10s: number;
  dischargedLast10s: number;
  occupancyPct: number;
}

/** Compact `DiagnosisWindowV1` payload (Module 04 §3.1): measurements only, no free text. */
export interface DiagnosisWindow {
  simTimeS: number;
  horizonS: number;
  lanes: LaneWindowSample[];
  signal: { phase: string | null; indication: string; timeInStateS: number };
}

const SAMPLE_HORIZON_S = 60;

/**
 * Same-origin by default. A deployment can point the Copilot/EVP calls at the
 * edge gateway two ways (Module 22 §2): a build-time `VITE_API_BASE_URL` (Vercel,
 * see docs/DEPLOY.md §2b) or a runtime `<meta name="urbanflow-api-base">`. The
 * meta tag wins so a Pages/GitHub mirror can override a baked-in origin without
 * a rebuild; an empty/absent value from either keeps same-origin.
 */
function apiBase(): string {
  const meta = document.querySelector('meta[name="urbanflow-api-base"]');
  const fromMeta = meta?.getAttribute('content')?.trim();
  if (fromMeta) return fromMeta;
  return import.meta.env.VITE_API_BASE_URL?.trim() ?? '';
}

function toSample(lane: LaneObservation): LaneWindowSample {
  return {
    lane: lane.laneId,
    vehicleCount: lane.vehicleCount,
    queueM: round1(lane.queueLengthM),
    weightedWaitS: round1(lane.sumWeightedWaitS),
    arrivalsLast10s: lane.arrivalsLast10s,
    dischargedLast10s: lane.dischargedLast10s,
    occupancyPct: round1(lane.occupancyPct),
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Build the diagnosis window from a live observation. */
export function buildDiagnosisWindow(obs: Observation): DiagnosisWindow {
  const lanes = Object.values(obs.lanes).map(toSample);
  return {
    simTimeS: round1(obs.simTimeS),
    horizonS: SAMPLE_HORIZON_S,
    lanes,
    signal: {
      phase: obs.signal.phase,
      indication: obs.signal.indication,
      timeInStateS: round1(obs.signal.timeInStateS),
    },
  };
}

/**
 * Deterministic local template (Module 04 §4 provider chain, final rung).
 * Every claim is arithmetic over the supplied window.
 */
export function templateDiagnosis(win: DiagnosisWindow): DiagnosisView {
  const lanes = [...win.lanes].sort((a, b) => b.queueM - a.queueM);
  const worst = lanes[0];
  const meanArrivals =
    lanes.length > 0 ? lanes.reduce((sum, l) => sum + l.arrivalsLast10s, 0) / lanes.length : 0;

  if (!worst || worst.queueM <= 0) {
    return {
      severity: 'info',
      rootCauseHypotheses: [
        {
          cause: 'NORMAL_VARIATION',
          confidence: 0.2,
          evidence: [`No stopped queue on any approach over ${win.horizonS} s`],
        },
      ],
      spillbackRisk: { upstream: false, minutesToSpillback: null },
      recommendedActions: [{ type: 'MONITOR', rationale: 'Demand is being served within capacity.' }],
      advisoryText: `All approaches clear at t=${win.simTimeS}s. Continue monitoring.`,
      signMessage: ['ALL CLEAR', 'NORMAL OPERATION'],
    };
  }

  const surge = meanArrivals > 0 && worst.arrivalsLast10s > meanArrivals * 1.3;
  const cause = surge ? 'DEMAND_SURGE' : 'CAPACITY_DROP';
  const severity = worst.queueM >= 240 ? 'critical' : worst.queueM >= 120 ? 'warning' : 'info';

  const confidence = Math.min(0.9, Math.max(0.3, worst.queueM / 300));

  return {
    severity,
    rootCauseHypotheses: [
      {
        cause,
        confidence: round1(confidence),
        evidence: [
          `${worst.lane} queue ${worst.queueM} m over ${win.horizonS} s`,
          `${worst.lane} arrivals ${worst.arrivalsLast10s} vs mean ${round1(meanArrivals)} per 10 s`,
          `${worst.lane} weighted wait ${worst.weightedWaitS} s`,
        ],
      },
    ],
    spillbackRisk: {
      // The window carries no upstream link capacity, so the time to spillback
      // cannot be measured and is reported as unknown rather than guessed.
      upstream: worst.queueM >= 240,
      minutesToSpillback: null,
    },
    recommendedActions: [
      {
        type: 'MONITOR',
        rationale: `Hold pressure on ${worst.lane} and let the Safety Kernel keep the current split.`,
      },
    ],
    advisoryText: `${worst.lane} carries the longest queue (${worst.queueM} m). Template heuristic only; no model was called.`,
    signMessage: ['CONGESTION AHEAD', worst.lane.slice(0, 24).toUpperCase()],
  };
}

/** POST the window and normalise either the documented or the legacy response shape. */
export async function requestDiagnosis(win: DiagnosisWindow): Promise<DiagnosisResult> {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), 7000);

  try {
    const response = await fetch(`${apiBase()}/api/copilot/diagnose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ window: win }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`copilot ${response.status}`);
    }

    const body = (await response.json()) as Record<string, unknown>;
    const diagnosis = (body.diagnosis ?? body.value) as DiagnosisView | undefined;
    if (!diagnosis) throw new Error('copilot response missing diagnosis');

    return {
      source: (body.source as CopilotSource) ?? 'template',
      latencyMs: typeof body.latencyMs === 'number' ? body.latencyMs : 0,
      diagnosis,
      offline: false,
    };
  } catch {
    return {
      source: 'template',
      latencyMs: 0,
      diagnosis: templateDiagnosis(win),
      offline: true,
    };
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}
