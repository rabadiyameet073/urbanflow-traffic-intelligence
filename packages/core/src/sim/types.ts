/**
 * Simulation internal types and flags.
 */
import { VehicleType, LaneId, IncidentKind } from '../contracts.js';

export const FLAG_BRAKING = 1;
export const FLAG_EMS = 2;
export const FLAG_IN_BOX = 4;
export const FLAG_FILTERING = 8;

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

