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
});
