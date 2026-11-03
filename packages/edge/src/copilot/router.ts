/**
 * Module 24 §3: the copilot router.
 *
 * ```
 * for provider in [Meta, WorkersAI, Template]:
 *     if breaker(provider).open: continue
 *     if budget denies provider: continue
 *     result = provider.complete(req, timeout=6 s)
 *     if 5xx/timeout: retry once (jitter 200–400 ms)
 *     if result.ok and schema valid: return
 *     if schema invalid: one repair retry, else fall through
 * return Template result  (always succeeds)
 * ```
 *
 * The template branch cannot fail, so every task answers, and `source` always
 * says which rung produced the text. Nothing here mutates signal state: the
 * router's output is text plus numbers, and the safety kernel decides what, if
 * anything, happens next (Rule 08).
 */
import type { DiagnosisV1 } from './schemas.js';
import { DiagnosisV1Schema, verifySemanticNumbers } from './schemas.js';
import type { BudgetGuard } from '../budget/guard.js';
import { TemplateProvider } from './providers/template.js';
import type { MetaProvider } from './providers/meta.js';
import { ADVISORY_JSON_SCHEMA, DIAGNOSIS_JSON_SCHEMA } from './providers/meta.js';
import type { ChatMessage, LlmProvider, LlmRawResult, LlmRequest, LlmSource, LlmTask } from './llm.js';
import { CACHE_TTL_MS, MAX_TOKENS, MAX_TOOL_ROUNDS, cacheKeyFor, retryDelayMs, sleep } from './llm.js';
import { PROMPTS, USER_TURNS, delimitQuestion } from './prompts.js';
import type { ChatSnapshot } from './tools.js';
import { CHAT_TOOL_SPECS, resolveToolCall, wrapToolError, wrapToolResult } from './tools.js';
import { Logger } from '../logging.js';

export type CopilotSource = LlmSource;

export interface CopilotResponse<T> {
  source: CopilotSource;
  value: T;
  latencyMs: number;
  tokens: { in: number; out: number };
  costMicroUsd: number;
  cached: boolean;
}

// ---------------------------------------------------------------- wire shapes

/** Module 22 §6 response bodies — these are the contract, not the internals. */
export interface DiagnoseWire {
  source: CopilotSource;
  latencyMs: number;
  tokens: { in: number; out: number };
  costUsdEstimate: number;
  diagnosis: DiagnosisV1;
}

export interface ExplainWire {
  source: CopilotSource;
  text: string;
}

export interface ToolCall {
  name: string;
  /** Module 24 §5: an error result is reported to the model once, then the loop aborts. */
  status: 'ok' | 'skipped' | 'error';
  detail: string;
}

export interface ChatWire {
  source: CopilotSource;
  answer: string;
  toolCalls: ToolCall[];
}

export interface AdvisoryWire {
  source: CopilotSource;
  advisoryText: string;
  signMessage: string[];
}

export function toDiagnoseWire(res: CopilotResponse<DiagnosisV1>): DiagnoseWire {
  return {
    source: res.source,
    latencyMs: res.latencyMs,
    tokens: res.tokens,
    // Money leaves the service as dollars, but is carried as integer micro-USD
    // until this final division so accumulation cannot drift.
    costUsdEstimate: Number((res.costMicroUsd / 1_000_000).toFixed(6)),
    diagnosis: res.value,
  };
}

export function toExplainWire(res: CopilotResponse<{ text: string }>): ExplainWire {
  return { source: res.source, text: res.value.text };
}

export function toChatWire(res: CopilotResponse<{ answer: string; toolCalls: ToolCall[] }>): ChatWire {
  return { source: res.source, answer: res.value.answer, toolCalls: res.value.toolCalls };
}

export function toAdvisoryWire(res: CopilotResponse<{ advisoryText: string; signMessage: string[] }>): AdvisoryWire {
  return {
    source: res.source,
    advisoryText: res.value.advisoryText,
    signMessage: res.value.signMessage,
  };
}

// ---------------------------------------------------------------- runtime

const TEMPLATE_BADGE: CopilotSource = 'template';

