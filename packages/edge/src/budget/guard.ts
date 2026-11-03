/**
 * Module 21 §8: Budget & Rate Guard, backed by the Durable Object.
 *
 * `check()` never throws and never mutates the AI budget; `record()` is the only
 * place that spends. AI limits trip **silently upstream** — the copilot router
 * degrades to the deterministic template rather than returning 429 — while EVP
 * and replay limits answer `429 RATE_LIMITED` / `STORM_GUARD` with `Retry-After`.
 */
import type { RoomFacade } from '../do/RoomClient.js';

export type BudgetKind = 'ai' | 'evp' | 'replay';

export interface BudgetCheckResult {
  allow: boolean;
  reason?:
    | 'RATE_LIMITED'
    | 'STORM_GUARD'
    | 'BUDGET_EXHAUSTED'
    | 'RATE_LIMIT_SESSION_INTERVAL'
    | 'RATE_LIMIT_IP_HOURLY';
  /** Hint for the `Retry-After` header when the wait is known. */
  retryAfterS?: number;
}

/** Module 16 §4.2: everything expressed per hour/minute so it stays tunable. */
const LIMITS = {
  aiPerIpPerHour: 20,
  aiMinIntervalS: 10,
  evpPerSourceS: 10,
  evpPerIpPerMin: 5,
  replayPerIpPerHour: 10,
} as const;

export class BudgetGuard {
  constructor(
    private readonly room: RoomFacade,
    private readonly dailyCap = 1500,
  ) {}

  /** Module 21 §8 `check(ipHash, kind)`. */
  public async check(kind: BudgetKind, ipHash: string, source = ''): Promise<BudgetCheckResult> {
    if (kind === 'evp') return this.checkEvp(ipHash, source);
    if (kind === 'replay') return this.checkReplay(ipHash);
    return this.checkAiCall(ipHash);
  }

  public async checkAiCall(ipHash: string): Promise<BudgetCheckResult> {
    const intervalOk = await this.room.checkRateLimit(
      `ai:interval:${ipHash}`,
      1,
      LIMITS.aiMinIntervalS,
    );
    if (!intervalOk) {
      return { allow: false, reason: 'RATE_LIMIT_SESSION_INTERVAL', retryAfterS: LIMITS.aiMinIntervalS };
    }

    const hourlyOk = await this.room.checkRateLimit(
      `ai:hourly:${ipHash}`,
      LIMITS.aiPerIpPerHour,
      3600,
    );
    if (!hourlyOk) {
      return { allow: false, reason: 'RATE_LIMIT_IP_HOURLY', retryAfterS: 3600 };
    }

    const globalOk = await this.room.checkRateLimit('ai:global:day', this.dailyCap, 86_400);
    if (!globalOk) {
      return { allow: false, reason: 'BUDGET_EXHAUSTED', retryAfterS: 3600 };
    }

    return { allow: true };
  }

  /** Module 21 §8: EVP 1 per 10 s per source, 5 per minute per IP. */
  public async checkEvp(ipHash: string, source: string): Promise<BudgetCheckResult> {
    const perSourceOk = await this.room.checkRateLimit(
      `evp:src:${source}`,
      1,
      LIMITS.evpPerSourceS,
    );
    if (!perSourceOk) {
      return { allow: false, reason: 'RATE_LIMITED', retryAfterS: LIMITS.evpPerSourceS };
    }

    const perIpOk = await this.room.checkRateLimit(`evp:ip:${ipHash}`, LIMITS.evpPerIpPerMin, 60);
    if (!perIpOk) {
      return { allow: false, reason: 'STORM_GUARD', retryAfterS: 60 };
    }

    return { allow: true };
  }

  /** Module 21 §8: replay writes throttled per IP per hour. */
  public async checkReplay(ipHash: string): Promise<BudgetCheckResult> {
    const ok = await this.room.checkRateLimit(
      `replay:ip:${ipHash}`,
      LIMITS.replayPerIpPerHour,
      3600,
    );
    return ok ? { allow: true } : { allow: false, reason: 'RATE_LIMITED', retryAfterS: 3600 };
  }

  public async recordAiCall(ipHash: string, costMicroUsd: number): Promise<void> {
    await this.room.recordAiUsage(ipHash, costMicroUsd);
    await this.room.recordAiUsage('__global__', costMicroUsd);
  }

  /** Today's usage snapshot for `/api/health` (Module 16 §5). */
  public async getDailyUsage(): Promise<{ calls: number; costMicroUsd: number }> {
    return this.room.getDailyUsage('__global__');
  }

  public async getDailyCount(): Promise<number> {
    const usage = await this.room.getDailyUsage('__global__');
    return usage.calls;
  }

  public get cap(): number {
    return this.dailyCap;
  }
}
