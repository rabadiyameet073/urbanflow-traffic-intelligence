/**
 * Module 03: Emergency Vehicle Preemption (EVP) Manager
 * Validates inbound EVP requests, computes ETA vs required lead time,
 * runs the IDLE -> PRECLEAR -> EMS_GREEN -> RECOVERY state machine,
 * and outputs an EvpDirective to the Safety Kernel.
 */
import {
  LaneId,
  PhaseId,
  LANE_TO_PHASE,
  LANES,
  EvpRequest,
  EvpDirective,
  EvpDecisionResponse,
  EvpDecisionReason,
  Observation,
  TIMING,
  conflictsWith,
} from '../contracts.js';

interface ManagedEms {
  request: EvpRequest;
  phase: PhaseId;
  acceptedAtS: number;
  etaS: number;
  requiredLeadS: number;
  planStatus: 'OK' | 'TIGHT';
  shortfallS: number;
  hasReachedStopLine: boolean;
  hasExited: boolean;
}

export class EvpManager {
  private activeEms: ManagedEms | null = null;
  private stage: 'IDLE' | 'PRECLEAR' | 'EMS_GREEN' | 'RECOVERY' = 'IDLE';
  private stageTimeS: number = 0;

  // Audit and tracking caches
  private readonly processedIds = new Map<string, EvpDecisionResponse>();
  private readonly seenNonces = new Set<string>();
  private readonly sourceLastRequestTime = new Map<string, number>();

  // Storm guard (rolling 10s request timestamps)
  private readonly requestHistory10s: number[] = [];
  private stormGuardUntilS: number = 0;

  public reset(): void {
    this.activeEms = null;
    this.stage = 'IDLE';
    this.stageTimeS = 0;
    this.processedIds.clear();
    this.seenNonces.clear();
    this.sourceLastRequestTime.clear();
    this.requestHistory10s.length = 0;
    this.stormGuardUntilS = 0;
  }

  /**
   * Validate incoming EVP request against strict physical and security rules.
   */
  public submitRequest(req: EvpRequest, simTimeS: number): EvpDecisionResponse {
    // 1. Idempotency by request ID
    if (this.processedIds.has(req.id)) {
      return this.processedIds.get(req.id)!;
    }

    // 2. Storm guard check (> 20 requests in 10s -> lock for 30s)
    this.requestHistory10s.push(simTimeS);
    while (this.requestHistory10s.length > 0 && simTimeS - this.requestHistory10s[0]! > 10.0) {
      this.requestHistory10s.shift();
    }

    if (simTimeS < this.stormGuardUntilS) {
      return this.reject(req.id, 'STORM_GUARD');
    }

    if (this.requestHistory10s.length > 20) {
      this.stormGuardUntilS = simTimeS + 30.0;
      return this.reject(req.id, 'STORM_GUARD');
    }

    // 3. Lane validity
    if (!LANES.includes(req.lane)) {
      return this.reject(req.id, 'UNKNOWN_LANE');
    }

    // 4. Nonce replay check
    if (this.seenNonces.has(req.nonce)) {
      return this.reject(req.id, 'NONCE_REPLAY');
    }

    // 5. Rate limit per source (<= 1 request / 10s)
    const lastSourceTime = this.sourceLastRequestTime.get(req.source);
    if (lastSourceTime !== undefined && simTimeS - lastSourceTime < 10.0) {
      return this.reject(req.id, 'RATE_LIMITED');
    }

    // 6. Plausibility checks: speed in [3, 35] m/s, distance in [20, 800] m
    if (req.speedMps < 3 || req.speedMps > 35) {
      return this.reject(req.id, 'IMPLAUSIBLE_SPEED');
    }
    if (req.distanceM < 20 || req.distanceM > 800) {
      return this.reject(req.id, 'IMPLAUSIBLE_DISTANCE');
    }

    // Accept request
    this.seenNonces.add(req.nonce);
    this.sourceLastRequestTime.set(req.source, simTimeS);

    const phase = LANE_TO_PHASE[req.lane];
    const etaS = req.distanceM / req.speedMps;

    // Queue flush & lead calculations
    const startUpLostS = 2.0;
    const queueFlushS = startUpLostS + 2.0 * 2; // initial estimate
    const preclearS = 8.0;
    const clearanceS = TIMING.YELLOW_S + TIMING.ALL_RED_S; // 5.5s
    const requiredLeadS = clearanceS + preclearS + queueFlushS;

    const planStatus: 'OK' | 'TIGHT' = etaS >= requiredLeadS ? 'OK' : 'TIGHT';
    const shortfallS = Math.max(0, requiredLeadS - etaS);

    this.activeEms = {
      request: req,
      phase,
      acceptedAtS: simTimeS,
      etaS,
      requiredLeadS,
      planStatus,
      shortfallS,
      hasReachedStopLine: false,
      hasExited: false,
    };

    this.stage = 'PRECLEAR';
    this.stageTimeS = 0;

    const res: EvpDecisionResponse = {
      id: req.id,
      decision: 'accepted',
      reason: null,
      serverTime: new Date(1730383200000 + simTimeS * 1000).toISOString(),
    };
    this.processedIds.set(req.id, res);
    return res;
  }

  private reject(id: string, reason: EvpDecisionReason): EvpDecisionResponse {
    const res: EvpDecisionResponse = {
      id,
      decision: 'rejected',
      reason,
      serverTime: new Date().toISOString(),
    };
    this.processedIds.set(id, res);
    return res;
  }

  public step(obs: Observation, dtS: number): EvpDirective | null {
    if (this.stage === 'IDLE' || this.activeEms === null) {
      return null;
    }

    this.stageTimeS += dtS;
    const ems = this.activeEms;
    const currentSignal = obs.signal;

    // Recompute real-time ETA from simulator observation
    const laneObs = obs.lanes[ems.request.lane];
    if (laneObs?.nearestEmsDistanceM !== null && laneObs?.nearestEmsDistanceM !== undefined) {
      ems.etaS = laneObs.nearestEmsDistanceM / ems.request.speedMps;
    }

    // State machine: IDLE -> PRECLEAR -> EMS_GREEN -> RECOVERY -> IDLE
    if (this.stage === 'PRECLEAR') {
      // If signal has already transitioned to target phase green
      if (currentSignal.indication === 'GREEN' && currentSignal.phase === ems.phase) {
        this.stage = 'EMS_GREEN';
        this.stageTimeS = 0;
      }
    } else if (this.stage === 'EMS_GREEN') {
      // Vehicle passes stop line or exits box
      const isPastStopLine = laneObs?.nearestEmsDistanceM === null;
      if (isPastStopLine || this.stageTimeS >= TIMING.EVP_HOLD_MAX_S) {
        this.stage = 'RECOVERY';
        this.stageTimeS = 0;
      }
    } else if (this.stage === 'RECOVERY') {
      // Recovery duration: guarantees interrupted phases are cleared (60s)
      if (this.stageTimeS >= 60.0) {
        this.stage = 'IDLE';
        this.activeEms = null;
        this.stageTimeS = 0;
        return null;
      }
    }

    return {
      stage: this.stage,
      targetPhase: ems.phase,
      planStatus: ems.planStatus,
      shortfallS: ems.shortfallS,
      activeEmsId: ems.request.id,
    };
  }
}
