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
  EvpStage,
  Observation,
  TIMING,
  conflictsWith,
} from '../contracts.js';
import { simWallClockIso } from '../helpers/sim-clock.js';
import type { EvpTimelineEntry } from '../worker/protocol.js';

/**
 * The EVP lifecycle event shape (T22) lives in `worker/protocol.ts` so the
 * wire type and the recorder cannot drift; entries are keyed by *simulated*
 * time, never wall time: two replays of one seed produce the identical
 * timeline, which is what makes the log worth shipping inside a debug bundle
 * (Rule 07).
 */

/** Bound so a long run with a hostile gateway cannot grow the log unbounded. */
const EVP_TIMELINE_LIMIT = 100;

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

/**
 * Wall-clock origin for a simulated run.
 *
 * `packages/core` may not read the real clock (Rule 07, Module 01 §2). A
 * rejection recorded at sim time `t` must carry the same `serverTime` on every
 * replay, otherwise two runs of one seed produce different audit records. The
 * origin and the derivation both live in `helpers/sim-clock.ts` so the NTCIP
 * status group and the debug bundle cannot drift from this one.
 */

export class EvpManager {
  private activeEms: ManagedEms | null = null;
  private stage: EvpStage = 'IDLE';
  private stageTimeS: number = 0;

  // Audit and tracking caches
  private readonly processedIds = new Map<string, EvpDecisionResponse>();
  private readonly seenNonces = new Set<string>();
  private readonly sourceLastRequestTime = new Map<string, number>();

  // Storm guard (rolling 10s request timestamps)
  private readonly requestHistory10s: number[] = [];
  private stormGuardUntilS: number = 0;

  // T22: timestamped event log, oldest first, capped at EVP_TIMELINE_LIMIT.
  private readonly timeline: EvpTimelineEntry[] = [];

  // Module 16 §4.1 counters. They outlive a plan on purpose: `getStatus()` is
  // null once a preemption ends, but "how many requests did this run accept and
  // reject, and why" is exactly what an operator needs after the fact.
  private acceptedCount = 0;
  private rejectedCount = 0;
  private readonly rejectedByReason = new Map<EvpDecisionReason, number>();
  private readonly shortfallsS: number[] = [];

  public reset(): void {
    this.activeEms = null;
    this.stage = 'IDLE';
    this.stageTimeS = 0;
    this.processedIds.clear();
    this.seenNonces.clear();
    this.sourceLastRequestTime.clear();
    this.requestHistory10s.length = 0;
    this.stormGuardUntilS = 0;
    this.acceptedCount = 0;
    this.rejectedCount = 0;
    this.rejectedByReason.clear();
    this.shortfallsS.length = 0;
    this.timeline.length = 0;
  }

  /**
   * Module 16 §4.1 `evp.requests{accepted,rejected,reason}` and `evp.shortfallS`.
   *
   * Counted once per *decision*: an idempotent replay returns the cached response
   * from step 1 of `submitRequest` and never reaches the counters, so repeating a
   * request cannot inflate them.
   */
  public getCounters(): {
    accepted: number;
    rejected: number;
    rejectedByReason: Record<string, number>;
    shortfallsS: number[];
  } {
    return {
      accepted: this.acceptedCount,
      rejected: this.rejectedCount,
      rejectedByReason: Object.fromEntries(this.rejectedByReason),
      shortfallsS: [...this.shortfallsS],
    };
  }

  /**
   * T22: the recorded lifecycle, oldest first. Rebuilt deterministically from
   * simulated time, so it is safe to show to a judge and safe to bundle.
   */
  public getTimeline(): EvpTimelineEntry[] {
    return [...this.timeline];
  }

  private log(action: EvpTimelineEntry['action'], detail: string, tSimS: number): void {
    this.timeline.push({ tSimS, action, detail });
    if (this.timeline.length > EVP_TIMELINE_LIMIT) this.timeline.shift();
  }

  /**
   * Validate incoming EVP request against strict physical and security rules.
   */
  public submitRequest(req: EvpRequest, simTimeS: number): EvpDecisionResponse {
    this.log(
      'requested',
      `${req.lane} at ${req.distanceM.toFixed(0)} m, ${req.speedMps.toFixed(1)} m/s assumed, src ${req.source}`,
      simTimeS,
    );

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
      return this.reject(req.id, 'STORM_GUARD', simTimeS);
    }

