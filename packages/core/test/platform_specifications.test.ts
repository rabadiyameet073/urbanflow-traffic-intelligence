import { describe, it, expect } from 'vitest';
import {
  SimEngine,
  evaluateProposalWhatIf,
  toNtcip1202Status,
  estimateQueuesFromMasks,
  runPerceptionNoiseTest,
  DEFAULT_ADAPTIVE_PARAMS,
  AdaptiveParamsSchema,
  CO2_KG_PER_L,
  LOS_UPPER_BOUND_S,
  TIMING,
  LANES,
  LANE_TO_PHASE,
  PHASE_LANES,
  PHASES,
  VEHICLE_SPECS,
  VEHICLE_TYPES,
  conflictsWith,
  resolveVehicleType,
} from '../src/index.js';
import type { AdaptiveParams } from '../src/index.js';

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

  /**
   * Module 02 §2: a contracts snapshot test must fail on any unintended change.
   * The tables below encode *this document*, not the current output, so a
   * deliberate change has to be made in both places or the suite goes red.
   */
  it('Contracts freeze: the eight lanes belong to the documented phases (Module 02 §1.1)', () => {
    expect(LANES.map((lane) => LANE_TO_PHASE[lane])).toEqual([
      'P2_NS_THRU', 'P1_NS_LEFT',
      'P2_NS_THRU', 'P1_NS_LEFT',
      'P4_EW_THRU', 'P3_EW_LEFT',
      'P4_EW_THRU', 'P3_EW_LEFT',
    ]);
    expect(PHASES.map((phase) => PHASE_LANES[phase])).toEqual([
      ['NB-L', 'SB-L'],
      ['NB-TR', 'SB-TR'],
      ['EB-L', 'WB-L'],
      ['EB-TR', 'WB-TR'],
    ]);
  });

  it('Contracts freeze: vehicle classes match the documented table (Module 02 §1.2)', () => {
    // Type, length, max accel, passengers, priority weight, idle L/h, fuel.
    // BIKE acceleration is only described as "fast start" in §1.2, so it is not
    // frozen here; AMBULANCE priority is §1.2's "∞ (preemption)" encoded as a
    // dominance value that no other class can reach.
    const documented: Array<[string, number, number | null, number, number, number, string]> = [
      ['BIKE', 1.8, null, 1, 1.0, 0.0, 'none'],
      ['CAR', 4.5, 2.5, 1.4, 1.2, 0.6, 'gasoline'],
      ['BUS', 12.0, 1.2, 45, 8.5, 2.0, 'diesel'],
      ['TRUCK', 16.5, 0.8, 1.0, 2.0, 1.8, 'diesel'],
      ['AMBULANCE', 6.5, 3.5, 2.0, 1000, 0.9, 'diesel'],
    ];

    for (const [type, lengthM, accel, pax, weight, idle, fuel] of documented) {
      const spec = VEHICLE_SPECS[type as keyof typeof VEHICLE_SPECS];
      expect(spec.lengthM, `${type} length`).toBe(lengthM);
      if (accel !== null) expect(spec.maxAccel, `${type} acceleration`).toBe(accel);
      expect(spec.pax, `${type} passengers`).toBe(pax);
      expect(spec.priorityWeight, `${type} priority`).toBe(weight);
      expect(spec.idleFuelLPerHour, `${type} idle fuel`).toBe(idle);
      expect(spec.fuelType, `${type} fuel`).toBe(fuel);
    }

    // §1.2: CO2 factors are assumptions shown next to every derived number.
    expect(CO2_KG_PER_L.gasoline).toBe(2.31);
    expect(CO2_KG_PER_L.diesel).toBe(2.68);

    // FIRE_ENGINE is a label, not a simulation class.
    expect(resolveVehicleType('fire_engine')).toBe('AMBULANCE');
    expect(VEHICLE_TYPES).not.toContain('FIRE_ENGINE');
  });

  it('Contracts freeze: adaptive parameter defaults and bounds (Module 02 §1.4)', () => {
    expect(DEFAULT_ADAPTIVE_PARAMS).toEqual({
      G_MIN_EFFICIENT_S: 25,
      RATIO: 3,
      FLOOR: 8,
      GAP_S: 3,
      alpha: 1,
      beta: 1,
      gamma: 1,
    });

    const bounds: Array<[keyof AdaptiveParams, number, number]> = [
      ['G_MIN_EFFICIENT_S', 12, 40],
      ['RATIO', 1.5, 6],
      ['FLOOR', 0, 20],
      ['GAP_S', 1, 6],
      ['alpha', 0, 3],
      ['beta', 0, 3],
      ['gamma', 0, 3],
    ];

    for (const [key, min, max] of bounds) {
      const at = (value: number): boolean =>
        AdaptiveParamsSchema.safeParse({ ...DEFAULT_ADAPTIVE_PARAMS, [key]: value }).success;
      expect(at(min), `${key} accepts its lower bound`).toBe(true);
      expect(at(max), `${key} accepts its upper bound`).toBe(true);
      expect(at(min - 1), `${key} refuses below its lower bound`).toBe(false);
      expect(at(max + 1), `${key} refuses above its upper bound`).toBe(false);
    }

    // §1.4: the safety timings are not parameters and have no setter.
    for (const key of ['YELLOW_S', 'ALL_RED_S', 'G_MIN_S', 'G_MAX_S', 'MAX_RED_WAIT_S']) {
      expect(key in DEFAULT_ADAPTIVE_PARAMS, `${key} must not be tunable`).toBe(false);
    }
  });

  it('Contracts freeze: HCM level-of-service thresholds (Module 02 §4)', () => {
    expect(LOS_UPPER_BOUND_S).toEqual({ A: 10, B: 20, C: 35, D: 55, E: 80 });
  });

  it('Digital-Twin What-If: rejects proposals that touch non-configurable safety parameters (Module 01 & 04)', () => {
    const sim = new SimEngine({ seed: 42 });

    // Attempt to tamper with yellow interval or minimum green
    const illegalProposal = {
      YELLOW_S: 1.0, // illegal!
      RATIO: 2.5,
    };

    const res = evaluateProposalWhatIf(sim, DEFAULT_ADAPTIVE_PARAMS, illegalProposal, 60);
    expect(res.approved).toBe(false);
    expect(res.reason).toContain('non-configurable safety parameter');
    expect(res.kernelViolations).toBeGreaterThan(0);
  });

  it('Digital-Twin What-If: a neutral proposal is refused for insufficient improvement (Module 04 §3.4)', () => {
    const sim = new SimEngine({ seed: 42 });

    // Re-proposing the current defaults can improve nothing, so the 3 % gate has
    // to refuse it with a reason that names the threshold rather than the kernel.
    const res = evaluateProposalWhatIf(sim, DEFAULT_ADAPTIVE_PARAMS, {}, 60);
    expect(res.approved).toBe(false);
    expect(res.improvementPct).toBe(0);
    expect(res.reason).toContain('3.0%');
    expect(res.kernelViolations).toBe(0);
  });

  it('Digital-Twin What-If: out-of-bounds values are refused before any simulation runs (Module 04 §3.4)', () => {
    const sim = new SimEngine({ seed: 42 });

    const res = evaluateProposalWhatIf(sim, DEFAULT_ADAPTIVE_PARAMS, { RATIO: 99 }, 60);
    expect(res.approved).toBe(false);
    expect(res.reason).toContain('Out of bounds');
    // Nothing reached the kernel, so claiming a kernel violation would mislabel
    // where the proposal died.
    expect(res.kernelViolations).toBe(0);
  });

  it('Digital-Twin What-If: identical arms mean the verdict is a fair A/B (Module 04 §3.4)', () => {
    const sim = new SimEngine({ seed: 42 });

    const res = evaluateProposalWhatIf(
      sim,
      DEFAULT_ADAPTIVE_PARAMS,
      { G_MIN_EFFICIENT_S: 30 },
      60,
    );

    // Both arms are measured, so the comparison can be quoted at all.
    expect(res.currentPersonDelayS).toBeGreaterThan(0);
    expect(res.proposedPersonDelayS).toBeGreaterThan(0);
    expect(Number.isFinite(res.improvementPct)).toBe(true);
    expect(res.kernelViolations).toBe(0);
    // The verdict follows the published gate in both directions: a pass needs the
    // improvement, a fail has to name which gate refused it.
    if (res.approved) {
      expect(res.improvementPct).toBeGreaterThanOrEqual(3);
    } else {
      expect(res.reason).toMatch(/Insufficient improvement|Rejected by Safety Kernel/);
    }
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
