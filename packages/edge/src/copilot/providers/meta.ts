/**
 * Module 24 §1: Meta Model API provider (Muse Spark 1.3) — **the only file that
 * knows anything about the provider**: base URL, wire shapes, model ids, the
 * structured-output parameter and the pricing used for the cost meter.
 *
 * Re-check `https://dev.meta.ai` before deploying; parameter names, model ids
 * and pricing can move. Never use a `-contributor` model id: those variants let
 * Meta train on the traffic data.
 */
import type { LlmProvider, LlmRawResult, LlmRequest, ToolCallRequest } from '../llm.js';

/** `$1.25 / 1M` in and `$4.25 / 1M` out, expressed as micro-USD per token. */
export const MODEL_PRICING = {
  inputMicroUsdPerToken: 1.25,
  outputMicroUsdPerToken: 4.25,
} as const;

/** Module 24 §1: the recommended model. `-contributor` variants are forbidden. */
export const DEFAULT_MODEL = 'muse-spark-1.3';

/**
 * Module 24 §4: the structured-output schema, in JSON Schema form because that
 * is what the provider's `response_format` takes. It mirrors
 * `DiagnosisV1Schema` field for field; `schemas.test` asserts the two agree, so
 * a change on one side cannot silently diverge from the other.
 */
export const DIAGNOSIS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'severity',
    'rootCauseHypotheses',
    'spillbackRisk',
    'recommendedActions',
    'advisoryText',
    'signMessage',
  ],
  properties: {
    severity: { type: 'string', enum: ['info', 'warning', 'critical'] },
    rootCauseHypotheses: {
      type: 'array',
      minItems: 1,
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['cause', 'confidence', 'evidence'],
        properties: {
          cause: {
            type: 'string',
            enum: [
              'BLOCKED_LANE',
              'CAPACITY_DROP',
              'DEMAND_SURGE',
              'SIGNAL_FAULT',
              'BUS_BUNCHING',
              'EMS_OBSTRUCTED',
              'NORMAL_VARIATION',
            ],
          },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          evidence: { type: 'array', maxItems: 4, items: { type: 'string' } },
        },
      },
    },
    spillbackRisk: {
      type: 'object',
      additionalProperties: false,
      required: ['upstream', 'minutesToSpillback'],
      properties: {
        upstream: { type: 'boolean' },
        minutesToSpillback: { type: ['number', 'null'] },
      },
    },
    recommendedActions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'rationale'],
        properties: {
          type: {
            type: 'string',
            enum: ['ADJUST_PARAMS', 'ADVISE_DIVERSION', 'DISPATCH_CREW', 'MONITOR'],
          },
          params: {
            type: 'object',
            additionalProperties: false,
            properties: {
              G_MIN_EFFICIENT_S: { type: 'number', minimum: 12, maximum: 40 },
              RATIO: { type: 'number', minimum: 1.5, maximum: 6 },
              FLOOR: { type: 'number', minimum: 0, maximum: 20 },
              GAP_S: { type: 'number', minimum: 1, maximum: 6 },
              alpha: { type: 'number', minimum: 0, maximum: 3 },
              beta: { type: 'number', minimum: 0, maximum: 3 },
              gamma: { type: 'number', minimum: 0, maximum: 3 },
            },
          },
          rationale: { type: 'string' },
        },
      },
    },
    advisoryText: { type: 'string', maxLength: 280 },
    signMessage: {
      type: 'array',
      maxItems: 2,
      items: { type: 'string', maxLength: 24, pattern: '^[A-Z0-9 .,:!/-]{0,24}$' },
    },
  },
} as const;

interface ChatCompletionBody {
  choices?: {
    message?: {
      content?: string | null;
      tool_calls?: {
        id?: string;
        function?: { name?: string; arguments?: string };
      }[];
    };
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * Module 24 §8: the advisory output, in JSON Schema form. VMS lines carry the
 * VMS character set and the 24-character limit the display actually enforces,
 * so a model that writes lowercase prose fails validation instead of shipping
 * a sign that cannot be rendered.
 */
export const ADVISORY_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['advisoryText', 'signMessage'],
  properties: {
    advisoryText: { type: 'string', maxLength: 280 },
    signMessage: {
      type: 'array',
      maxItems: 2,
      items: { type: 'string', maxLength: 24, pattern: '^[A-Z0-9 .,:!/-]{0,24}$' },
    },
  },
} as const;

export class MetaProvider implements LlmProvider {
  public readonly name = 'meta' as const;
  public readonly source = 'muse-spark' as const;
  public readonly modelId: string;
  private readonly apiKey?: string;
  private readonly baseUrl: string;