    if (this.requestHistory10s.length > 20) {
      this.stormGuardUntilS = simTimeS + 30.0;
      return this.reject(req.id, 'STORM_GUARD', simTimeS);
    }

    // 3. Lane validity
    if (!LANES.includes(req.lane)) {
      return this.reject(req.id, 'UNKNOWN_LANE', simTimeS);
    }

    // 4. Nonce replay check
    if (this.seenNonces.has(req.nonce)) {
      return this.reject(req.id, 'NONCE_REPLAY', simTimeS);
    }

    // 5. Rate limit per source (<= 1 request / 10s)
    const lastSourceTime = this.sourceLastRequestTime.get(req.source);
    if (lastSourceTime !== undefined && simTimeS - lastSourceTime < 10.0) {
      return this.reject(req.id, 'RATE_LIMITED', simTimeS);
    }

    // 6. Plausibility checks: speed in [3, 35] m/s, distance in [20, 800] m
    if (req.speedMps < 3 || req.speedMps > 35) {
      return this.reject(req.id, 'IMPLAUSIBLE_SPEED', simTimeS);
    }
    if (req.distanceM < 20 || req.distanceM > 800) {
      return this.reject(req.id, 'IMPLAUSIBLE_DISTANCE', simTimeS);
    }

    const phase = LANE_TO_PHASE[req.lane];

    // 7. One active preemption (§5.3). A same-phase request is served by the
    // plan already running; a conflicting one waits instead of silently
    // replacing the vehicle the operator is watching for.
    if (this.activeEms !== null && this.stage !== 'IDLE' && this.stage !== 'RECOVERY') {
      if (this.activeEms.phase !== phase) {
        return this.reject(req.id, 'PREEMPTION_ACTIVE', simTimeS);
      }
      this.seenNonces.add(req.nonce);
      this.sourceLastRequestTime.set(req.source, simTimeS);
      const shared: EvpDecisionResponse = {
        id: req.id,
        decision: 'accepted',
        reason: null,
        serverTime: this.serverTimeAt(simTimeS),
      };
      this.processedIds.set(req.id, shared);
      this.acceptedCount++;
      this.log('accepted', `${req.lane} · shares active plan for ${this.activeEms.request.id}`, simTimeS);
      return shared;
    }

    // Accept request
    this.seenNonces.add(req.nonce);
    this.sourceLastRequestTime.set(req.source, simTimeS);

    const etaS = req.distanceM / req.speedMps;

