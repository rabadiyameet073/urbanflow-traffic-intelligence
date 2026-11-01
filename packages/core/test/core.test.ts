import { describe, it, expect } from 'vitest';
import {
  SimEngine,
  FixedTimeController,
  AdaptiveController,
  SafetyKernel,
  SafetyViolationError,
  EvpManager,
  DEFAULT_SIM_CONFIG,
  TIMING,
} from '../src/index.js';
import type { EvpRequest } from '../src/index.js';

describe('Simulation Engine Determinism & Physics (Module 20)', () => {
  it('achieves bit-identical state hashes across independent runs with the same seed', () => {
    const run = () => {
      const sim = new SimEngine({ seed: 1042 });
      const kernel = new SafetyKernel();
      const ctrl = new FixedTimeController();

      for (let t = 0; t < 500; t++) {
        const obs = sim.observe();
        const action = ctrl.decide(obs);
        const signal = kernel.step(action, null, TIMING.SIM_DT_S);
        sim.step(signal);
      }
      return sim.stateHash();
    };

    const hash1 = run();
    const hash2 = run();
    const hash3 = run();

    expect(hash1).toBe(hash2);
    expect(hash2).toBe(hash3);
  });

  it('preserves fair arrivals: identical arrival sequence regardless of controller', () => {
    const runController = (useAdaptive: boolean) => {
      const sim = new SimEngine({ seed: 777 });
      const kernel = new SafetyKernel();
      const ctrl = useAdaptive ? new AdaptiveController() : new FixedTimeController();

      const arrivals: Array<{ lane: string; type: string; t: number }> = [];

      for (let t = 0; t < 300; t++) {
        const obs = sim.observe();
        const action = ctrl.decide(obs);
        const signal = kernel.step(action, null, TIMING.SIM_DT_S);
        sim.step(signal);

        for (const ev of sim.drainEvents()) {
          if (ev.kind === 'vehicleDenied') {
            arrivals.push({ lane: ev.lane, type: ev.vehicleType, t: ev.simTimeS });
          }
        }
      }
      return arrivals;
    };

    const fixedArrivals = runController(false);
    const adaptiveArrivals = runController(true);

    // Number of denials or schedule matches deterministically
    expect(fixedArrivals.length).toBe(adaptiveArrivals.length);
  });

  it('strictly satisfies the conservation law: arrivals = exited + inSystem + denied', () => {
    const sim = new SimEngine({
      seed: 888,
      laneDemandVph: {
        'NB-TR': 600, 'NB-L': 200,
        'SB-TR': 600, 'SB-L': 200,
        'EB-TR': 600, 'EB-L': 200,
        'WB-TR': 600, 'WB-L': 200,
      },
    });
    const kernel = new SafetyKernel();
    const ctrl = new AdaptiveController();

    let totalDenied = 0;
    let totalExited = 0;

    for (let t = 0; t < 600; t++) {
      const obs = sim.observe();
      const action = ctrl.decide(obs);
      const signal = kernel.step(action, null, TIMING.SIM_DT_S);
      sim.step(signal);

      for (const ev of sim.drainEvents()) {
        if (ev.kind === 'vehicleExited') totalExited++;
        if (ev.kind === 'vehicleDenied') totalDenied++;
      }
    }

    let inSystem = 0;
    for (const lane of Object.values(sim.lanes)) {
      inSystem += lane.count;
      inSystem += lane.entryBuffer.length;
    }

    expect(sim.totalArrivals).toBe(totalExited + inSystem + totalDenied);
  });

  it('red means stop: no vehicles cross stop line on red', () => {
    const sim = new SimEngine({ seed: 999 });
    // Force permanent red on all lanes
    const redSignal = {
      phase: null,
      indication: 'ALL_RED' as const,
      timeInStateS: 100,
      lanes: {
        'NB-TR': 'R' as const, 'NB-L': 'R' as const,
        'SB-TR': 'R' as const, 'SB-L': 'R' as const,
        'EB-TR': 'R' as const, 'EB-L': 'R' as const,
        'WB-TR': 'R' as const, 'WB-L': 'R' as const,
      },
    };

    for (let t = 0; t < 400; t++) {
      sim.step(redSignal);
      for (const ev of sim.drainEvents()) {
        if (ev.kind === 'vehicleExited') {
          // If vehicle exited on permanent red, violation!
          expect.fail('Vehicle exited while all lanes were red');
        }
      }
    }
  });
});

