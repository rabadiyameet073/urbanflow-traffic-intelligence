/**
 * Module 16 §4.2: Edge Metrics Collector
 *
 * Counters and gauges for Cloudflare Worker & Durable Object execution:
 * - requests_total{route,status}
 * - rate_limited_total{bucket}
 * - ai_calls_total{provider,outcome}
 * - ai_cost_usd_today
 * - ai_cache_hits_total
 * - ws_connections
 * - do_storage_bytes
 *
 * Money is accumulated as integer micro-USD and only converted to dollars at
 * the edge of this module, so repeated additions cannot drift.
 */

export interface EdgeMetricsSnapshot {
  requestsTotal: Record<string, number>;
  rateLimitedTotal: Record<string, number>;
  aiCallsTotal: Record<string, number>;
  aiCostUsdToday: number;
  aiCacheHitsTotal: number;
  wsConnections: number;
  doStorageBytes: number;
}

export class EdgeMetrics {
  private static requestsTotal: Record<string, number> = {};
  private static rateLimitedTotal: Record<string, number> = {};
  private static aiCallsTotal: Record<string, number> = {};
  private static aiCacheHitsTotal = 0;
  private static aiCostMicroUsdToday = 0;
  private static wsConnections = 0;
  private static doStorageBytes = 0;

  public static recordRequest(route: string, status: number): void {
    const key = `${route}:${status}`;
    this.requestsTotal[key] = (this.requestsTotal[key] ?? 0) + 1;
  }

  public static recordRateLimit(bucket: string): void {
    this.rateLimitedTotal[bucket] = (this.rateLimitedTotal[bucket] ?? 0) + 1;
  }

  /** `costMicroUsd` is the real measured cost; template/fallback calls pass 0. */
  public static recordAiCall(
    provider: string,
    outcome: 'success' | 'fallback' | 'error',
    costMicroUsd = 0,
  ): void {
    const key = `${provider}:${outcome}`;
    this.aiCallsTotal[key] = (this.aiCallsTotal[key] ?? 0) + 1;
    this.aiCostMicroUsdToday += Math.max(0, Math.round(costMicroUsd));
  }

  public static recordCacheHit(): void {
    this.aiCacheHitsTotal++;
  }

  public static setWsConnections(count: number): void {
    this.wsConnections = Math.max(0, count);
  }

  public static setDoStorageBytes(bytes: number): void {
    this.doStorageBytes = Math.max(0, Math.round(bytes));
  }

  public static getSnapshot(): EdgeMetricsSnapshot {
    return {
      requestsTotal: { ...this.requestsTotal },
      rateLimitedTotal: { ...this.rateLimitedTotal },
      aiCallsTotal: { ...this.aiCallsTotal },
      aiCostUsdToday: Number((this.aiCostMicroUsdToday / 1_000_000).toFixed(4)),
      aiCacheHitsTotal: this.aiCacheHitsTotal,
      wsConnections: this.wsConnections,
      doStorageBytes: this.doStorageBytes,
    };
  }

  public static reset(): void {
    this.requestsTotal = {};
    this.rateLimitedTotal = {};
    this.aiCallsTotal = {};
    this.aiCacheHitsTotal = 0;
    this.aiCostMicroUsdToday = 0;
    this.wsConnections = 0;
    this.doStorageBytes = 0;
  }
}
