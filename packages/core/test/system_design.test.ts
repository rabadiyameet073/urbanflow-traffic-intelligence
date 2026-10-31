/**
 * System Design & Reliability Engineering Verification Suite
 * Covers Modules 10, 11, 12, 13, 14, 15, 16.
 */
import { describe, it, expect } from 'vitest';
import {
  SimEngine,
  FixedTimeController,
  AdaptiveController,
  SafetyKernel,
  ControlLoopWatchdog,
  ChaosEngine,
  encodeShareState,
  decodeShareState,
  DEFAULT_SHARE_STATE,
  createDebugBundle,
  validateDebugBundle,
  TIMING,
  LANES,
} from '../src/index.js';

describe('Reliability & Safety Engineering - Watchdog & Chaos (Module 13)', () => {
  it('watchdog sustains healthy ticks and records heartbeats', () => {
    const kernel = new SafetyKernel();
    const watchdog = new ControlLoopWatchdog(kernel, 1.0);
    const ctrl = new FixedTimeController();
    const sim = new SimEngine({ seed: 101 });

    for (let t = 0; t < 50; t++) {
      const simTimeS = t * TIMING.SIM_DT_S;
      const obs = sim.observe();
      const state = watchdog.executeTick(simTimeS, () => ctrl.decide(obs));
      sim.step(state);
    }

    const metrics = watchdog.getMetrics();
    expect(metrics.heartbeatsReceived).toBe(50);
    expect(metrics.controllerExceptions).toBe(0);
    expect(metrics.failSafeTrips).toBe(0);
    expect(metrics.isFailSafe).toBe(false);
  });

  it('watchdog immediately reverts to FLASH_RED on unhandled controller crash', () => {
    const kernel = new SafetyKernel();
    const watchdog = new ControlLoopWatchdog(kernel, 1.0);

    // Initial healthy step
    watchdog.executeTick(0.1, () => ({ requestedPhase: 'P2_NS_THRU', reason: 'ok' }));
    expect(watchdog.getMetrics().isFailSafe).toBe(false);

    // Crash injection
    const crashState = ChaosEngine.injectControllerCrash(watchdog, 0.2);
    expect(crashState.indication).toBe('FLASH_RED');
    expect(watchdog.getMetrics().controllerExceptions).toBe(1);
    expect(watchdog.getMetrics().failSafeTrips).toBe(1);
    expect(watchdog.getMetrics().isFailSafe).toBe(true);

    // Subsequent tick remains in FLASH_RED
    const tickAfterCrash = watchdog.executeTick(0.3, () => null);
    expect(tickAfterCrash.indication).toBe('FLASH_RED');
  });

  it('watchdog trips to FLASH_RED upon missed heartbeat deadline', () => {
    const kernel = new SafetyKernel();
    const watchdog = new ControlLoopWatchdog(kernel, 1.0);

    watchdog.executeTick(0.1, () => ({ requestedPhase: 'P2_NS_THRU', reason: 'ok' }));

    // Sim time advances by 2.5s without heartbeat
    const timedOutState = ChaosEngine.injectHeartbeatTimeout(watchdog, 0.1, 2.5);
    expect(timedOutState.indication).toBe('FLASH_RED');
    expect(watchdog.getMetrics().missedHeartbeats).toBe(1);
    expect(watchdog.getMetrics().failSafeTrips).toBe(1);
  });

  it('orchestrates clean safety recovery: FLASH_RED -> ALL_RED (2.0s) -> Baseline Green', () => {
    const kernel = new SafetyKernel();
    const watchdog = new ControlLoopWatchdog(kernel, 1.0);

    // Force failSafe
    ChaosEngine.injectControllerCrash(watchdog, 0.1);
    expect(kernel.getMetrics().isFailSafe).toBe(true);

    // Trigger recovery
    watchdog.recover(0.2);

    // 1st tick of recovery must be ALL_RED (timeInStateS = 0.1)
    const s1 = kernel.step(null, null, 0.1);
    expect(s1.indication).toBe('ALL_RED');

    // Must remain ALL_RED up to 1.9s (18 more steps: 0.2s through 1.9s)
    for (let t = 0; t < 18; t++) {
      const s = kernel.step(null, null, 0.1);
      expect(s.indication).toBe('ALL_RED');
    }

    // Step 20 reaches 2.0s: cleanly transitions to baseline GREEN P2_NS_THRU
    const sGreen = kernel.step(null, null, 0.1);
    expect(sGreen.indication).toBe('GREEN');
    expect(sGreen.phase).toBe('P2_NS_THRU');
  });
});

