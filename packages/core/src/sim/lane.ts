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

  /** Slot -> EMS request id, populated only for emergency vehicles (never a typed array). */
  private readonly emsIdBySlot = new Map<number, string>();

  /**
   * Slot -> sim time an EMS *continuous* stall at the entry end began, kept
   * only while the vehicle is stopped in the stuck zone. Like `emsIdBySlot`
   * this is derived entirely from deterministic physics — replay rebuilds it
   * tick for tick — so it stays out of `stateHash`.
   */
  private readonly emsStallSinceBySlot = new Map<number, number>();

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
    this.emsIdBySlot.clear();
    this.emsStallSinceBySlot.clear();
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
    emsId?: string,
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
    if (isEms && emsId) {
      this.emsIdBySlot.set(slot, emsId);
    }

    this.order[this.count] = slot;
    this.count++;
    this.totalArrivals++;
    return slot;
  }

  /**
   * Insert a vehicle at an explicit position, keeping `order` sorted ascending by
   * position (front of the queue first). `insertBack` is only valid at the
   * upstream boundary; a vehicle injected mid-lane must be spliced in ahead of
   * every queued vehicle that sits further upstream, otherwise the leader lookup
   * reads a follower as its own leader and the lane jams.
   */
  public insertOrdered(
    type: VehicleType,
    pos: number,
    vel: number,
    simTimeS: number,
    isEms = false,
    emsId?: string,
  ): number {
    const slot = this.insertBack(type, pos, vel, simTimeS, isEms, emsId);
    if (slot === -1) return -1;

    let idx = this.count - 1;
    while (idx > 0) {
      const prevSlot = this.order[idx - 1] as number;
      if ((this.pos[prevSlot] as number) <= pos) break;
      this.order[idx] = prevSlot;
      idx--;
    }
    this.order[idx] = slot;
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

  /**
   * Remove the vehicle at `orderIdx` in the front-to-back `order` array.
   * `removeFront` only serves the tail of the queue; an EMS despawned at the
   * stop line can sit anywhere in `order` when slower vehicles ahead of it
   * have not cleared yet, so removal must address the index directly.
   */
  public removeAt(orderIdx: number): number {
    if (orderIdx < 0 || orderIdx >= this.count) return -1;
    const slot = this.order[orderIdx] as number;

    // Shift the tail of the order array left over the removed entry
    for (let i = orderIdx; i < this.count - 1; i++) {
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

  /** Read and clear the EMS request id bound to a slot (call before `removeFront`). */
  public takeEmsId(slot: number): string | null {
    const id = this.emsIdBySlot.get(slot);
    if (id === undefined) return null;
    this.emsIdBySlot.delete(slot);
    return id;
  }

  /**
   * Mark "stalled at the entry end" for `slot` (called every tick the vehicle
   * is stopped in the stuck zone) and return when the current continuous
   * stall began. Restarting the clock whenever the vehicle rolls is what makes
   * the despawn grace period measure a *sustained* stall: an ambulance that
   * brakes briefly behind a queue and then moves on drives the lane like any
   * other vehicle instead of being despawned.
   */
  public markEmsStall(slot: number, simTimeS: number): number {
    const since = this.emsStallSinceBySlot.get(slot);
    if (since !== undefined) return since;
    this.emsStallSinceBySlot.set(slot, simTimeS);
    return simTimeS;
  }

  /** Clear the stall timer; call whenever the vehicle is not stalled in the zone. */
  public clearEmsStall(slot: number): void {
    this.emsStallSinceBySlot.delete(slot);
  }

  /**
   * Id of the EMS nearest the stop line in this lane, or null. Mirrors the
   * `nearestEmsDistanceM` scan in `SimEngine.observe` (same `order` walk, same
   * `pos > 0` and `FLAG_EMS` tests) so the auto-preempt binds to the ambulance
   * that is already present instead of spawning a duplicate of it.
   */
  public nearestEmsId(): string | null {
    let bestPos = Number.POSITIVE_INFINITY;
    let bestId: string | null = null;
    const boxDist = this.getBoxDistance();
    for (let i = 0; i < this.count; i++) {
      const slot = this.order[i] as number;
      if ((this.flags[slot]! & FLAG_EMS) === 0) continue;
      const pos = this.pos[slot] as number;
      if (pos > -boxDist && pos < bestPos) {
        bestPos = pos;
        bestId = this.emsIdBySlot.get(slot) ?? null;
      }
    }
    return bestId;
  }

  public getBoxDistance(): number {
    return this.laneId.endsWith('-L')
      ? TIMING.BOX_CROSSING_LEFT_M
      : TIMING.BOX_CROSSING_THRU_M;
  }
}

