/**
 * Simulation internal types and flags.
 */
import { VehicleType, LaneId, IncidentKind } from '../contracts.js';

export const FLAG_BRAKING = 1;
export const FLAG_EMS = 2;
export const FLAG_IN_BOX = 4;
export const FLAG_FILTERING = 8;

/**
 * Upstream band of the approach in which a stalled EMS is despawned instead
 * of waiting. `spawnEmsAt` clamps a detection distance beyond `laneLengthM`
 * to the entry end, so this is where an ambulance lands when the approach is
 * already jammed; left alone it sits at the back of a queue it can never
 * clear and appears stranded at the far end of the lane.
 */
export const EMS_STUCK_ZONE_M = 15.0;

/**
 * Speed below which an EMS inside the stuck zone counts as stalled (m/s).
 * Same threshold the waiting-time and peak-queue counters use, so "stalled"
 * here means the same thing it means everywhere else in the engine.
 */
export const EMS_STALL_MPS = 1.0;

/**
 * How long (simulated seconds) an EMS must have been stopped inside the stuck
 * zone before it despawns. Without this grace period an ambulance that brakes
 * briefly behind a queue at the entry end — a queue that then starts moving —
 * vanishes before it ever gets to drive the lane. Only a vehicle that is
 * still stopped after this long is genuinely stranded.
 */
export const EMS_STALL_GRACE_S = 8.0;

export interface ActiveIncident {
  id: string;
  kind: IncidentKind;
  lane: LaneId;
  positionM: number;
  durationS?: number;
  remainingS?: number;
}

export interface QueuedArrival {
  type: VehicleType;
  tArrivalS: number;
  tQueuedS: number;
  isEms: boolean;
  emsId?: string;
}