describe('Security & Threat Model - Share Codec Fuzz Safety (Module 14)', () => {
  it('encodes and decodes valid share state losslessly', () => {
    const state = {
      scenarioId: 'gridlock_surge',
      seed: 9876,
      overrides: { G_MIN_S: 10 },
      detectionDistance: 250,
      inputLog: [{ t: 15.5, action: 'EMS_CALL', payload: { lane: 'NB-TR' } }],
    };

    const encoded = encodeShareState(state);
    expect(typeof encoded).toBe('string');
    expect(encoded.length).toBeGreaterThan(0);

    const decoded = decodeShareState(encoded);
    expect(decoded.scenarioId).toBe(state.scenarioId);
    expect(decoded.seed).toBe(state.seed);
    expect(decoded.detectionDistance).toBe(state.detectionDistance);
    expect(decoded.inputLog.length).toBe(1);
  });

  it('fuzz test: decodes 1000 malformed/hostile input strings without throwing', () => {
    const maliciousInputs = [
      '',
      '!',
      'null',
      'undefined',
      '{}',
      '[]',
      '../../../etc/passwd',
      '<script>alert("xss")</script>',
      '{"__proto__":{"polluted":true}}',
      'A'.repeat(70000), // Exceeds 64 KB cap
      'invalid-base64-%%%$$$###',
      'eyJhY3Rpb24iOiAidW5rbm93biJ9', // valid json but missing schema
      encodeURIComponent('{"seed":"not-a-number"}'),
    ];

    // Generate random fuzz strings
    for (let i = 0; i < 987; i++) {
      const len = 1 + Math.floor(Math.random() * 200);
      let fuzz = '';
      for (let j = 0; j < len; j++) {
        fuzz += String.fromCharCode(Math.floor(Math.random() * 128));
      }
      maliciousInputs.push(fuzz);
    }

    for (const input of maliciousInputs) {
      expect(() => {
        const res = decodeShareState(input);
        expect(res).toBeDefined();
        expect(typeof res.seed).toBe('number');
        expect(typeof res.scenarioId).toBe('string');
      }).not.toThrow();
    }
  });
});

describe('Observability & Debug Bundle (Module 16)', () => {
  it('creates and validates a debug bundle conforming to schema', () => {
    const bundle = createDebugBundle({
      appVersion: 'v1.0.0',
      seed: 42,
      scenarioId: 'morning_commute',
      stateHash: 'a1b2c3d4e5f60718',
      consoleLogs: ['[INFO] Booting', '[WARN] EVP delay noticed'],
      kernelCounters: { 'kernel.conflicts': 0 },
      degradationLevel: 'Full',
    });

    const validation = validateDebugBundle(bundle);
    expect(validation.valid).toBe(true);
    expect(validation.data?.stateHash).toBe('a1b2c3d4e5f60718');
    expect(validation.data?.degradationLevel).toBe('Full');
  });

  it('kernel observability metrics track 100% compliance on yellow and all-red', () => {
    const kernel = new SafetyKernel();
    const ctrl = new FixedTimeController();
    const sim = new SimEngine({ seed: 777 });

    // Run for 300 seconds (3000 ticks)
    for (let t = 0; t < 3000; t++) {
      const obs = sim.observe();
      const act = ctrl.decide(obs);
      const signal = kernel.step(act, null, 0.1);
      sim.step(signal);
    }

    const metrics = kernel.getMetrics();
    expect(metrics.conflicts).toBe(0);
    expect(metrics.ticks).toBeGreaterThanOrEqual(3000);
    expect(metrics.yellowCompliancePct).toBe(100);
    expect(metrics.allRedCompliancePct).toBe(100);
  });
});

describe('Performance & Capacity Budgets (Module 15)', () => {
  it('headless simulation achieves >= 100x real-time speedup', () => {
    const sim = new SimEngine({
      seed: 555,
      laneDemandVph: {
        'NB-TR': 800, 'NB-L': 250,
        'SB-TR': 800, 'SB-L': 250,
        'EB-TR': 800, 'EB-L': 250,
        'WB-TR': 800, 'WB-L': 250,
      },
    });
    const ctrl = new AdaptiveController();
    const kernel = new SafetyKernel();

    // 600 simulated seconds (10 minutes) = 6000 ticks at 0.1s
    const targetSimSeconds = 600;
    const ticks = Math.floor(targetSimSeconds / TIMING.SIM_DT_S);

    const startWallMs = Date.now();
    for (let t = 0; t < ticks; t++) {
      const obs = sim.observe();
      const action = ctrl.decide(obs);
      const signal = kernel.step(action, null, TIMING.SIM_DT_S);
      sim.step(signal);
    }
    const durationWallMs = Date.now() - startWallMs;
    const durationWallS = durationWallMs / 1000;

    const speedup = targetSimSeconds / Math.max(0.001, durationWallS);

    // Gate requirement: >= 100x real time (600s in < 6.0s)
    expect(speedup).toBeGreaterThanOrEqual(100);
  });
});
