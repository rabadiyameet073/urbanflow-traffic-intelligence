/**
 * Module 21: Budget & Rate Guard
 */
import { Room } from '../do/Room.js';

export interface BudgetCheckResult {
  allow: boolean;
  reason?: string;
}

export class BudgetGuard {
  private room: Room;
  private dailyCap: number;

  constructor(room: Room, dailyCap = 1500) {
    this.room = room;
    this.dailyCap = dailyCap;
  }

  public async checkAiCall(ipHash: string): Promise<BudgetCheckResult> {
    // 1. Min interval: 10s
    const minIntervalOk = await this.room.checkRateLimit(`ai:interval:${ipHash}`, 1, 10);
    if (!minIntervalOk) {
      return { allow: false, reason: 'RATE_LIMIT_SESSION_INTERVAL' };
    }

    // 2. Per-IP: 20 calls/hour
    const ipPerHourOk = await this.room.checkRateLimit(`ai:hourly:${ipHash}`, 20, 3600);
    if (!ipPerHourOk) {
      return { allow: false, reason: 'RATE_LIMIT_IP_HOURLY' };
    }

    // 3. Global daily cap
    const globalDayOk = await this.room.checkRateLimit('ai:global:day', this.dailyCap, 86400);
    if (!globalDayOk) {
      return { allow: false, reason: 'BUDGET_EXHAUSTED' };
    }

    return { allow: true };
  }

  public async recordAiCall(ipHash: string, costMicroUsd: number): Promise<void> {
    await this.room.recordAiUsage(ipHash, costMicroUsd);
    await this.room.recordAiUsage('__global__', costMicroUsd);
  }

  public async getDailyCount(): Promise<number> {
    const usage = await this.room.getDailyUsage('__global__');
    return usage.calls;
  }
}