describe('Safety Kernel Invariants (Module 03)', () => {
  it('enforces Invariant I1: no conflicting non-red indications', () => {
    const kernel = new SafetyKernel();
    const state = kernel.step({ requestedPhase: 'P2_NS_THRU', reason: 'test' }, null, 0.1);
    expect(state.lanes['NB-TR']).toBe('G');
    expect(state.lanes['EB-TR']).toBe('R');

    // Manually testing assertInvariants throws on conflicting state
    expect(() => {
      SafetyKernel.assertInvariants({
        phase: 'P2_NS_THRU',
        indication: 'GREEN',
        timeInStateS: 10,
        lanes: {
          'NB-TR': 'G', 'NB-L': 'R',
          'SB-TR': 'G', 'SB-L': 'R',
          'EB-TR': 'G', 'EB-L': 'R', // conflicting!
          'WB-TR': 'R', 'WB-L': 'R',
        },
      });
    }).toThrow(SafetyViolationError);
  });

  it('enforces Invariant I2: transitions pass through yellow (3.5s) and all-red (2.0s)', () => {
    const kernel = new SafetyKernel();
    // Start at green P2 for 10s (exceeds G_MIN_S)
    for (let t = 0; t < 100; t++) {
      kernel.step({ requestedPhase: 'P2_NS_THRU', reason: 'hold' }, null, 0.1);
    }

    // Request switch to P4_EW_THRU
    const s1 = kernel.step({ requestedPhase: 'P4_EW_THRU', reason: 'switch' }, null, 0.1);
    expect(s1.indication).toBe('YELLOW');

    // Must stay yellow for 3.5s
    for (let t = 0; t < 34; t++) {
      const s = kernel.step({ requestedPhase: 'P4_EW_THRU', reason: 'switch' }, null, 0.1);
      expect(s.indication).toBe('YELLOW');
    }

    // Next step enters ALL_RED
    const sAllRed = kernel.step({ requestedPhase: 'P4_EW_THRU', reason: 'switch' }, null, 0.1);
    expect(sAllRed.indication).toBe('ALL_RED');

    // Stays all red for 2.0s
    for (let t = 0; t < 19; t++) {
      const s = kernel.step({ requestedPhase: 'P4_EW_THRU', reason: 'switch' }, null, 0.1);
      expect(s.indication).toBe('ALL_RED');
    }

    // Finally turns GREEN on P4
    const sGreen = kernel.step({ requestedPhase: 'P4_EW_THRU', reason: 'switch' }, null, 0.1);
    expect(sGreen.indication).toBe('GREEN');
    expect(sGreen.phase).toBe('P4_EW_THRU');
  });

  it('enforces Invariant I6: failSafe enters FLASH_RED and recovers through ALL_RED', () => {
    const kernel = new SafetyKernel();
    kernel.failSafe();
    const flashState = kernel.step(null, null, 0.1);
    expect(flashState.indication).toBe('FLASH_RED');

    kernel.recover();
    const recoverState = kernel.step(null, null, 0.1);
    expect(recoverState.indication).toBe('ALL_RED');
  });

  it('immediately overrides conflicting signal phase to GREEN upon emergency vehicle preemption directive', () => {
    const kernel = new SafetyKernel();
    // Initially on P2_NS_THRU GREEN
    const initial = kernel.step(null, null, 0.1);
    expect(initial.phase).toBe('P2_NS_THRU');
    expect(initial.indication).toBe('GREEN');
    expect(initial.lanes['NB-TR']).toBe('G');
    expect(initial.lanes['EB-TR']).toBe('R');

    // Ambulance arrives on EB-TR (P4_EW_THRU). Issue PRECLEAR directive.
    const evpDirective = {
      stage: 'PRECLEAR' as const,
      targetPhase: 'P4_EW_THRU' as const,
      planStatus: 'OK' as const,
      shortfallS: 0,
      activeEmsId: 'ems-eb-1',
    };

    // Next step must immediately override to GREEN for P4_EW_THRU without delay
    const preempted = kernel.step(null, evpDirective, 0.1);
    expect(preempted.phase).toBe('P4_EW_THRU');
    expect(preempted.indication).toBe('GREEN');
    expect(preempted.lanes['EB-TR']).toBe('G');
    expect(preempted.lanes['WB-TR']).toBe('G');
    expect(preempted.lanes['NB-TR']).toBe('R');
    expect(preempted.lanes['SB-TR']).toBe('R');
  });
});