    // Queue flush & lead calculations (Module 03 §5.2).
    //
    // Two declared simplifications live here, both measured and written up in
    // `docs/LIMITATIONS.md`:
    //   - §5.2 asks for the *measured* count of vehicles ahead of the ambulance;
    //     this build uses a two-vehicle placeholder, because the count has to be
    //     read from the simulator and `EvpRequest` is a frozen wire contract that
    //     external gateways also fill in.
    //   - §5.2 makes the yellow/all-red clearance conditional on the switch being
    //     a conflicting one. This build always includes it, because a request
    //     arrives without the current phase attached.
    // Both make the reported plan *more* pessimistic than the truth when the lane
    // is already green, and *less* pessimistic when the queue ahead is longer
    // than two vehicles. The sweep in RESULTS §5 is reported under this model.
    const startUpLostS = 2.0;
    const assumedVehiclesAhead = 2;
    const queueFlushS = startUpLostS + 2.0 * assumedVehiclesAhead;
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
      serverTime: this.serverTimeAt(simTimeS),
    };
    this.processedIds.set(req.id, res);
    this.acceptedCount++;
    this.shortfallsS.push(shortfallS);
    this.log(
      'accepted',
      `${req.lane} · plan ${planStatus}${shortfallS > 0 ? ` · shortfall ${shortfallS.toFixed(1)} s` : ''} · ${req.id}`,
      simTimeS,
    );
    return res;
  }

  /**
   * Abandon an in-flight preemption (Module 03 §5.3).
   *
   * Cancelling during `PRECLEAR` returns straight to normal control: the kernel
   * has not yet been asked to force a switch, so there is nothing to clear.
   * Cancelling a preemption that already has green hands over to the ordinary
   * `RECOVERY` window instead, which is what keeps the interrupted phases honest
   * — the directive stops forcing anything from that point either way.
   */
  public cancelRequest(id: string, simTimeS?: number): boolean {
    if (this.activeEms === null || this.activeEms.request.id !== id) return false;

    if (this.stage === 'PRECLEAR') {
      this.activeEms = null;
      this.stage = 'IDLE';
    } else {
      this.stage = 'RECOVERY';
    }
    this.stageTimeS = 0;
    if (simTimeS !== undefined) this.log('cancelled', `${id} → ${this.stage}`, simTimeS);
    return true;
  }

  private reject(id: string, reason: EvpDecisionReason, simTimeS: number): EvpDecisionResponse {
    this.rejectedCount++;
    this.rejectedByReason.set(reason, (this.rejectedByReason.get(reason) ?? 0) + 1);
    this.log('rejected', `${id} · ${reason}`, simTimeS);
    const res: EvpDecisionResponse = {
      id,
      decision: 'rejected',
      reason,
      serverTime: this.serverTimeAt(simTimeS),
    };
    this.processedIds.set(id, res);
    return res;
  }

  /** Simulated wall clock. Never the real one — see `helpers/sim-clock.ts`. */
  private serverTimeAt(simTimeS: number): string {
    return simWallClockIso(simTimeS);
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
        this.log('green_granted', `${ems.phase} green for ${ems.request.id}`, obs.simTimeS);
      }
    } else if (this.stage === 'EMS_GREEN') {
      const emsApproaching = laneObs?.nearestEmsDistanceM !== null && laneObs?.nearestEmsDistanceM !== undefined;
      const emsInBox = Boolean(laneObs?.emsInBox);
      const emsPresentInLane = Boolean(laneObs?.hasEms ?? (emsApproaching || emsInBox));

      if (emsApproaching && (laneObs?.nearestEmsDistanceM as number) <= 3.0) {
        if (!ems.hasReachedStopLine) {
          ems.hasReachedStopLine = true;
          this.log(
            'stop_line_reached',
            `${ems.request.id} reached stop line (${(laneObs?.nearestEmsDistanceM as number).toFixed(1)} m)`,
            obs.simTimeS,
          );
        }
      } else if (emsInBox) {
        ems.hasReachedStopLine = true;
      }

      // Preemption ends only when EMS has reached the stop line AND completely exited the lane and box
      // (or when emergency hold cap TIMING.EVP_HOLD_MAX_S is reached as a fail-safe)
      const hasCleared = ems.hasReachedStopLine && !emsPresentInLane;
      if ((hasCleared && this.stageTimeS >= 2.0) || this.stageTimeS >= TIMING.EVP_HOLD_MAX_S) {
        this.stage = 'RECOVERY';
        this.stageTimeS = 0;
        this.log(
          'recovery_started',
          hasCleared ? `${ems.request.id} cleared the intersection box` : `hold cap ${TIMING.EVP_HOLD_MAX_S} s reached`,
          obs.simTimeS,
        );
      }
    } else if (this.stage === 'RECOVERY') {
      // Responsive recovery window: returns quickly to IDLE so subsequent preemption can run immediately
      if (this.stageTimeS >= 2.0) {
        this.stage = 'IDLE';
        this.log('recovery_complete', 'normal control resumed', obs.simTimeS);
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

  /**
   * Read-only projection for the operator console.
   * Returns `null` while no preemption is in progress.
   */
  public getStatus(): {
    stage: EvpStage;
    planStatus: 'OK' | 'TIGHT';
    shortfallS: number;
    activeEmsId: string;
  } | null {
    if (this.activeEms === null || this.stage === 'IDLE') return null;
    return {
      stage: this.stage,
      planStatus: this.activeEms.planStatus,
      shortfallS: this.activeEms.shortfallS,
      activeEmsId: this.activeEms.request.id,
    };
  }
}

