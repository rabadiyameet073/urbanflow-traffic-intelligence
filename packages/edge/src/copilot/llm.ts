/**
 * Module 24 §2: the provider adapter seam.
 *
 * Providers are deliberately dumb: they turn a request into text plus a token
 * count and never decide whether that text is usable. Parsing, zod validation,
 * semantic grounding and the repair retry all live in the router, so a new
 * provider cannot accidentally acquire its own notion of "good enough".
 */
import { canonicalJson } from '@urbanflow/core';

export type LlmTask = 'diagnose' | 'explain' | 'chat' | 'advisory';

/** Module 24 §3: the badge the UI shows, one per rung of the chain. */
export type LlmSource = 'muse-spark' | 'llama-fallback' | 'template';

export type LlmErrorCode =
  | 'TIMEOUT'
  | 'HTTP_5XX'
  | 'HTTP_4XX'
  | 'INVALID_JSON'
  | 'SCHEMA_MISMATCH'
  | 'BREAKER_OPEN'
  | 'BUDGET'
  | 'UNCONFIGURED';

export interface LlmRequest {
  task: LlmTask;
  /** Module 24 §6: prompts are versioned constants, and the version is cached on. */
  promptVersion: string;
  system: string;
  /** JSON-serialisable, numbers and enums only (except chat, which is text). */
  input: unknown;
  maxTokens: number;
  temperature: number;
  /** JSON Schema for the expected structured output, or `null` for free text. */
  jsonSchema: Record<string, unknown> | null;
  /** Module 24 §5: read-only tool specs; only chat ever supplies them. */
  tools?: ToolSpec[];
  /**
   * Module 24 §5: conversation continuation for a tool round. When present it
   * replaces the single user turn — the loop is driven by *our* code, never
   * delegated to the provider's agent runtime.
   */
  messages?: ChatMessage[];
  /** Attempt number, 1-based. `> 1` means "your previous output failed; fix it". */
  attempt?: number;
  /** Validation errors from the previous attempt, fed back verbatim. */
  repairHint?: string;
}

/** Module 24 §5: a read-only tool advertisement for the provider's tools field. */
export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema for the arguments; bounds are enforced again on receipt. */
  parameters: Record<string, unknown>;
}

/** A tool invocation as the provider requested it. */
export interface ToolCallRequest {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/** One turn of a tool-loop conversation (OpenAI-compatible shape). */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string | null;
  /** assistant turns that request tools */
  tool_calls?: ToolCallRequest[];
  /** tool turns answer exactly one request */
  tool_call_id?: string;
}

/** What a provider hands back before any validation happens. */
export interface LlmRawResult {
  ok: boolean;
  text: string;
  tokensIn: number;
  tokensOut: number;
  costMicroUsd: number;
  latencyMs: number;
  code?: LlmErrorCode;
  detail?: string;
  /** Module 24 §5: set instead of `text` when the model invoked tools. */
  toolCalls?: ToolCallRequest[];
}

export type LlmResult<T> =
  | {
      ok: true;
      value: T;
      source: LlmSource;
      latencyMs: number;
      tokensIn: number;
      tokensOut: number;
      costMicroUsd: number;
      cacheHit: boolean;
    }
  | { ok: false; code: LlmErrorCode; detail?: string };

export interface LlmProvider {
  readonly name: 'meta' | 'workers-ai' | 'template' | 'ollama';
  /** The `source` badge this provider reports when it succeeds. */
  readonly source: LlmSource;
  /** False when the deployment has no key or binding: skip without a call. */
  isAvailable(): boolean;
  /** Model id used in the cache key so a model swap cannot reuse old answers. */
  readonly modelId: string;
  complete(req: LlmRequest, opts: { signal: AbortSignal; timeoutMs: number }): Promise<LlmRawResult>;
}

/**
 * Module 24 §8: `max_tokens` per task. Overridable in code, not in the request —
 * a caller that could raise its own ceiling defeats the cost control.
 */
export const MAX_TOKENS = {
  diagnose: 700,
  explain: 200,
  advisory: 250,
  chat: 500,
} as const satisfies Record<LlmTask, number>;

/** Module 24 §3: 5 minutes for explain, 60 s for diagnose and the rest. */
export const CACHE_TTL_MS = {
  diagnose: 60_000,
  chat: 60_000,
  advisory: 60_000,
  explain: 300_000,
} as const satisfies Record<LlmTask, number>;

/**
 * Module 24 §3: `sha256(task | promptVersion | canonical(input) | model)`.
 *
 * The model is part of the key on purpose: switching from Muse Spark to Llama
 * must produce a different key, otherwise a degraded answer would be served
 * later under a better badge.
 */
export async function cacheKeyFor(
  task: LlmTask,
  promptVersion: string,
  input: unknown,
  model: string,
): Promise<string> {
  let canonical: string;
  try {
    canonical = canonicalJson(input as never);
  } catch {
    // Input the canonicaliser cannot represent cannot be cached safely, and a
    // cache miss is always correct where a shared key would not be.
    return '';
  }
  const material = `${task}|${promptVersion}|${canonical}|${model}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Module 24 §3: one retry, waited out with 200–400 ms of jitter. */
export function retryDelayMs(random: () => number = Math.random): number {
  return 200 + Math.floor(random() * 201);
}

/** Module 24 §5: the loop belongs to us, and it is bounded — three rounds max. */
export const MAX_TOOL_ROUNDS = 3;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
