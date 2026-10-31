/**
 * Module 16 §4.2: Edge Metrics Collector
 *
 * Collects runtime operational counters and gauges for Cloudflare Worker & DO execution:
 * - requests_total{route, status}
 * - rate_limited_total{bucket}
 * - ai_calls_total{provider, outcome}
 * - ai_cost_usd_today
 * - ai_cache_hits_total
 */

export class EdgeMetrics {
  private static requestsTotal: Record<string, number> = {};
  private static rateLimitedTotal: Record<string, number> = {};
  private static aiCallsTotal: Record<string, number> = {};
  private static aiCacheHitsTotal = 0;
  private static aiCostUsdToday = 0;

  public static recordRequest(route: string, status: number): void {
    const key = `${route}:${status}`;
    this.requestsTotal[key] = (this.requestsTotal[key] ?? 0) + 1;
  }

  public static recordRateLimit(bucket: string): void {
    this.rateLimitedTotal[bucket] = (this.rateLimitedTotal[bucket] ?? 0) + 1;
  }

  public static recordAiCall(provider: string, outcome: 'success' | 'fallback' | 'error', costUsd = 0.0002): void {
    const key = `${provider}:${outcome}`;
    this.aiCallsTotal[key] = (this.aiCallsTotal[key] ?? 0) + 1;
    this.aiCostUsdToday += costUsd;
  }

  public static recordCacheHit(): void {
    this.aiCacheHitsTotal++;
  }

  public static getSnapshot() {
    return {
      requestsTotal: { ...this.requestsTotal },
      rateLimitedTotal: { ...this.rateLimitedTotal },
      aiCallsTotal: { ...this.aiCallsTotal },
      aiCostUsdToday: parseFloat(this.aiCostUsdToday.toFixed(4)),
      aiCacheHitsTotal: this.aiCacheHitsTotal,
    };
  }

  public static reset(): void {
    this.requestsTotal = {};
    this.rateLimitedTotal = {};
    this.aiCallsTotal = {};
    this.aiCacheHitsTotal = 0;
    this.aiCostUsdToday = 0;
  }
}
