/**
 * Module 24: Copilot Multi-Provider Router with Resilient Fallback & Circuit Breaker
 */
import { MetaProvider } from './providers/meta.js';
import { TemplateProvider } from './providers/template.js';
import { DiagnosisV1 } from './schemas.js';
import { BudgetGuard } from '../budget/guard.js';

export interface CopilotResponse<T> {
  source: 'muse-spark' | 'llama-fallback' | 'template';
  value: T;
  latencyMs: number;
  tokens: { in: number; out: number };
  costMicroUsd: number;
  cached: boolean;
}

export class CopilotRouter {
  private meta: MetaProvider;
  private template: TemplateProvider;
  private budgetGuard?: BudgetGuard;

  // Circuit breaker state
  private failureCount: number = 0;
  private breakerOpenUntilMs: number = 0;

  // In-memory cache for recent responses (TTL 60s)
  private cache = new Map<string, { value: any; expiresAt: number }>();

  constructor(meta: MetaProvider, budgetGuard?: BudgetGuard) {
    this.meta = meta;
    this.template = new TemplateProvider();
    this.budgetGuard = budgetGuard;
  }

  private isBreakerOpen(nowMs = Date.now()): boolean {
    return nowMs < this.breakerOpenUntilMs;
  }

  private recordSuccess(): void {
    this.failureCount = 0;
  }

  private recordFailure(nowMs = Date.now()): void {
    this.failureCount++;
    if (this.failureCount >= 3) {
      this.breakerOpenUntilMs = nowMs + 60_000; // open for 60 seconds
    }
  }

  public async diagnose(windowData: unknown, ipHash: string): Promise<CopilotResponse<DiagnosisV1>> {
    const cacheKey = JSON.stringify(windowData);
    const cached = this.cache.get(cacheKey);
    const now = Date.now();

    if (cached && cached.expiresAt > now) {
      return {
        source: 'muse-spark',
        value: cached.value,
        latencyMs: 1,
        tokens: { in: 0, out: 0 },
        costMicroUsd: 0,
        cached: true,
      };
    }

    // 1. Try Meta Muse Spark if available, breaker is closed, and budget allows
    if (this.meta.isAvailable() && !this.isBreakerOpen(now)) {
      let budgetAllowed = true;
      if (this.budgetGuard) {
        const budgetCheck = await this.budgetGuard.checkAiCall(ipHash);
        budgetAllowed = budgetCheck.allow;
      }

      if (budgetAllowed) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout

        const res = await this.meta.diagnose(windowData, controller.signal);
        clearTimeout(timeoutId);

        if (res.ok && res.value) {
          this.recordSuccess();
          if (this.budgetGuard) {
            await this.budgetGuard.recordAiCall(ipHash, res.costMicroUsd);
          }
          this.cache.set(cacheKey, { value: res.value, expiresAt: now + 60_000 });
          return {
            source: 'muse-spark',
            value: res.value,
            latencyMs: res.latencyMs,
            tokens: { in: res.tokensIn, out: res.tokensOut },
            costMicroUsd: res.costMicroUsd,
            cached: false,
          };
        } else {
          this.recordFailure(now);
        }
      }
    }

    // 2. Inviolable Fallback: Deterministic Template Provider
    const templateResult = this.template.diagnose(windowData);
    return {
      source: 'template',
      value: templateResult,
      latencyMs: 1,
      tokens: { in: 0, out: 0 },
      costMicroUsd: 0,
      cached: false,
    };
  }

  public explain(decisionLog: unknown): CopilotResponse<{ explanation: string }> {
    const text = this.template.explain(decisionLog);
    return {
      source: 'template',
      value: { explanation: text },
      latencyMs: 1,
      tokens: { in: 0, out: 0 },
      costMicroUsd: 0,
      cached: false,
    };
  }
}
