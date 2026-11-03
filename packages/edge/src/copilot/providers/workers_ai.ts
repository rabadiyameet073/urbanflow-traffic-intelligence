/**
 * Module 24 §2: Workers AI (Llama) fallback provider.
 *
 * The second rung of the chain, used when Meta is unconfigured, over budget or
 * its breaker is open. It speaks the Workers AI binding rather than HTTP, so it
 * needs no key of its own — only the `AI` binding, which the deployment either
 * has or does not.
 *
 * Honesty note (Rule 00): Workers AI does not return token usage, so this
 * provider reports `tokensIn`/`tokensOut` as 0 — *unmeasured*, not *free*. The
 * cost is 0 because the binding is billed against the account's free allocation,
 * and `/api/health` already reports `workersAi: false` when the binding is
 * absent so a reader can tell the degraded path from a measured one.
 */
import type { LlmProvider, LlmRawResult, LlmRequest } from '../llm.js';

interface WorkersAiBinding {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}

export class WorkersAiProvider implements LlmProvider {
  public readonly name = 'workers-ai' as const;
  public readonly source = 'llama-fallback' as const;

  constructor(
    private readonly binding: WorkersAiBinding | undefined,
    public readonly modelId = '@cf/meta/llama-3.1-8b-instruct',
  ) {}

  public isAvailable(): boolean {
    return Boolean(this.binding && typeof this.binding.run === 'function');
  }

  public async complete(
    req: LlmRequest,
    opts: { signal: AbortSignal; timeoutMs: number },
  ): Promise<LlmRawResult> {
    if (!this.binding) {
      return this.failure('UNCONFIGURED', 0, 'AI binding missing');
    }

    const t0 = Date.now();
    try {
      // The binding has no AbortSignal; the router's timeout is enforced by
      // racing the call, which is the only cancellation Workers AI offers.
      const raw = await Promise.race([
        this.binding.run(this.modelId, {
          messages: [
            { role: 'system', content: req.system },
            { role: 'user', content: userContent(req) },
          ],
          max_tokens: req.maxTokens,
          temperature: req.temperature,
          ...(req.jsonSchema ? { response_format: { type: 'json_object' } } : {}),
        }),
        new Promise<never>((_, reject) => {
          const id = setTimeout(() => reject(new Error('TIMEOUT')), opts.timeoutMs);
          opts.signal.addEventListener('abort', () => {
            clearTimeout(id);
            reject(new Error('TIMEOUT'));
          });
        }),
      ]);

      const text = extractText(raw);
      const latencyMs = Date.now() - t0;
      if (text.length === 0) {
        return { ok: false, text: '', tokensIn: 0, tokensOut: 0, costMicroUsd: 0, latencyMs, code: 'INVALID_JSON' };
      }

      return { ok: true, text, tokensIn: 0, tokensOut: 0, costMicroUsd: 0, latencyMs };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'PROVIDER_ERROR';
      const code = message === 'TIMEOUT' ? 'TIMEOUT' : 'HTTP_5XX';
      return this.failure(code, Date.now() - t0, message);
    }
  }

  private failure(code: LlmRawResult['code'], latencyMs: number, detail: string): LlmRawResult {
    return { ok: false, text: '', tokensIn: 0, tokensOut: 0, costMicroUsd: 0, latencyMs, code, detail };
  }
}

/**
 * The repair hint rides in the user turn, never in the system prompt: a
 * validation message is model feedback, not an instruction that outranks the
 * rules about what the operator may change.
 */
function userContent(req: LlmRequest): string {
  const body = typeof req.input === 'string' ? req.input : JSON.stringify(req.input);
  if (!req.repairHint) return body;
  return `${body}\n\nYour previous answer was rejected: ${req.repairHint}\nReturn corrected JSON only.`;
}

function extractText(raw: unknown): string {
  if (typeof raw === 'string') return raw.trim();
  if (raw && typeof raw === 'object') {
    const candidate = (raw as { response?: unknown }).response;
    if (typeof candidate === 'string') return candidate.trim();
  }
  return '';
}
