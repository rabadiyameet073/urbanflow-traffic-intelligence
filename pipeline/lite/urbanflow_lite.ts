/**
 * Module 23: UrbanFlow Lite Streaming Engine (Node.js)
 * Implements 10s window aggregation, online EWMA tracking, and anomaly detection.
 */
import {
  LaneId,
  LANES,
  LaneTelemetryPayload,
  LaneMetricsPayload,
  AnomalyEventPayload,
  AnomalyType,
} from '@urbanflow/core';

export interface LiteEwma {
  mean: number;
  var: number;
  n: number;
}

export function ewmaUpdate(s: LiteEwma, x: number, alpha = 0.1): LiteEwma {
  if (s.n === 0) {
    return { mean: x, var: 0, n: 1 };
  }
  const d = x - s.mean;
  const mean = s.mean + alpha * d;
  const variance = (1 - alpha) * (s.var + alpha * d * d);
  return { mean, var: variance, n: s.n + 1 };
}

export function zscore(s: LiteEwma, x: number, eps = 1e-6): number {
  return (x - s.mean) / Math.max(Math.sqrt(s.var), eps);
}

export class UrbanFlowLiteProcessor {
  private readonly ewmaMap = new Map<LaneId, LiteEwma>();
  private readonly windowBuffers = new Map<LaneId, LaneTelemetryPayload[]>();

  constructor() {
    for (const lane of LANES) {
      this.windowBuffers.set(lane, []);
      this.ewmaMap.set(lane, { mean: 0, var: 0, n: 0 });
    }
  }

  public recordTelemetry(telemetry: LaneTelemetryPayload): void {
    const buf = this.windowBuffers.get(telemetry.approachLane);
    if (buf) {
      buf.push(telemetry);
    }
  }

  /**
   * Drain 10-second window buffer and compute lane metrics + anomalies
   */
  public flushWindow(
    windowStart: string,
    windowEnd: string,
    runId: string,
    signalLanes: Record<LaneId, 'G' | 'Y' | 'R'>,
  ): { metrics: LaneMetricsPayload[]; anomalies: AnomalyEventPayload[] } {
    const metrics: LaneMetricsPayload[] = [];
    const anomalies: AnomalyEventPayload[] = [];

    for (const lane of LANES) {
      const events = this.windowBuffers.get(lane) ?? [];
      const vehicleCount = events.length;
      let totalWait = 0;
      let maxQueueM = 0;
      let totalSpeed = 0;

      for (const ev of events) {
        totalWait += ev.vehicle.waitingTimeSeconds;
        totalSpeed += ev.vehicle.speedKmh;
        if (ev.laneMetrics.currentQueueLengthMeters > maxQueueM) {
          maxQueueM = ev.laneMetrics.currentQueueLengthMeters;
        }
      }

      const avgSpeedKmh = vehicleCount > 0 ? totalSpeed / vehicleCount : null;
      const dischargeCount = 0; // calculated across transitions
      const pressureIndex = vehicleCount + totalWait / 10.0 + (10.0 * maxQueueM) / 300.0;

      const metric: LaneMetricsPayload = {
        schemaVersion: 1,
        eventId: `${runId}:${lane}:metric:${Date.now()}`,
        timestamp: windowEnd,
        intersectionId: 'INT_042_MARKET_5TH',
        controller: 'adaptive',
        windowStart,
        windowEnd,
        approachLane: lane,
        vehicleCount,
        weightedDelay: totalWait,
        maxQueueM,
        avgSpeedKmh,
        dischargeCount,
        pressureIndex,
        runId,
      };
      metrics.push(metric);

      // EWMA update
      let ewma = this.ewmaMap.get(lane)!;
      ewma = ewmaUpdate(ewma, vehicleCount);
      this.ewmaMap.set(lane, ewma);

      // Anomaly Rules
      const signal = signalLanes[lane] ?? 'R';

      // 1. BLOCKAGE
      if (signal === 'G' && maxQueueM > 80.0 && vehicleCount >= 3) {
        anomalies.push({
          schemaVersion: 1,
          eventId: `${runId}:${lane}:anom:blockage`,
          timestamp: windowEnd,
          intersectionId: 'INT_042_MARKET_5TH',
          type: 'BLOCKAGE',
          lane,
          severity: maxQueueM > 100.0 ? 'critical' : 'warning',
          evidence: [
            `Lane ${lane} queue reached ${maxQueueM.toFixed(1)}m under green indication`,
            `${vehicleCount} vehicles accumulated in queue`,
          ],
          windowStart,
          windowEnd,
          detectedAt: windowEnd,
          runId,
        });
      }

      // 2. DEMAND_SURGE
      if (ewma.n >= 12) {
        const z = zscore(ewma, vehicleCount);
        if (z > 2.5) {
          anomalies.push({
            schemaVersion: 1,
            eventId: `${runId}:${lane}:anom:surge`,
            timestamp: windowEnd,
            intersectionId: 'INT_042_MARKET_5TH',
            type: 'DEMAND_SURGE',
            lane,
            severity: 'warning',
            evidence: [
              `Inflow spike of ${vehicleCount} vehicles on ${lane} (z-score ${z.toFixed(2)})`,
              `Baseline EWMA mean=${ewma.mean.toFixed(1)}`,
            ],
            windowStart,
            windowEnd,
            detectedAt: windowEnd,
            runId,
          });
        }
      }

      // Clear buffer for next window
      events.length = 0;
    }

    return { metrics, anomalies };
  }
}