const BREAKER_THRESHOLD = 3;
const BREAKER_OPEN_MS = 60_000;
const PROVIDER_TIMEOUT_MS = 6_000;
const CACHE_MAX_ENTRIES = 50;

/** Module 24 §3: retrying these is worth it; retrying a 4xx is not. */
const TRANSIENT = new Set(['TIMEOUT', 'HTTP_5XX']);

interface CacheEntry {
  value: unknown;
  source: CopilotSource;
  tokensIn: number;
  tokensOut: number;
  costMicroUsd: number;
  expiresAt: number;
}

interface Breaker {
  failures: number;
  openUntilMs: number;
}

/**
 * Best-effort, correctness-neutral state: a cache hit or an open breaker can
 * only change latency and the `source` badge, never signal state or budget
 * accounting. Authoritative counters live in the Durable Object.
 */
export class CopilotRuntime {
  private readonly breakers = new Map<string, Breaker>();
  private readonly cache = new Map<string, CacheEntry>();

  public isBreakerOpen(provider: string, nowMs = Date.now()): boolean {
    const breaker = this.breakers.get(provider);
    if (!breaker) return false;
    return nowMs < breaker.openUntilMs;
  }

  public recordSuccess(provider: string): void {
    // A successful probe closes the breaker and restores the full allowance.
    this.breakers.set(provider, { failures: 0, openUntilMs: 0 });
  }

  public recordFailure(provider: string, nowMs = Date.now()): void {
    const breaker = this.breakers.get(provider) ?? { failures: 0, openUntilMs: 0 };
    breaker.failures++;
    if (breaker.failures >= BREAKER_THRESHOLD) {
      // Open, then let exactly one probe through when the window expires.
      breaker.openUntilMs = nowMs + BREAKER_OPEN_MS;
      breaker.failures = BREAKER_THRESHOLD;
    }
    this.breakers.set(provider, breaker);
  }

  public read(key: string, nowMs = Date.now()): CacheEntry | null {
    if (key === '') return null;
    const hit = this.cache.get(key);
    if (!hit) return null;
    if (hit.expiresAt <= nowMs) {
      this.cache.delete(key);
      return null;
    }
    return hit;
  }

  public write(key: string, entry: Omit<CacheEntry, 'expiresAt'>, ttlMs: number, nowMs = Date.now()): void {
    if (key === '') return;
    if (this.cache.size >= CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next();
      if (!oldest.done) this.cache.delete(oldest.value);
    }
    this.cache.set(key, { ...entry, expiresAt: nowMs + ttlMs });
  }
}

let sharedRuntime: CopilotRuntime | null = null;

export function getCopilotRuntime(): CopilotRuntime {
  if (!sharedRuntime) sharedRuntime = new CopilotRuntime();
  return sharedRuntime;
}

/** Test seam. */
export function resetCopilotRuntime(): void {
  sharedRuntime = null;
}

// ---------------------------------------------------------------- router

interface RunOptions<T> {
  task: LlmTask;
  promptVersion: keyof typeof PROMPTS;
  input: unknown;
  system: string;
  jsonSchema: Record<string, unknown> | null;
  temperature: number;
  /** Validate the raw text into `T`, or explain why it is unusable. */
  parse: (raw: unknown) => { ok: true; value: T } | { ok: false; detail: string };
  /** Deterministic terminal answer; must not fail. */
  template: () => T;
  /** Cache only the primary provider's answer (see `run`). */
  cacheable: boolean;
}

export class CopilotRouter {
  private readonly template = new TemplateProvider();
  private readonly chain: LlmProvider[];

  constructor(
    private readonly meta: MetaProvider,
    private readonly budgetGuard?: BudgetGuard,
    private readonly runtime: CopilotRuntime = getCopilotRuntime(),
    private readonly workersAi?: LlmProvider,
  ) {
    this.chain = workersAi ? [meta, workersAi] : [meta];
  }

