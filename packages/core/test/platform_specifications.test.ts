import { describe, it, expect } from 'vitest';
import {
  SimEngine,
  evaluateProposalWhatIf,
  toNtcip1202Status,
  estimateQueuesFromMasks,
  runPerceptionNoiseTest,
  DEFAULT_ADAPTIVE_PARAMS,
  TIMING,
  LANES,
  PHASES,
  VEHICLE_TYPES,
  conflictsWith,
} from '../src/index.js';

describe('Platform Specifications Verification (Module 01 - 06)', () => {
  it('Contracts Freeze: verifies frozen entity sets and timing constants (Module 02)', () => {
    // Exact frozen arrays
    expect(LANES).toEqual([
      'NB-TR', 'NB-L',
      'SB-TR', 'SB-L',
      'EB-TR', 'EB-L',
      'WB-TR', 'WB-L',
    ]);
    expect(PHASES).toEqual([
      'P1_NS_LEFT',
      'P2_NS_THRU',
      'P3_EW_LEFT',
      'P4_EW_THRU',
    ]);
    expect(VEHICLE_TYPES).toEqual(['BIKE', 'CAR', 'BUS', 'TRUCK', 'AMBULANCE']);

    // Frozen timing constants
    expect(TIMING.G_MIN_S).toBe(7.0);
    expect(TIMING.G_MAX_S).toBe(65.0);
    expect(TIMING.YELLOW_S).toBe(3.5);
    expect(TIMING.ALL_RED_S).toBe(2.0);
    expect(TIMING.FIXED_CYCLE_S).toBe(90.0);
    expect(TIMING.MAX_RED_WAIT_S).toBe(120.0);
    expect(TIMING.SIM_DT_S).toBe(0.1);

    // Coarse conflict: every two different phases conflict
    expect(conflictsWith('P1_NS_LEFT', 'P2_NS_THRU')).toBe(true);
    expect(conflictsWith('P1_NS_LEFT', 'P1_NS_LEFT')).toBe(false);
  });

  it('Digital-Twin What-If: rejects proposals that touch non-configurable safety parameters (Module 01 & 04)', () => {
    const sim = new SimEngine({ seed: 42 });

    // Attempt to tamper with yellow interval or minimum green
    const illegalProposal = {
      YELLOW_S: 1.0, // illegal!
      RATIO: 2.5,
    };

    const res = evaluateProposalWhatIf(sim, DEFAULT_ADAPTIVE_PARAMS, illegalProposal as any, 60);
    expect(res.approved).toBe(false);
    expect(res.reason).toContain('non-configurable safety parameter');
    expect(res.kernelViolations).toBeGreaterThan(0);
  });

  it('Digital-Twin What-If: evaluates valid parameter adjustments against 3% improvement threshold (Module 04)', () => {
    const sim = new SimEngine({ seed: 42 });

    const validProposal = {
      G_MIN_EFFICIENT_S: 30.0,
      RATIO: 3.5,
      FLOOR: 10.0,
    };

    const res = evaluateProposalWhatIf(sim, DEFAULT_ADAPTIVE_PARAMS, validProposal, 60);
    expect(typeof res.approved).toBe('boolean');
    expect(Number.isFinite(res.improvementPct)).toBe(true);
    expect(res.kernelViolations).toBe(0);
  });

  it('NTCIP-1202 Object Model Mapping Layer (Module 01 & 06)', () => {
    const signalState = {
      phase: 'P2_NS_THRU' as const,
      indication: 'GREEN' as const,
      timeInStateS: 12.0,
      lanes: {
        'NB-TR': 'G' as const, 'NB-L': 'R' as const,
        'SB-TR': 'G' as const, 'SB-L': 'R' as const,
        'EB-TR': 'R' as const, 'EB-L': 'R' as const,
        'WB-TR': 'R' as const, 'WB-L': 'R' as const,
      },
    };

    const ntcip = toNtcip1202Status(signalState, 90.0);
    // Phase 2 is green -> bit 1 (1 << 1 = 2) should be set in greens
    expect(ntcip.ascPhaseStatusGroupGreens).toBe(0b00000010);
    expect(ntcip.activePhaseNumber).toBe(2);
    expect(ntcip.cycleLengthSeconds).toBe(90.0);
  });

  it('Camera Mode SAM 3.1 Mask Parsing & Perception Noise Test (Module 04)', () => {
    const masks = [
      {
        id: 'mask-1',
        category: 'vehicle' as const,
        confidence: 0.94,
        polygon: [[100, 200], [120, 200]] as Array<[number, number]>,
        bbox: { xMin: 0.6, yMin: 0.7, xMax: 0.65, yMax: 0.75 },
      },
    ];

    const { counts, queuesM } = estimateQueuesFromMasks(masks);
    expect(counts['NB-TR']).toBe(1);
    expect(queuesM['NB-TR']).toBeGreaterThan(0);

    // Perception noise test (inject 20% noise)
    const noiseRes = runPerceptionNoiseTest(0.2, 60);
    expect(noiseRes.safetyViolations).toBe(0); // Safety Kernel ensures 0 violations despite noise
    expect(Number.isFinite(noiseRes.avgDelayS)).toBe(true);
  });
});
