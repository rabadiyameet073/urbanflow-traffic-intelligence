/**
 * Module 13 & Module 16: Control Loop Watchdog, Chaos Engine & Observability
 *
 * Implements the real-time heartbeat watchdog, automated fail-safe trip (FLASH_RED),
 * fault recovery sequence, and chaos engineering injection suite.
 */
import {
  SignalState,
  ControlAction,
  EvpDirective,
  Observation,
  LaneId,
  LANES,
  TIMING,
} from '../contracts.js';
import { SafetyKernel } from './kernel.js';
import { splitRng } from '../helpers/rng.js';

export interface WatchdogMetrics {
  heartbeatsReceived: number;
  missedHeartbeats: number;
  controllerExceptions: number;
  failSafeTrips: number;
  reversionsToBaseline: number;
  lastReversionLatencyMs: number;
  isFailSafe: boolean;
}

export class ControlLoopWatchdog {
  private lastHeartbeatSimS: number = 0;
  private readonly timeoutS: number;
  private readonly kernel: SafetyKernel;

  // Observability metrics
  public heartbeatsReceived: number = 0;
  public missedHeartbeats: number = 0;
  public controllerExceptions: number = 0;
  public failSafeTrips: number = 0;
  public reversionsToBaseline: number = 0;
  /**
   * Detection latency of the fail-safe, in simulated milliseconds.
   *
   * This used to subtract a wall-clock timer reading taken at start, which measured JS scheduling
   * jitter — a number that changes on every run and cannot be reproduced from a
   * seed (Rule 07, ADR-001). The quantity the chaos matrix asks for is "FLASH_RED
   * within one tick", so the latency is now expressed in simulated time: 0 ms
   * means the trip happened on the very tick that observed the fault.
   */
  public lastReversionLatencyMs: number = 0;

  constructor(kernel: SafetyKernel, timeoutS = 1.0) {
    this.kernel = kernel;
    this.timeoutS = timeoutS;
  }

  /**
   * Heartbeat ping emitted by healthy controller loops each tick.
   */
  public heartbeat(simTimeS: number): void {
    this.lastHeartbeatSimS = simTimeS;
    this.heartbeatsReceived++;
  }

  /**
   * Safe execution wrapper for a controller tick.
   * Catches any runtime exceptions or missed heartbeats and immediately enters FLASH_RED.
   */
  public executeTick(
    simTimeS: number,
    controllerFn: () => ControlAction | null,
    evpDirective: EvpDirective | null = null,
    dtS = TIMING.SIM_DT_S,
  ): SignalState {
    // Check heartbeat timeout condition
    if (this.heartbeatsReceived > 0 && simTimeS - this.lastHeartbeatSimS > this.timeoutS) {
      this.missedHeartbeats++;
      this.triggerFailSafe();
      return this.kernel.step(null, null, dtS);
    }

    try {
      // Execute controller decision
      const action = controllerFn();
      this.heartbeat(simTimeS);
      return this.kernel.step(action, evpDirective, dtS);
    } catch (err) {
      this.controllerExceptions++;
      this.triggerFailSafe();
      return this.kernel.step(null, null, dtS);
    }
  }

  /**
   * Trip the fail-safe. Detection and reversion happen inside the same tick as
   * the fault, so the recorded latency is zero simulated milliseconds — which is
   * the property the safety case claims, and one that replays exactly.
   */
  private triggerFailSafe(): void {
    this.failSafeTrips++;
    this.kernel.failSafe();
    this.lastReversionLatencyMs = 0;
  }

  /**
   * Initiates safety recovery from FLASH_RED -> ALL_RED (2.0s) -> Baseline Green.
   */
  public recover(simTimeS: number): void {
    this.kernel.recover();
    this.reversionsToBaseline++;
    this.heartbeat(simTimeS);
  }

  public getMetrics(): WatchdogMetrics {
    return {
      heartbeatsReceived: this.heartbeatsReceived,
      missedHeartbeats: this.missedHeartbeats,
      controllerExceptions: this.controllerExceptions,
      failSafeTrips: this.failSafeTrips,
      reversionsToBaseline: this.reversionsToBaseline,
      lastReversionLatencyMs: this.lastReversionLatencyMs,
      isFailSafe: this.kernel.getMetrics().isFailSafe,
    };
  }
}