  public async diagnose(windowData: unknown, ipHash: string): Promise<CopilotResponse<DiagnosisV1>> {
    const inputJson = JSON.stringify(windowData);
    return this.run<DiagnosisV1>({
      task: 'diagnose',
      promptVersion: 'diagnose.v1',
      input: windowData,
      system: PROMPTS['diagnose.v1'],
      jsonSchema: DIAGNOSIS_JSON_SCHEMA as unknown as Record<string, unknown>,
      temperature: 0.1,
      cacheable: true,
      parse: (raw) => {
        const validated = DiagnosisV1Schema.safeParse(raw);
        if (!validated.success) {
          return { ok: false, detail: summariseZod(validated.error.issues) };
        }
        // Module 24 §4.4: a number the model invented is worse than no answer.
        if (!verifySemanticNumbers(validated.data, inputJson)) {
          return { ok: false, detail: 'evidence cites numbers that do not appear in the input' };
        }
        return { ok: true, value: validated.data };
      },
      template: () => this.template.diagnose(windowData),
    }, ipHash);
  }

  public async explain(decisionLog: unknown, ipHash = ''): Promise<CopilotResponse<{ text: string }>> {
    return this.run<{ text: string }>({
      task: 'explain',
      promptVersion: 'explain.v1',
      input: decisionLog,
      system: PROMPTS['explain.v1'],
      jsonSchema: null,
      temperature: 0.1,
      cacheable: true,
      parse: (raw) => {
        const text = typeof raw === 'string' ? raw.trim() : '';
        if (text.length === 0) return { ok: false, detail: 'empty answer' };
        return { ok: true, value: { text: text.slice(0, 600) } };
      },
      template: () => ({ text: this.template.explain(decisionLog) }),
    }, ipHash);
  }

  public async chat(
    question: string,
    ipHash: string,
    snapshot?: ChatSnapshot | null,
  ): Promise<CopilotResponse<{ answer: string; toolCalls: ToolCall[] }>> {
    // Module 24 §5: when the browser ships its twin snapshot, the five read-only
    // tools resolve against it in a bounded loop. Without a snapshot no tool can
    // be consulted honestly, and the response says so instead of inventing one.
    if (snapshot) return this.runChatWithTools(question, ipHash, snapshot);

    const toolCalls: ToolCall[] = [
      {
        name: 'live_metrics',
        status: 'skipped',
        detail: 'Live metrics are owned by the browser twin; the edge is stateless.',
      },
    ];

    return this.run<{ answer: string; toolCalls: ToolCall[] }>({
      task: 'chat',
      promptVersion: 'chat.v1',
      // Module 24 §6: operator text is delimited and declared untrusted, so the
      // model can tell a question from an instruction embedded in one.
      input: delimitQuestion(question),
      system: PROMPTS['chat.v1'],
      jsonSchema: null,
      temperature: 0.3,
      // Chat is per-question free text; caching it would only hide repeat cost,
      // and the question text is the operator's, not a measurement.
      cacheable: false,
      parse: (raw) => {
        const text = typeof raw === 'string' ? raw.trim() : '';
        if (text.length === 0) return { ok: false, detail: 'empty answer' };
        return { ok: true, value: { answer: text.slice(0, 1200), toolCalls } };
      },
      template: () => ({ answer: this.template.chat(question), toolCalls }),
    }, ipHash);
  }

