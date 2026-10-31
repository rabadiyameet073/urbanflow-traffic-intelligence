/**
 * Struct-of-Arrays Lane representation for high-performance, bit-deterministic physics.
 */
import {
  LaneId,
  VehicleType,
  VEHICLE_TYPES,
  VEHICLE_SPECS,
  TIMING,
  LANE_TO_PHASE,
} from '../contracts.js';
import { FLAG_BRAKING, FLAG_EMS, FLAG_IN_BOX, FLAG_FILTERING, QueuedArrival } from './types.js';

const TYPE_TO_INDEX: Record<VehicleType, number> = {
  BIKE: 0,
  CAR: 1,
  BUS: 2,
  TRUCK: 3,
  AMBULANCE: 4,
};

const INDEX_TO_TYPE: VehicleType[] = ['BIKE', 'CAR', 'BUS', 'TRUCK', 'AMBULANCE'];

export class SimLane {
  public readonly laneId: LaneId;
  public readonly capacity: number;
  public count: number = 0;

  // Struct of Arrays
  public readonly pos: Float64Array;
  public readonly vel: Float64Array;
  public readonly typ: Uint8Array;
  public readonly wait: Float32Array;
  public readonly stops: Uint8Array;
  public readonly t0: Float64Array;
  public readonly flags: Uint8Array;
  public readonly order: Int32Array;
  public readonly free: Int32Array;
  public freeTop: number;

  // Ring buffers for 10s arrivals/discharges (100 bins of 0.1s dt)
  public readonly arrivalRing: Uint8Array;
  public readonly dischargeRing: Uint8Array;
  public ringHead: number = 0;

  // Entry buffer
  public readonly entryBuffer: QueuedArrival[] = [];

  // Metrics tracking
  public deniedCount: number = 0;
  public totalArrivals: number = 0;
  public totalExited: number = 0;

  constructor(laneId: LaneId, capacity = 512) {
    this.laneId = laneId;
    this.capacity = capacity;

    this.pos = new Float64Array(capacity);
    this.vel = new Float64Array(capacity);
    this.typ = new Uint8Array(capacity);
    this.wait = new Float32Array(capacity);
    this.stops = new Uint8Array(capacity);
    this.t0 = new Float64Array(capacity);
    this.flags = new Uint8Array(capacity);
    this.order = new Int32Array(capacity);
    this.free = new Int32Array(capacity);

    // Initialise free-list (reverse so 0 is popped first)
    for (let i = 0; i < capacity; i++) {
      this.free[i] = capacity - 1 - i;
    }
    this.freeTop = capacity;

    this.arrivalRing = new Uint8Array(100);
    this.dischargeRing = new Uint8Array(100);
  }

  public reset(): void {
    this.count = 0;
    this.freeTop = this.capacity;
    for (let i = 0; i < this.capacity; i++) {
      this.free[i] = this.capacity - 1 - i;
    }
    this.pos.fill(0);
    this.vel.fill(0);
    this.typ.fill(0);
    this.wait.fill(0);
    this.stops.fill(0);
    this.t0.fill(0);
    this.flags.fill(0);
    this.order.fill(-1);
    this.arrivalRing.fill(0);
    this.dischargeRing.fill(0);
    this.ringHead = 0;
    this.entryBuffer.length = 0;
    this.deniedCount = 0;
    this.totalArrivals = 0;
    this.totalExited = 0;
  }

  /** Insert a vehicle into the lane (appends at the back of the queue). */
  public insertBack(
    type: VehicleType,
    pos: number,
    vel: number,
    simTimeS: number,
    isEms = false,
  ): number {
    if (this.freeTop <= 0 || this.count >= this.capacity) {
      return -1; // lane full
    }
    this.freeTop--;
    const slot = this.free[this.freeTop] as number;

    this.pos[slot] = pos;
    this.vel[slot] = vel;
    this.typ[slot] = TYPE_TO_INDEX[type];
    this.wait[slot] = 0;
    this.stops[slot] = 0;
    this.t0[slot] = simTimeS;
    this.flags[slot] = isEms ? FLAG_EMS : 0;

    this.order[this.count] = slot;
    this.count++;
    this.totalArrivals++;
    return slot;
  }

  /** Remove the front vehicle (exited). */
  public removeFront(): number {
    if (this.count === 0) return -1;
    const slot = this.order[0] as number;

    // Shift order array left
    for (let i = 0; i < this.count - 1; i++) {
      this.order[i] = this.order[i + 1] as number;
    }
    this.count--;
    this.order[this.count] = -1;

    // Push slot back to free list
    this.free[this.freeTop] = slot;
    this.freeTop++;
    this.totalExited++;
    return slot;
  }

  public getVehicleType(slot: number): VehicleType {
    const idx = this.typ[slot] as number;
    return INDEX_TO_TYPE[idx] ?? 'CAR';
  }

  public getBoxDistance(): number {
    return this.laneId.endsWith('-L')
      ? TIMING.BOX_CROSSING_LEFT_M
      : TIMING.BOX_CROSSING_THRU_M;
  }
}