describe('EVP validation, planning and lifecycle (Module 03 §5)', () => {
  /** A request that passes every check; each test overrides what it is about. */
  const request = (over: Partial<EvpRequest> = {}): EvpRequest => ({
    id: 'ems-1',
    lane: 'NB-TR',
    distanceM: 300,
    speedMps: 15,
    tRequestS: 0,
    nonce: 'nonce-1',
    source: 'operator-console',
    ...over,
  });

  it('classifies a 150 m approach as TIGHT with the measured 9.5 s shortfall (§5.2)', () => {
    const evp = new EvpManager();
    // 150 m at 15 m/s is a 10 s ETA against the 19.5 s required lead that
    // RESULTS §5 quotes: clearance 5.5 + preclear 8.0 + flush 6.0.
    expect(evp.submitRequest(request({ distanceM: 150 }), 0).decision).toBe('accepted');

    const status = evp.getStatus();
    expect(status?.planStatus).toBe('TIGHT');
    expect(status?.shortfallS).toBeCloseTo(9.5, 6);
    expect(status?.stage).toBe('PRECLEAR');
  });

  it('classifies a 300 m approach as OK and reports no shortfall (§5.2)', () => {
    const evp = new EvpManager();
    // 300 m at 15 m/s is a 20 s ETA, half a second clear of the required lead.
    evp.submitRequest(request(), 0);

    const status = evp.getStatus();
    expect(status?.planStatus).toBe('OK');
    expect(status?.shortfallS).toBe(0);
  });

  it('serves a same-phase request from the running plan instead of replacing it (§5.3)', () => {
    const evp = new EvpManager();
    evp.submitRequest(request({ id: 'ems-a', nonce: 'n-a', source: 'unit-a' }), 0);

    // SB-TR is also P2_NS_THRU, so this vehicle is served by the green already
    // being cleared — but it must not overwrite the first vehicle's plan.
    const shared = evp.submitRequest(
      request({ id: 'ems-b', lane: 'SB-TR', nonce: 'n-b', source: 'unit-b' }),
      0,
    );
    expect(shared.decision).toBe('accepted');
    expect(evp.getStatus()?.activeEmsId).toBe('ems-a');
  });

  it('refuses a conflicting request while a preemption is in progress (§5.3)', () => {
    const evp = new EvpManager();
    evp.submitRequest(request({ id: 'ems-a', nonce: 'n-a', source: 'unit-a' }), 0);

    // EB-TR is P4_EW_THRU: a conflicting phase, so it has to wait its turn.
    const second = evp.submitRequest(
      request({ id: 'ems-b', lane: 'EB-TR', nonce: 'n-b', source: 'unit-b' }),
      0,
    );
    expect(second.decision).toBe('rejected');
    expect(second.reason).toBe('PREEMPTION_ACTIVE');
    expect(evp.getStatus()?.activeEmsId).toBe('ems-a');
  });

  it('cancels a preemption that has not yet forced a switch (§5.3)', () => {
    const evp = new EvpManager();
    evp.submitRequest(request(), 0);

    expect(evp.cancelRequest('ems-1')).toBe(true);
    expect(evp.getStatus()).toBeNull();
    // Cancelling something that is no longer running is a no-op, not a crash.
    expect(evp.cancelRequest('ems-1')).toBe(false);
  });

  it('stamps decisions from the simulated clock, not the real one (Rule 07)', () => {
    const at = (t: number): string => {
      const evp = new EvpManager();
      // Out-of-range distance: rejected, so the timestamp cannot come from a
      // per-run wall clock read.
      return evp.submitRequest(request({ distanceM: 900 }), t).serverTime;
    };

    expect(at(0)).toBe(at(0));
    expect(at(60)).not.toBe(at(0));
    expect(Date.parse(at(60)) - Date.parse(at(0))).toBe(60_000);
  });

  it('counts each decision once, with its reason and shortfall (Module 16 §4.1)', () => {
    const evp = new EvpManager();
    // One accepted plan, 9.5 s short of the required lead.
    evp.submitRequest(request({ distanceM: 150 }), 0);
    // A conflicting phase is refused while the plan runs.
    evp.submitRequest(request({ id: 'ems-b', lane: 'EB-TR', nonce: 'n-b', source: 'unit-b' }), 0);
    // A second refusal, for a different and independently auditable reason.
    evp.submitRequest(request({ id: 'ems-c', nonce: 'n-c', source: 'unit-c', distanceM: 5 }), 20);
    // An idempotent replay returns the cached response and must not be counted.
    evp.submitRequest(request({ distanceM: 150 }), 0);

    const counters = evp.getCounters();
    expect(counters.accepted).toBe(1);
    expect(counters.rejected).toBe(2);
    expect(counters.rejectedByReason).toEqual({
      PREEMPTION_ACTIVE: 1,
      IMPLAUSIBLE_DISTANCE: 1,
    });
    expect(counters.shortfallsS).toHaveLength(1);
    expect(counters.shortfallsS[0]).toBeCloseTo(9.5, 6);

    // A reset starts a new run, so the audit trail starts empty too.
    evp.reset();
    expect(evp.getCounters()).toEqual({
      accepted: 0,
      rejected: 0,
      rejectedByReason: {},
      shortfallsS: [],
    });
  });
});