  /**
   * Module 24 §5: the function-calling loop. It lives here, in our code, never
   * in a provider-side agent runtime: at most `MAX_TOOL_ROUNDS` model calls,
   * each tool resolved read-only against the browser-supplied snapshot, results
   * fed back as `{"tool_result": …}` data. A second unknown-tool or bad-args
   * violation aborts the loop to the template rung; so does round exhaustion.
   */
  private async runChatWithTools(
    question: string,
    ipHash: string,
    snapshot: ChatSnapshot,
  ): Promise<CopilotResponse<{ answer: string; toolCalls: ToolCall[] }>> {
    const now = Date.now();
    const delimited = delimitQuestion(question);
    const toolCalls: ToolCall[] = [];

    for (const provider of this.chain) {
      if (!provider.isAvailable()) continue;
      if (this.runtime.isBreakerOpen(provider.name, now)) {
        Logger.warn('copilot.breaker', 'BREAKER_OPEN', {
          route: '/api/copilot/chat',
          metadata: { provider: provider.name },
        });
        continue;
      }
      // Budget is consulted before any paid call, exactly like `run` (§3, §8).
      if (this.budgetGuard) {
        const budget = await this.budgetGuard.checkAiCall(ipHash);
        if (!budget.allow) {
          Logger.warn('copilot.budget', budget.reason ?? 'BUDGET', {
            route: '/api/copilot/chat',
            metadata: { provider: provider.name },
          });
          continue;
        }
      }

      const messages: ChatMessage[] = [{ role: 'user', content: delimited }];
      let tokensIn = 0;
      let tokensOut = 0;
      let costMicroUsd = 0;
      let latencyMs = 0;
      let violations = 0;
      let transportFailed = false;
      let answer: string | null = null;

      for (let round = 1; round <= MAX_TOOL_ROUNDS; round++) {
        const request: LlmRequest = {
          task: 'chat',
          promptVersion: 'chat.v1',
          system: PROMPTS['chat.v1'],
          input: delimited,
          maxTokens: MAX_TOKENS.chat,
          temperature: 0.3,
          jsonSchema: null,
          tools: CHAT_TOOL_SPECS,
          messages: messages.slice(),
        };

        let raw: LlmRawResult = await this.callProvider(provider, request);
        // §3: exactly one retry, and only for a transient failure.
        if (!raw.ok && raw.code && TRANSIENT.has(raw.code)) {
          await sleep(retryDelayMs());
          raw = await this.callProvider(provider, { ...request, attempt: 2 });
        }
        if (!raw.ok) {
          transportFailed = true;
          break;
        }

        tokensIn += raw.tokensIn;
        tokensOut += raw.tokensOut;
        costMicroUsd += raw.costMicroUsd;
        latencyMs += raw.latencyMs;

        if (!raw.toolCalls || raw.toolCalls.length === 0) {
          const text = raw.text.trim();
          if (text.length > 0) answer = text.slice(0, 1200);
          break;
        }

        messages.push({ role: 'assistant', content: raw.text.trim() || null, tool_calls: raw.toolCalls });
        for (const call of raw.toolCalls) {
          const resolution = resolveToolCall(call.name, call.args, snapshot);
          if (resolution.ok) {
            toolCalls.push({ name: call.name, status: 'ok', detail: resolution.summary });
            messages.push({ role: 'tool', content: wrapToolResult(resolution.result), tool_call_id: call.id });
          } else {
            violations++;
            toolCalls.push({ name: call.name, status: 'error', detail: resolution.error });
            messages.push({ role: 'tool', content: wrapToolError(resolution.error), tool_call_id: call.id });
            if (violations >= 2) break;
          }
        }
        if (violations >= 2) break;
      }

      if (transportFailed) {
        this.runtime.recordFailure(provider.name, now);
        Logger.warn('copilot.fallback', 'PROVIDER_FAILED', {
          route: '/api/copilot/chat',
          metadata: { provider: provider.name },
        });
        continue;
      }

      // The provider answered correctly; any abort here is model misbehaviour
      // (violations or exhausted rounds), which must not open the breaker.
      this.runtime.recordSuccess(provider.name);

      if (answer !== null) {
        if (this.budgetGuard && costMicroUsd > 0) {
          await this.budgetGuard.recordAiCall(ipHash, costMicroUsd);
        }
        return {
          source: provider.source,
          value: { answer, toolCalls },
          latencyMs,
          tokens: { in: tokensIn, out: tokensOut },
          costMicroUsd,
          cached: false,
        };
      }

      Logger.warn('copilot.toolloop', violations >= 2 ? 'TOOL_VIOLATION' : 'ROUNDS_EXHAUSTED', {
        route: '/api/copilot/chat',
        metadata: { provider: provider.name, violations },
      });
      // §5: fall through to the next rung, ultimately to the template.
    }

    return {
      source: TEMPLATE_BADGE,
      value: { answer: this.template.chat(question), toolCalls },
      latencyMs: 1,
      tokens: { in: 0, out: 0 },
      costMicroUsd: 0,
      cached: false,
    };
  }

