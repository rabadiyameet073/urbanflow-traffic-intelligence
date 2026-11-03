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
  VEHICLE_SPECS,
  makeEventId,
} from '@urbanflow/core';

/** Module 26 §2: `lane_metrics.pressure_index` uses the controller's formula. */
const LANE_LENGTH_M = 300.0;
const EWMA_ALPHA = 0.1;
const EWMA_WARMUP_N = 12;
const EWMA_Z_THRESHOLD = 2.5;

export interface LiteEwma {
  mean: number;
  var: number;
  n: number;
}

export function ewmaUpdate(s: LiteEwma, x: number, alpha = EWMA_ALPHA): LiteEwma {
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
   *
   * `windowIndex` is the monotonic 10 s window counter; Module 02 §3 requires a
   * deterministic eventId (`<runId>:<tick>:<lane|na>:<kind>`), so replaying the
   * same inputs yields byte-identical ids and duplicates stay detectable.
   */
  public flushWindow(
    windowStart: string,
    windowEnd: string,
    runId: string,
    windowIndex: number,
    signalLanes: Record<LaneId, 'G' | 'Y' | 'R'>,
  ): { metrics: LaneMetricsPayload[]; anomalies: AnomalyEventPayload[] } {
    const metrics: LaneMetricsPayload[] = [];
    const anomalies: AnomalyEventPayload[] = [];

    for (const lane of LANES) {
      const events = this.windowBuffers.get(lane) ?? [];

      // Module 26 §2: the window row reports *vehicles*, not telemetry records —
      // one vehicle appears once per tick, so counting records inflates the lane
      // occupancy by the tick rate.
      const vehicleIds = new Set<string>();
      const dischargedIds = new Set<string>();
      let weightedDelay = 0;
      let maxQueueM = 0;
      let queueSum = 0;
      let queueSamples = 0;
      let totalSpeed = 0;
      let speedSamples = 0;

      for (const ev of events) {
        vehicleIds.add(ev.vehicle.vehicleId);
        // Same quantity the controller's pressure formula consumes.
        weightedDelay += VEHICLE_SPECS[ev.vehicle.type].priorityWeight * ev.vehicle.waitingTimeSeconds;
        totalSpeed += ev.vehicle.speedKmh;
        speedSamples++;
        if (ev.vehicle.distanceToStopLineMeters <= 0) {
          dischargedIds.add(ev.vehicle.vehicleId);
        }
        const queueM = ev.laneMetrics.currentQueueLengthMeters;
        if (queueM > maxQueueM) maxQueueM = queueM;
        queueSum += queueM;
        queueSamples++;
      }

      const vehicleCount = vehicleIds.size;
      const avgSpeedKmh = speedSamples > 0 ? totalSpeed / speedSamples : null;
      const meanQueueM = queueSamples > 0 ? queueSum / queueSamples : 0;
      // Module 26 §2: same formula as the controller, evaluated on window means.
      const pressureIndex = Math.max(
        0,
        vehicleCount + weightedDelay / 10.0 + (10.0 * meanQueueM) / LANE_LENGTH_M,
      );

      const metric: LaneMetricsPayload = {
        schemaVersion: 1,
        eventId: makeEventId(runId, windowIndex, lane, 'metrics'),
        timestamp: windowEnd,
        intersectionId: 'INT_042_MARKET_5TH',
        controller: 'adaptive',
        windowStart,
        windowEnd,
        approachLane: lane,
        vehicleCount,
        weightedDelay,
        maxQueueM,
        avgSpeedKmh,
        dischargeCount: dischargedIds.size,
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
          eventId: makeEventId(runId, windowIndex, lane, 'anomaly-blockage'),
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
      if (ewma.n >= EWMA_WARMUP_N) {
        const z = zscore(ewma, vehicleCount);
        if (z > EWMA_Z_THRESHOLD) {
          anomalies.push({
            schemaVersion: 1,
            eventId: makeEventId(runId, windowIndex, lane, 'anomaly-surge'),
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

