/**
 * Module 24 §5 / Module 04 §3.3: operator-chat function calling.
 *
 * The edge is stateless — the browser owns the twin — so the chat request may
 * carry a bounded, read-only `snapshot` of what the twin measured, and these
 * tools resolve against *it*. Every rule in §5 lives here:
 *   - read-only: resolution never touches signal state (Rule 08);
 *   - args validated with enums/ints and bounds, again, on receipt;
 *   - results are wrapped as `{"tool_result": …}` — data, never instructions;
 *   - an unknown tool or invalid args returns an error result to the model
 *     once; a second violation aborts the loop to the template rung.
 */
import { z } from 'zod';
import { LANES, PHASES, SIGNAL_INDICATIONS, ANOMALY_TYPES } from '@urbanflow/core';
import type { ToolSpec } from './llm.js';

const ISO_LEN = 32;

/**
 * The browser-supplied evidence base for one chat session. Bounded per array so
 * a 8 KB request cannot smuggle an unbounded table; numbers only, no free text
 * (the same discipline as `DiagnosisWindowV1`, module 04 §3.1). Module 55 §2
 * rule 3: every numeric is `.finite()` — an Infinity reaching the copilot
 * would render as an unfalsifiable claim in the answer.
 */
export const ChatSnapshotSchema = z.object({
  runId: z.string().min(1).max(64),
  simTimeS: z.number().finite().nonnegative(),
  laneMetrics: z
    .array(
      z.object({
        lane: z.enum(LANES),
        windowStart: z.string().max(ISO_LEN),
        vehicleCount: z.number().finite().int().nonnegative(),
        weightedDelay: z.number().finite().nonnegative(),
        maxQueueM: z.number().finite().nonnegative(),
        avgSpeedKmh: z.number().finite().nonnegative().nullable(),
        pressureIndex: z.number().finite().nonnegative(),
      }),
    )
    .max(160),
  signalHistory: z
    .array(
      z.object({
        tSimS: z.number().finite().nonnegative(),
        phase: z.enum(PHASES).nullable(),
        indication: z.enum(SIGNAL_INDICATIONS),
      }),
    )
    .max(200),
  evpTimeline: z
    .array(
      z.object({
        id: z.string().max(48),
        lane: z.enum(LANES),
        decision: z.enum(['accepted', 'rejected']),
        reason: z.string().max(32).nullable(),
        tSimS: z.number().finite().nonnegative(),
      }),
    )
    .max(50),
  anomalies: z
    .array(
      z.object({
        type: z.enum(ANOMALY_TYPES),
        lane: z.enum(LANES),
        severity: z.enum(['info', 'warning', 'critical']),
        windowStart: z.string().max(ISO_LEN),
      }),
    )
    .max(50),
  scenarioResults: z
    .array(
      z.object({
        id: z.string().max(48),
        personDelayS: z.number().finite().nonnegative(),
        deltaPct: z.number().finite(),
      }),
    )
    .max(30),
});

export type ChatSnapshot = z.infer<typeof ChatSnapshotSchema>;

/** Module 04 §3.3: the five read-only tools, exactly. */
const GetLaneMetricsArgs = z.object({ lane: z.enum(LANES) });
const GetSignalHistoryArgs = z.object({ n: z.number().finite().int().min(1).max(200) });
const GetScenarioResultsArgs = z.object({ id: z.string().min(1).max(48) });
const NoArgs = z.object({}).passthrough();

const TOOL_ARGS = {
  getLaneMetrics: GetLaneMetricsArgs,
  getSignalHistory: GetSignalHistoryArgs,
  getEvpTimeline: NoArgs,
  getScenarioResults: GetScenarioResultsArgs,
  getAnomalies: NoArgs,
} as const;

export type ToolName = keyof typeof TOOL_ARGS;

export const CHAT_TOOL_SPECS: ToolSpec[] = [
  {
    name: 'getLaneMetrics',
    description: 'Recent 10 s window metrics for one approach lane.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['lane'],
      properties: { lane: { type: 'string', enum: [...LANES] } },
    },
  },
  {
    name: 'getSignalHistory',
    description: 'The last n signal phase/indication changes of this run.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['n'],
      properties: { n: { type: 'integer', minimum: 1, maximum: 200 } },
    },
  },
  {
    name: 'getEvpTimeline',
    description: 'All emergency-vehicle preemption requests and decisions so far.',
    parameters: { type: 'object', additionalProperties: false, properties: {} },
  },
  {
    name: 'getScenarioResults',
    description: 'Benchmark results for one recorded scenario id.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      properties: { id: { type: 'string', minLength: 1, maxLength: 48 } },
    },
  },
  {
    name: 'getAnomalies',
    description: 'Anomaly events detected in this run so far.',
    parameters: { type: 'object', additionalProperties: false, properties: {} },
  },
];

export type ToolResolution =
  | { ok: true; result: unknown; summary: string }
  | { ok: false; error: string };

/**
 * Resolve one tool call against the snapshot. `unknown tool` and invalid args
 * answer the model with an error result (§5) — the caller counts violations and
 * aborts to template on the second one.
 */
export function resolveToolCall(
  name: string,
  rawArgs: Record<string, unknown>,
  snapshot: ChatSnapshot,
): ToolResolution {
  const argsSchema = (TOOL_ARGS as Record<string, z.ZodTypeAny>)[name];
  if (!argsSchema) return { ok: false, error: `unknown tool: ${name}` };

  const parsed = argsSchema.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: `invalid args for ${name}: ${issue ? `${issue.path.join('.') || '(root)'} ${issue.message}` : 'schema mismatch'}`,
    };
  }

  switch (name as ToolName) {
    case 'getLaneMetrics': {
      const { lane } = parsed.data as { lane: ChatSnapshot['laneMetrics'][number]['lane'] };
      const rows = snapshot.laneMetrics.filter((row) => row.lane === lane).slice(-20);
      return {
        ok: true,
        result: rows,
        summary: `${rows.length} window(s) for ${lane}`,
      };
    }
    case 'getSignalHistory': {
      const { n } = parsed.data as { n: number };
      const rows = snapshot.signalHistory.slice(-n);
      return { ok: true, result: rows, summary: `${rows.length} change(s)` };
    }
    case 'getEvpTimeline':
      return {
        ok: true,
        result: snapshot.evpTimeline,
        summary: `${snapshot.evpTimeline.length} request(s)`,
      };
    case 'getScenarioResults': {
      const { id } = parsed.data as { id: string };
      const row = snapshot.scenarioResults.find((s) => s.id === id);
      if (!row) return { ok: false, error: `no recorded scenario with id ${id}` };
      return { ok: true, result: row, summary: `scenario ${id}` };
    }
    case 'getAnomalies':
      return {
        ok: true,
        result: snapshot.anomalies,
        summary: `${snapshot.anomalies.length} event(s)`,
      };
  }
}

/** §5: tool outputs arrive to the model as data, never as instructions. */
export function wrapToolResult(result: unknown): string {
  return JSON.stringify({ tool_result: result });
}

export function wrapToolError(error: string): string {
  return JSON.stringify({ tool_result: null, error });
}