  /**
   * `POST /api/copilot/advisory` projects an already-validated diagnosis into
   * dispatch text and VMS lines, under a 250-token ceiling (Module 24 §8).
   */
  public async advisory(
    diagnosis: DiagnosisV1,
    ipHash = '',
  ): Promise<CopilotResponse<{ advisoryText: string; signMessage: string[] }>> {
    return this.run<{ advisoryText: string; signMessage: string[] }>({
      task: 'advisory',
      promptVersion: 'advisory.v1',
      input: diagnosis,
      system: PROMPTS['advisory.v1'],
      jsonSchema: ADVISORY_JSON_SCHEMA as unknown as Record<string, unknown>,
      temperature: 0.1,
      cacheable: true,
      parse: (raw) => {
        const candidate = raw as { advisoryText?: unknown; signMessage?: unknown } | null;
        const advisoryText = typeof candidate?.advisoryText === 'string' ? candidate.advisoryText.trim() : '';
        const lines = Array.isArray(candidate?.signMessage)
          ? candidate.signMessage.filter(
              (line): line is string =>
                typeof line === 'string' && line.length <= 24 && /^[A-Z0-9 .,:!/-]+$/.test(line),
            )
          : [];
        // A sign message that fails the VMS character set is not patched here:
        // it goes back to the model once as a validation error, then to template.
        if (advisoryText.length === 0 || advisoryText.length > 280) {
          return { ok: false, detail: 'advisoryText must be 1-280 characters' };
        }
        if (lines.length === 0 || lines.length > 2) {
          return { ok: false, detail: 'signMessage must be 1-2 lines of uppercase A-Z0-9 .,:!/-' };
        }
        return { ok: true, value: { advisoryText, signMessage: lines } };
      },
      template: () => this.template.advisory(diagnosis),
    }, ipHash);
  }

  /**
   * The chain itself. One place owns retry, repair, breaker, cache and budget so
   * every task behaves the same way and no provider can shortcut the rules.
   */
  private async run<T>(opts: RunOptions<T>, ipHash: string): Promise<CopilotResponse<T>> {
    const now = Date.now();
    const primaryModel = this.meta.modelId;
    const cacheKey = opts.cacheable
      ? await cacheKeyFor(opts.task, opts.promptVersion, opts.input, primaryModel)
      : '';

    const cached = this.runtime.read(cacheKey, now);
    if (cached) {
      // Module 24 §3: a hit makes zero provider calls and is logged as a hit.
      Logger.info('copilot.cache', {
        route: `/api/copilot/${opts.task}`,
        metadata: { task: opts.task, promptVersion: opts.promptVersion, cacheHit: true },
      });
      return {
        source: cached.source,
        value: cached.value as T,
        latencyMs: 1,
        tokens: { in: cached.tokensIn, out: cached.tokensOut },
        costMicroUsd: 0,
        cached: true,
      };
    }

    for (const provider of this.chain) {
      if (!provider.isAvailable()) continue;
      if (this.runtime.isBreakerOpen(provider.name, now)) {
        Logger.warn('copilot.breaker', 'BREAKER_OPEN', {
          route: `/api/copilot/${opts.task}`,
          metadata: { provider: provider.name },
        });
        continue;
      }

      // Module 24 §3: the budget is consulted before any paid call, and a
      // denial silently moves to the next rung rather than erroring (§8).
      if (this.budgetGuard) {
        const budget = await this.budgetGuard.checkAiCall(ipHash);
        if (!budget.allow) {
          Logger.warn('copilot.budget', budget.reason ?? 'BUDGET', {
            route: `/api/copilot/${opts.task}`,
            metadata: { provider: provider.name },
          });
          continue;
        }
      }

      const result = await this.attempt(provider, opts, ipHash);
      if (result) {
        this.runtime.recordSuccess(provider.name);
        if (opts.cacheable && provider.name === 'meta') {
          this.runtime.write(
            cacheKey,
            {
              value: result.value,
              source: result.source,
              tokensIn: result.tokens.in,
              tokensOut: result.tokens.out,
              costMicroUsd: result.costMicroUsd,
            },
            CACHE_TTL_MS[opts.task],
            now,
          );
        }
        return result;
      }

      this.runtime.recordFailure(provider.name, now);
      Logger.warn('copilot.fallback', 'PROVIDER_FAILED', {
        route: `/api/copilot/${opts.task}`,
        metadata: { provider: provider.name },
      });
    }

    // Inviolable fallback: deterministic, evidence-grounded, never fails.
    return {
      source: TEMPLATE_BADGE,
      value: opts.template(),
      latencyMs: 1,
      tokens: { in: 0, out: 0 },
      costMicroUsd: 0,
      cached: false,
    };
  }