  constructor(apiKey?: string, baseUrl = 'https://api.meta.ai/v1', model = DEFAULT_MODEL) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.modelId = model;
  }

  public isAvailable(): boolean {
    return Boolean(this.apiKey && this.apiKey.length > 5);
  }

  public async complete(
    req: LlmRequest,
    opts: { signal: AbortSignal; timeoutMs: number },
  ): Promise<LlmRawResult> {
    const t0 = Date.now();
    if (!this.isAvailable()) {
      return this.failure('UNCONFIGURED', 0, 'META_API_KEY not configured');
    }

    // Module 24 §8: an unbounded await is a cost incident waiting to happen.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs);
    const onAbort = (): void => controller.abort();
    opts.signal.addEventListener('abort', onAbort);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.modelId,
          // Module 24 §5: a tool round continues the conversation the router
          // built; a first turn is system + the delimited user input.
          messages: req.messages
            ? [{ role: 'system', content: req.system }, ...req.messages]
            : [
                { role: 'system', content: req.system },
                { role: 'user', content: userTurn(req) },
              ],
          ...(req.tools && req.tools.length > 0
            ? {
                tools: req.tools.map((tool) => ({
                  type: 'function',
                  function: {
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.parameters,
                  },
                })),
                // Our code drives the loop; the model may answer or call one
                // tool per turn, never auto-execute anything.
                tool_choice: 'auto',
              }
            : {}),
          ...(req.jsonSchema
            ? {
                response_format: {
                  type: 'json_schema',
                  json_schema: { name: `${req.task}.${req.promptVersion}`, strict: true, schema: req.jsonSchema },
                },
              }
            : {}),
          max_tokens: req.maxTokens,
          temperature: req.temperature,
        }),
        signal: controller.signal,
      });

      const latencyMs = Date.now() - t0;
      if (!response.ok) {
        return this.failure(
          response.status >= 500 ? 'HTTP_5XX' : 'HTTP_4XX',
          latencyMs,
          `HTTP_${response.status}`,
        );
      }

      const body = (await response.json()) as ChatCompletionBody;
      const tokensIn = body.usage?.prompt_tokens ?? 0;
      const tokensOut = body.usage?.completion_tokens ?? 0;

      // Module 24 §5: the model asked for data, not gave an answer. Arguments
      // arrive as a JSON string; anything unparsable becomes an empty object,
      // which the router's own arg schema will reject as an invalid call.
      const requested = body.choices?.[0]?.message?.tool_calls ?? [];
      const toolCalls: ToolCallRequest[] = requested.map((call, index) => {
        let args: Record<string, unknown> = {};
        try {
          const parsedArgs: unknown = JSON.parse(call.function?.arguments ?? '{}');
          if (parsedArgs !== null && typeof parsedArgs === 'object') {
            args = parsedArgs as Record<string, unknown>;
          }
        } catch {
          args = {};
        }
        return {
          id: call.id ?? `call_${index}`,
          name: call.function?.name ?? '',
          args,
        };
      });

      return {
        ok: true,
        text: body.choices?.[0]?.message?.content ?? '',
        ...(toolCalls.length > 0 ? { toolCalls } : {}),
        tokensIn,
        tokensOut,
        // Integer micro-USD; never a float (Module 26 §3).
        costMicroUsd: Math.round(
          tokensIn * MODEL_PRICING.inputMicroUsdPerToken + tokensOut * MODEL_PRICING.outputMicroUsdPerToken,
        ),
        latencyMs,
      };
    } catch (err) {
      const aborted = err instanceof Error && err.name === 'AbortError';
      return this.failure(
        aborted ? 'TIMEOUT' : 'HTTP_5XX',
        Date.now() - t0,
        aborted ? 'aborted after timeout' : 'network error',
      );
    } finally {
      clearTimeout(timeoutId);
      opts.signal.removeEventListener('abort', onAbort);
    }
  }

  private failure(code: LlmRawResult['code'], latencyMs: number, detail: string): LlmRawResult {
    return { ok: false, text: '', tokensIn: 0, tokensOut: 0, costMicroUsd: 0, latencyMs, code, detail };
  }
}

/**
 * The user turn. A repair hint is *model feedback* appended after the data, so
 * it can never be confused with the system rules that bound what may change.
 */
function userTurn(req: LlmRequest): string {
  const body = typeof req.input === 'string' ? req.input : JSON.stringify(req.input);
  if (!req.repairHint) return body;
  return `${body}\n\nYour previous answer was rejected: ${req.repairHint}\nReturn corrected JSON only.`;
}