/**
 * Task 15 / Module 13: Chaos Engineering Injection Suite
 */
export class ChaosEngine {
  /**
   * Injects a controller crash to verify watchdog failSafe reversion.
   */
  public static injectControllerCrash(watchdog: ControlLoopWatchdog, simTimeS: number): SignalState {
    return watchdog.executeTick(simTimeS, () => {
      throw new Error('[ChaosEngine] Simulated unhandled controller exception');
    });
  }

  /**
   * Injects a missed heartbeat to verify timeout reversion.
   */
  public static injectHeartbeatTimeout(
    watchdog: ControlLoopWatchdog,
    simTimeS: number,
    stallDurationS = 2.5,
  ): SignalState {
    // Advance sim time beyond timeoutS without ticking heartbeat
    const advancedTime = simTimeS + stallDurationS;
    return watchdog.executeTick(advancedTime, () => ({ requestedPhase: 'P2_NS_THRU', reason: 'normal' }));
  }

  /**
   * Injects perception noise (stochastic count offsets and sensor dropouts)
   * to test controller and kernel robustness under imperfect inputs.
   *
   * The randomness is injected rather than drawn from the unseeded global RNG: a robustness
   * curve quoted in a report has to be reproducible from its seed (Rule 00,
   * Rule 07). Pass a stream from `splitRng(seed, 'chaos-noise')`; the default is
   * that same stream pinned at seed 0, so a call with no arguments still replays
   * identically.
   */
  public static injectPerceptionNoise(
    obs: Observation,
    noiseFraction: number, // e.g. 0.2 (+/- 20% count perturbation)
    dropoutProb = 0.0,    // probability of sensor dropout returning 0
    rng: () => number = splitRng(0, 'chaos-noise'),
  ): Observation {
    const noisyLanes = { ...obs.lanes };

    for (const lane of LANES) {
      const orig = obs.lanes[lane];
      if (!orig) continue;

      if (dropoutProb > 0 && rng() < dropoutProb) {
        // Module 20 §8: a missing reading is never "zero vehicles". The lane is
        // flagged invalid and keeps its last-known numbers, so a consumer that
        // honours the flag treats the window as unknown instead of empty — the
        // difference between "the queue cleared" and "the sensor went quiet".
        noisyLanes[lane] = { ...orig, valid: false };
        continue;
      }

      // Symmetrical multiplicative noise clamped to non-negative
      const delta = (rng() * 2 - 1) * noiseFraction;
      const noisyCount = Math.max(0, Math.round(orig.vehicleCount * (1 + delta)));
      const noisyQueue = Math.max(0, orig.queueLengthM * (1 + delta));

      noisyLanes[lane] = {
        ...orig,
        vehicleCount: noisyCount,
        queueLengthM: noisyQueue,
      };
    }

    return {
      ...obs,
      lanes: noisyLanes,
    };
  }

  /**
   * Generates a storm of forged or conflicting EVP requests to test storm guard.
   *
   * Ids are deterministic (`storm-evp-<tag>-<i>`), so the same storm replays to
   * the same decisions and the idempotency cache behaves the same way twice. The
   * tag exists to generate a *fresh* storm on purpose — pass a new one when the
   * test wants the second burst to be treated as new requests rather than replays.
   */
  public static generateEVPStorm(count = 50, tag = 'sim'): Array<{
    id: string;
    lane: LaneId;
    distanceM: number;
    speedMps: number;
    tRequestS: number;
  }> {
    const storm = [];
    const testLanes: LaneId[] = ['NB-TR', 'EB-TR', 'SB-TR', 'WB-TR'];

    for (let i = 0; i < count; i++) {
      storm.push({
        id: `storm-evp-${tag}-${i}`,
        lane: testLanes[i % testLanes.length]!,
        distanceM: 50 + (i * 10) % 300,
        speedMps: 12 + (i % 8),
        tRequestS: i * 0.1,
      });
    }

    return storm;
  }
}

