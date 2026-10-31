/**
 * Module 04: Vision Camera Mode Geometry Parser & Perception Noise Robustness
 *
 * Converts SAM 3.1 segmentation masks to lane polygons, estimates queue lengths,
 * and executes perception-noise degradation experiments.
 */
import { LaneId, LANES, SimEngine, AdaptiveController, SafetyKernel, TIMING } from '../index.js';

export interface BoundingBox {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

export interface SamMask {
  id: string;
  category: 'asphalt' | 'vehicle' | 'stop_line';
  confidence: number;
  polygon: Array<[number, number]>;
  bbox: BoundingBox;
}

export interface CameraModeFrame {
  frameId: string;
  sourceImage: string;
  weatherCondition: 'clear' | 'rain' | 'fog' | 'night' | 'glare';
  masks: SamMask[];
  handLabeledVehicleCounts: Record<LaneId, number>;
  estimatedQueuesM: Record<LaneId, number>;
  maeError: number;
}

/**
 * Maps vehicle masks to 8 intersection lanes and estimates queue length in meters.
 */
export function estimateQueuesFromMasks(
  vehicleMasks: SamMask[],
  laneLengthM = 300.0,
): { counts: Record<LaneId, number>; queuesM: Record<LaneId, number> } {
  const counts: Record<LaneId, number> = {
    'NB-TR': 0, 'NB-L': 0,
    'SB-TR': 0, 'SB-L': 0,
    'EB-TR': 0, 'EB-L': 0,
    'WB-TR': 0, 'WB-L': 0,
  };

  const queuesM: Record<LaneId, number> = {
    'NB-TR': 0, 'NB-L': 0,
    'SB-TR': 0, 'SB-L': 0,
    'EB-TR': 0, 'EB-L': 0,
    'WB-TR': 0, 'WB-L': 0,
  };

  for (const mask of vehicleMasks) {
    if (mask.category !== 'vehicle') continue;
    // Map bounding box to closest approach quadrant
    const cy = (mask.bbox.yMin + mask.bbox.yMax) / 2;
    const cx = (mask.bbox.xMin + mask.bbox.xMax) / 2;

    let targetLane: LaneId = 'NB-TR';
    if (cy > 0.6) targetLane = cx > 0.5 ? 'NB-TR' : 'NB-L';
    else if (cy < 0.4) targetLane = cx < 0.5 ? 'SB-TR' : 'SB-L';
    else if (cx < 0.4) targetLane = cy > 0.5 ? 'EB-TR' : 'EB-L';
    else targetLane = cy < 0.5 ? 'WB-TR' : 'WB-L';

    counts[targetLane]++;
    queuesM[targetLane] = Math.min(laneLengthM, counts[targetLane] * 7.5); // avg vehicle spacing
  }

  return { counts, queuesM };
}

/**
 * Task 13 / Module 04: Perception Noise Robustness Experiment
 * Injects Gaussian-style count noise into observations and measures controller performance.
 */
export function runPerceptionNoiseTest(
  noiseFraction: number, // 0.0 to 0.5 (0% to 50% sensor noise)
  simDurationS = 600.0,
): { avgDelayS: number; maxQueueM: number; safetyViolations: number } {
  const sim = new SimEngine({ seed: 42, durationS: simDurationS });
  const ctrl = new AdaptiveController();
  const kernel = new SafetyKernel();

  let totalDelay = 0;
  let totalExited = 0;

  const ticks = Math.floor(simDurationS / TIMING.SIM_DT_S);

  for (let t = 0; t < ticks; t++) {
    const rawObs = sim.observe();

    // Inject perception noise into vehicle counts
    const noisyObs = {
      ...rawObs,
      lanes: { ...rawObs.lanes },
    };

    for (const lane of LANES) {
      const orig = rawObs.lanes[lane];
      if (orig) {
        const noiseFactor = 1.0 + (Math.sin(t * 0.1) * noiseFraction);
        noisyObs.lanes[lane] = {
          ...orig,
          vehicleCount: Math.max(0, Math.round(orig.vehicleCount * noiseFactor)),
        };
      }
    }

    const action = ctrl.decide(noisyObs);
    const signal = kernel.step(action, null, TIMING.SIM_DT_S);
    sim.step(signal);

    for (const ev of sim.drainEvents()) {
      if (ev.kind === 'vehicleExited') {
        totalDelay += ev.delayS;
        totalExited++;
      }
    }
  }

  const avgDelayS = totalExited > 0 ? totalDelay / totalExited : 0;
  const violations = Object.values(kernel.violationsPrevented).reduce((a, b) => a + b, 0);

  return {
    avgDelayS: parseFloat(avgDelayS.toFixed(2)),
    maxQueueM: Math.max(...Object.values(sim.lanes).map((l) => l.pos[0] ?? 0)),
    safetyViolations: violations,
  };
}