  /**
   * One provider, at most two calls: a transient retry, then a repair retry for
   * unusable output. Returns `null` when the provider could not deliver, which
   * is the signal to fall through.
   */
  private async attempt<T>(provider: LlmProvider, opts: RunOptions<T>, ipHash: string): Promise<CopilotResponse<T> | null> {
    const request: LlmRequest = {
      task: opts.task,
      promptVersion: opts.promptVersion,
      system: opts.system,
      // The instruction wrapper is part of the prompt, so it is versioned with
      // it rather than being improvised inside a provider.
      input:
        opts.task === 'chat'
          ? opts.input
          : `${USER_TURNS[opts.task as keyof typeof USER_TURNS]}\n${JSON.stringify(opts.input)}`,
      maxTokens: MAX_TOKENS[opts.task],
      temperature: opts.temperature,
      jsonSchema: opts.jsonSchema,
    };

    let raw = await this.callProvider(provider, request);

    // Module 24 §3: exactly one retry, and only for a transient failure.
    if (!raw.ok && raw.code && TRANSIENT.has(raw.code)) {
      await sleep(retryDelayMs());
      raw = await this.callProvider(provider, { ...request, attempt: 2 });
    }

    if (!raw.ok) return null;

    const parsed = opts.parse(parseBody(raw.text, opts.jsonSchema !== null));
    if (parsed.ok) {
      if (this.budgetGuard && raw.costMicroUsd > 0) {
        await this.budgetGuard.recordAiCall(ipHash, raw.costMicroUsd);
      }
      return {
        source: provider.source,
        value: parsed.value,
        latencyMs: raw.latencyMs,
        tokens: { in: raw.tokensIn, out: raw.tokensOut },
        costMicroUsd: raw.costMicroUsd,
        cached: false,
      };
    }

    // Module 24 §4.3: one repair attempt carrying the validation error, then
    // fall through. The error text is a schema message, never user text.
    Logger.warn('copilot.repair', 'SCHEMA_MISMATCH', {
      route: `/api/copilot/${opts.task}`,
      metadata: { provider: provider.name },
    });
    const repaired = await this.callProvider(provider, { ...request, attempt: 2, repairHint: parsed.detail });
    if (!repaired.ok) return null;

    const reparsed = opts.parse(parseBody(repaired.text, opts.jsonSchema !== null));
    if (!reparsed.ok) return null;

    const tokensIn = raw.tokensIn + repaired.tokensIn;
    const tokensOut = raw.tokensOut + repaired.tokensOut;
    const costMicroUsd = raw.costMicroUsd + repaired.costMicroUsd;
    if (this.budgetGuard && costMicroUsd > 0) {
      await this.budgetGuard.recordAiCall(ipHash, costMicroUsd);
    }

    return {
      source: provider.source,
      value: reparsed.value,
      latencyMs: raw.latencyMs + repaired.latencyMs,
      tokens: { in: tokensIn, out: tokensOut },
      costMicroUsd,
      cached: false,
    };
  }

  private async callProvider(provider: LlmProvider, request: LlmRequest) {
    const controller = new AbortController();
    try {
      return await provider.complete(request, {
        signal: controller.signal,
        timeoutMs: PROVIDER_TIMEOUT_MS,
      });
    } finally {
      controller.abort();
    }
  }
}

/**
 * Structured tasks must yield JSON; free-text tasks must not be silently
 * accepted as JSON-looking strings. A fence is data noise, so it is stripped
 * once here rather than being treated as a schema failure.
 */
function parseBody(text: string, structured: boolean): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  if (!structured) return trimmed;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

/** A compact, text-free summary of what the model got wrong (Module 24 §4.3). */
function summariseZod(issues: readonly { path: (string | number)[]; message: string }[]): string {
  const parts = issues.slice(0, 5).map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
  return parts.length > 0 ? parts.join('; ') : 'schema mismatch';
}
