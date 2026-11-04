/**
 * Module 20: Bit-Deterministic Simulation Engine
 * High-performance, zero-randomness physics engine using typed arrays.
 *
 * Hot-loop non-null assertions (Module 50 §4 — one file-level justification,
 * not per-line): every `!` on an indexed read below is bounded by a loop
 * invariant — `i < LANES.length`, `slot < lane.count`, or `j <
 * entryBuffer.length` — never by optimism. `noUncheckedIndexedAccess` keeps
 * every *other* index a compile error.
 */
import {
  LANES,
  LaneId,
  VehicleType,
  VehicleSpec,
  VEHICLE_TYPES,
  VEHICLE_SPECS,
  TIMING,
  SimConfig,
  SimConfigPatch,
  DEFAULT_SIM_CONFIG,
  SignalState,
  INITIAL_SIGNAL_STATE,
  Observation,
  LaneObservation,
  DomainEvent,
  IncidentKind,
} from '../contracts.js';
import { splitRng, detLn } from '../helpers/rng.js';
import { hashState } from '../helpers/hash.js';
import { emptyIdleSecondsByClass } from '../metrics/metrics.js';
import { SimLane } from './lane.js';
import { FLAG_BRAKING, FLAG_EMS, FLAG_IN_BOX, FLAG_FILTERING, EMS_STUCK_ZONE_M, EMS_STALL_MPS, EMS_STALL_GRACE_S, ActiveIncident, QueuedArrival } from './types.js';

export class SimEngine {
  public readonly config: SimConfig;
  public readonly lanes: Record<LaneId, SimLane>;
  public simTimeS: number = 0;
  public tickCount: number = 0;

  // RNG streams per lane
  private readonly arrivalRngs: Record<LaneId, () => number>;
  private readonly typeRngs: Record<LaneId, () => number>;
  private readonly nextArrivalTimes: Record<LaneId, number>;

  // Incidents
  private readonly incidents: ActiveIncident[] = [];

  // Domain events buffer (drained via events())
  private readonly eventQueue: DomainEvent[] = [];

  // Current signal state (input to step)
  private currentSignal: SignalState;

  // Aggregate stats
  public totalArrivals: number = 0;
  public totalExited: number = 0;
  public totalDenied: number = 0;

  /** Running maximum stopped-queue length in metres (Module 02 §4 `maxQueueM`). */
  public peakQueueM: number = 0;

  /** Cumulative seconds below 1 m/s per vehicle class (input to idle fuel / CO2). */
  public readonly idleSecondsByClass: Record<VehicleType, number> = emptyIdleSecondsByClass();

  constructor(config: Partial<SimConfig> = {}) {
    const merged = { ...DEFAULT_SIM_CONFIG, ...config };
    // `applyParams` mutates the config in place, so each engine has to own its
    // nested records. Without these copies, two engines built from one config
    // object (the twins in `worker/twin.ts`) would share a single modal split
    // and a single demand map, and an edit to either would silently change the
    // other — the comparison would stop being a comparison.
    this.config = {
      ...merged,
      laneDemandVph: { ...DEFAULT_SIM_CONFIG.laneDemandVph, ...(config.laneDemandVph ?? {}) },
      modalSplit: { ...DEFAULT_SIM_CONFIG.modalSplit, ...(config.modalSplit ?? {}) },
    };

    this.lanes = {} as Record<LaneId, SimLane>;
    this.arrivalRngs = {} as Record<LaneId, () => number>;
    this.typeRngs = {} as Record<LaneId, () => number>;
    this.nextArrivalTimes = {} as Record<LaneId, number>;

    for (const lane of LANES) {
      this.lanes[lane] = new SimLane(lane, 512);
      this.arrivalRngs[lane] = splitRng(this.config.seed, `arrivals:${lane}`);
      this.typeRngs[lane] = splitRng(this.config.seed, `types:${lane}`);
      this.nextArrivalTimes[lane] = 0;
    }

    // Copy, never share: the boot state is a frozen contract constant and two
    // engines must not alias one object.
    this.currentSignal = {
      ...INITIAL_SIGNAL_STATE,
      lanes: { ...INITIAL_SIGNAL_STATE.lanes },
    };

    this.scheduleInitialArrivals();
  }

  private scheduleInitialArrivals(): void {
    for (const lane of LANES) {
      const vph = this.config.laneDemandVph[lane] ?? 0;
      if (vph > 0) {
        const ratePerS = vph / 3600;
        const u = 1 - (this.arrivalRngs[lane]!());
        this.nextArrivalTimes[lane] = -detLn(Math.max(1e-12, u)) / ratePerS;
      } else {
        this.nextArrivalTimes[lane] = Number.POSITIVE_INFINITY;
      }
    }
  }

  public reset(seed = this.config.seed): void {
    this.simTimeS = 0;
    this.tickCount = 0;
    this.incidents.length = 0;
    this.eventQueue.length = 0;
    this.totalArrivals = 0;
    this.totalExited = 0;
    this.totalDenied = 0;
    this.peakQueueM = 0;
    for (const type of VEHICLE_TYPES) {
      this.idleSecondsByClass[type] = 0;
    }

    for (const lane of LANES) {
      this.lanes[lane]!.reset();
      this.arrivalRngs[lane] = splitRng(seed, `arrivals:${lane}`);
      this.typeRngs[lane] = splitRng(seed, `types:${lane}`);
    }
    this.scheduleInitialArrivals();
  }

  // --- Demand Generation ---

  private sampleVehicleType(lane: LaneId): VehicleType {
    const rng = this.typeRngs[lane]!;
    const r = rng();
    let cumulative = 0;
    for (const type of VEHICLE_TYPES) {
      cumulative += this.config.modalSplit[type] ?? 0;
      if (r <= cumulative) {
        return type;
      }
    }
    return 'CAR';
  }

  private handleArrivals(dtS: number): void {
    for (let i = 0; i < LANES.length; i++) {
      const laneId = LANES[i]!;
      const lane = this.lanes[laneId]!;
      const vph = this.config.laneDemandVph[laneId] ?? 0;

      // 1. Check scheduled arrivals
      if (vph > 0 && this.simTimeS >= this.nextArrivalTimes[laneId]!) {
        const type = this.sampleVehicleType(laneId);
        lane.entryBuffer.push({
          type,
          tArrivalS: this.simTimeS,
          tQueuedS: 0,
          isEms: false,
        });
        this.totalArrivals++;

        // Schedule next arrival
        const ratePerS = vph / 3600;
        const u = 1 - (this.arrivalRngs[laneId]!());
        const gap = -detLn(Math.max(1e-12, u)) / ratePerS;
        this.nextArrivalTimes[laneId] += gap;
      }

      // 2. Process entry buffer
      if (lane.entryBuffer.length > 0) {
        const lastVehicleIdx = lane.count > 0 ? (lane.order[lane.count - 1] as number) : -1;
        const canEnter =
          lastVehicleIdx === -1 ||
          lane.pos[lastVehicleIdx]! <= this.config.laneLengthM - 8.0;

        if (canEnter) {
          const item = lane.entryBuffer.shift()!;
          const slot = lane.insertBack(
            item.type,
            this.config.laneLengthM,
            this.config.speedLimitMps * 0.8,
            this.simTimeS,
            item.isEms,
            item.emsId,
          );
          if (slot !== -1) {
            lane.arrivalRing[lane.ringHead] = (lane.arrivalRing[lane.ringHead] ?? 0) + 1;
          }
        } else {
          // Increment wait time in entry buffer
          for (let j = lane.entryBuffer.length - 1; j >= 0; j--) {
            const item = lane.entryBuffer[j]!;
            item.tQueuedS += dtS;
            if (item.tQueuedS > TIMING.MAX_ENTRY_BUFFER_WAIT_S) {
              lane.entryBuffer.splice(j, 1);
              lane.deniedCount++;
              this.totalDenied++;
              this.eventQueue.push({
                kind: 'vehicleDenied',
                simTimeS: this.simTimeS,
                lane: laneId,
                vehicleType: item.type,
              });
            }
          }
        }
      }
    }
  }

  // --- External Control & Interactions ---

  /**
   * Inject an emergency vehicle directly into a lane at `distanceM` upstream of
   * the stop line, rather than queueing it at the approach boundary.
   *
   * Module 03 sweeps the detection distance (150/300/500 m) to show why late
   * detection cannot be rescued by the controller. That sweep is only meaningful
   * if the reported distance is also the vehicle's actual physical position, so
   * this variant writes straight into the lane instead of the entry buffer.
   * The lane must therefore be long enough to contain `distanceM`; the request
   * is clamped into the lane and, when the exact spot is occupied, moved to
   * the nearest collision-free gap — an ambulance is never materialised on top
   * of a queued car, which is what previously left it stranded at the entry
   * end. A lane with no open gap anywhere despawns the request on the spot.
   * An ambulance that *is* placed but then stays stopped at the entry end for
   * the full `EMS_STALL_GRACE_S` is released by the far-end stall rule in
   * `step`; one that gets moving drives the lane normally.
   */
  public spawnEmsAt(lane: LaneId, distanceM: number): string {
    const emsId = `ems-${lane}-${Math.floor(this.simTimeS * 10)}`;
    const simLane = this.lanes[lane];
    if (!simLane) return emsId;

    const spawnPos = Math.min(Math.max(distanceM, 12), this.config.laneLengthM - 3);
    const gapPos = this.nearestFreeGapM(simLane, spawnPos, VEHICLE_SPECS.AMBULANCE);
    if (gapPos === null) return this.despawnEmsAtSpawn(lane, emsId);

    const slot = simLane.insertOrdered(
      'AMBULANCE',
      gapPos,
      TIMING.EMS_CRUISE_MPS,
      this.simTimeS,
      true,
      emsId,
    );
    if (slot === -1) return this.despawnEmsAtSpawn(lane, emsId); // lane at capacity
    // Operator-injected vehicles are arrivals too, so the conservation law closes.
    this.totalArrivals++;

    this.eventQueue.push({
      kind: 'emsMilestone',
      simTimeS: this.simTimeS,
      emsId,
      lane,
      milestone: 'spawned',
    });

    return emsId;
  }

  /**
   * Module 20 §6: `spawnEms` places the vehicle at the *detection* distance
   * doing 54 km/h, so the distance the controller is asked to rescue is the
   * distance the vehicle actually has to cover.
   */
  public spawnEms(lane: LaneId, distanceM?: number): string {
    return this.spawnEmsAt(lane, distanceM ?? this.config.emsDetectDistanceM);
  }

  /**
   * The EMS id nearest the stop line in `lane`, or null. The auto-preempt uses
   * this to bind a plan to the ambulance that is already in the lane instead of
   * injecting a second one (Module 03 §5).
   */
  public nearestEmsId(lane: LaneId): string | null {
    return this.lanes[lane]?.nearestEmsId() ?? null;
  }

  /**
   * A spawn that cannot place the ambulance in the lane despawns it on the
   * spot: no entry-buffer wait, no arrival counted (so the conservation law
   * still closes), and the request id is still returned so an EVP plan bound
   * to it resolves through its ordinary recovery paths instead of hanging.
   */
  private despawnEmsAtSpawn(lane: LaneId, emsId: string): string {
    this.eventQueue.push({
      kind: 'emsMilestone',
      simTimeS: this.simTimeS,
      emsId,
      lane,
      milestone: 'despawned',
    });

    return emsId;
  }

  /**
   * Nearest collision-free position to `candPos` between the stop-line area
   * and the entry end, or `null` when the lane has no physical room for this
   * vehicle class anywhere. `order` is position-ascending, so the open space
   * is the intervals between consecutive vehicles plus the two ends; the
   * wanted position is clamped into the closest interval — downstream gaps
   * count exactly as much as upstream ones. Pure scan: no RNG, no clock, so
   * injections stay bit-deterministic (Module 20 §3.2).
   */
  private nearestFreeGapM(lane: SimLane, candPos: number, spec: VehicleSpec): number | null {
    const spacingM = spec.lengthM + spec.minGapS0 + 2;
    const minPos = 12;
    const maxPos = this.config.laneLengthM - 3;

    let best: number | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    const consider = (lo: number, hi: number): void => {
      if (hi < lo) return;
      const at = Math.min(Math.max(candPos, lo), hi);
      const dist = Math.abs(at - candPos);
      if (dist < bestDist) {
        bestDist = dist;
        best = at;
      }
    };

    let lo = minPos;
    for (let j = 0; j < lane.count; j++) {
      const slot = lane.order[j] as number;
      const otherPos = lane.pos[slot] as number;
      const other = VEHICLE_SPECS[lane.getVehicleType(slot)];
      const safe = Math.max(spacingM, other.lengthM + spec.minGapS0 + 1.5);
      consider(lo, otherPos - safe);
      lo = Math.max(lo, otherPos + safe);
    }
    consider(lo, maxPos);

    return best;
  }

  /**
   * Operator injection of *any* vehicle class, for the lane sandbox
   * (Module 31 §4 lane controls). `spawnEms` above is the ambulance-only case;
   * this is the general one behind it.
   *
   * Two placement modes, and the difference matters for what the test shows:
   *
   * - **No `distanceM`** — the vehicles join the lane's entry buffer and are
   *   admitted through the same 8 m gate scheduled arrivals use, so a burst of
   *   twenty queues realistically instead of materialising as one pile-up.
   * - **With `distanceM`** — the lead vehicle is written into the lane that far
   *   upstream of the stop line and, when that exact spot is occupied, moved
   *   to the nearest collision-free gap (see `nearestFreeGapM`); the rest are
   *   spaced behind it by `lengthM + minGapS0 + 2`. This is how a mid-approach
   *   obstruction or a late-appearing ambulance is tested. A lane with no open
   *   gap anywhere falls back to the entry gate for ordinary classes rather
   *   than stacking vehicles on top of each other; an ambulance is despawned
   *   on the spot instead of queueing to get in.
   *
   * Injection draws from no RNG stream — the same property that lets the
   * detection-distance sweep replay bit-exactly — so an injected burst logged
   * in the input log reproduces identically after a `restoreTo`.
   *
   * Returns the EMS request ids created, one per ambulance. A non-ambulance
   * injection returns an empty array; the id is what binds a vehicle to an EVP
   * plan, and nothing outside the preemption path needs one.
   */
  public spawnVehicle(
    lane: LaneId,
    type: VehicleType,
    count = 1,
    distanceM?: number,
    speedMps?: number,
  ): string[] {
    const simLane = this.lanes[lane];
    if (!simLane) return [];

    const spec = VEHICLE_SPECS[type];
    const isEms = type === 'AMBULANCE';
    const spacingM = spec.lengthM + spec.minGapS0 + 2;
    const stamp = Math.floor(this.simTimeS * 10);
    const emsIds: string[] = [];

    const reqDist = distanceM !== undefined ? distanceM : 45;
    let candPos = Math.max(12, Math.min(this.config.laneLengthM - 10, reqDist));

    // Entry speed: the operator's override when given (clamped to this class's
    // physical max), else the usual EMS-cruise / approach default. RNG-free, so
    // both twins and any replay stay bit-identical.
    const defaultSpeed = isEms
      ? TIMING.EMS_CRUISE_MPS
      : Math.min(spec.maxSpeedMps, this.config.speedLimitMps * 0.8);
    const initSpeed =
      speedMps !== undefined ? Math.max(0, Math.min(spec.maxSpeedMps, speedMps)) : defaultSpeed;

    for (let i = 0; i < count; i++) {
      // Nearest collision-free spot to the requested distance — downstream
      // gaps count as well as upstream ones, so an injection whose exact spot
      // is occupied lands in real space instead of being nudged out of the
      // lane and despawned for no physical reason.
      const placedPos = this.nearestFreeGapM(simLane, candPos, spec);
      const emsId = isEms ? `ems-${lane}-${stamp}-${i}` : undefined;
      if (emsId) emsIds.push(emsId);

      // An ambulance that cannot be placed inside the lane is despawned on
      // the spot; only non-EMS injections fall back to the entry gate.
      let despawned = false;
      if (placedPos !== null) {
        const slot = simLane.insertOrdered(
          type,
          placedPos,
          // Operator-set entry speed when given, else cruise/approach default.
          initSpeed,
          this.simTimeS,
          isEms,
          emsId,
        );
        if (slot === -1) {
          if (isEms) despawned = true;
          else this.enqueueAtBoundary(lane, type, false, undefined);
        } else {
          // Operator-injected vehicles are arrivals too, so the conservation law closes.
          this.totalArrivals++;
        }
      } else if (isEms) {
        despawned = true;
      } else {
        this.enqueueAtBoundary(lane, type, false, undefined);
      }

      if (emsId) {
        this.eventQueue.push({
          kind: 'emsMilestone',
          simTimeS: this.simTimeS,
          emsId,
          lane,
          milestone: despawned ? 'despawned' : 'spawned',
        });
      }

      // Next vehicle in pack starts upstream of placedPos with proper headway
      if (placedPos !== null) candPos = placedPos + spacingM;
    }

    return emsIds;
  }

  /** Queue one injected vehicle at the lane entry gate and count it once. */
  private enqueueAtBoundary(
    lane: LaneId,
    type: VehicleType,
    isEms: boolean,
    emsId?: string,
  ): void {
    const simLane = this.lanes[lane];
    if (!simLane) return;

    simLane.entryBuffer.push({
      type,
      tArrivalS: this.simTimeS,
      tQueuedS: 0,
      isEms,
      emsId,
    });
    this.totalArrivals++;
  }

  public setIncident(kind: IncidentKind, lane: LaneId, positionM: number, durationS?: number): string {
    const id = `inc-${lane}-${kind}-${Math.floor(this.simTimeS)}`;
    this.incidents.push({ id, kind, lane, positionM, durationS, remainingS: durationS });
    this.eventQueue.push({
      kind: 'incident',
      simTimeS: this.simTimeS,
      action: 'started',
      lane,
      incidentKind: kind,
      positionM,
    });
    return id;
  }

  public clearIncident(id: string): void {
    const idx = this.incidents.findIndex((inc) => inc.id === id);
    if (idx !== -1) {
      const inc = this.incidents[idx]!;
      this.incidents.splice(idx, 1);
      this.eventQueue.push({
        kind: 'incident',
        simTimeS: this.simTimeS,
        action: 'cleared',
        lane: inc.lane,
        incidentKind: inc.kind,
        positionM: inc.positionM,
      });
    }
  }

  // --- Physics Step ---

  /**
   * Apply a bounded parameter patch to future work only (Module 31 §2.1 `setParams`).
   *
   * Nothing already on the road is rewritten: demand and geometry changes take
   * effect from the next scheduled arrival. The caller is responsible for the
   * Kernel dry-run before this is reached, and for clamping through
   * `SimConfigSchema` — this method trusts its input.
   *
   * Determinism note: re-arming a lane draws from that lane's *existing* seeded
   * stream rather than reseeding it, so the same patch applied at the same tick
   * always produces the same future. Replay-based time travel depends on that.
   */
  public applyParams(patch: SimConfigPatch): void {
    if (patch.modalSplit) {
      // Merge first, then renormalise: a caller may edit one class at a time,
      // and renormalising a partial map would silently zero the others.
      const base = this.config.modalSplit;
      const car = patch.modalSplit.CAR ?? base.CAR ?? 0;
      const bike = patch.modalSplit.BIKE ?? base.BIKE ?? 0;
      const bus = patch.modalSplit.BUS ?? base.BUS ?? 0;
      const truck = patch.modalSplit.TRUCK ?? base.TRUCK ?? 0;
      // AMBULANCE is never sampled from the modal split (it is injected), so it
      // is excluded from the sum and keeps its configured value.
      const total = car + bike + bus + truck;
      if (total > 1e-9) {
        this.config.modalSplit.CAR = car / total;
        this.config.modalSplit.BIKE = bike / total;
        this.config.modalSplit.BUS = bus / total;
        this.config.modalSplit.TRUCK = truck / total;
      }
    }

    if (patch.laneDemandVph) {
      for (const lane of LANES) {
        const vph = patch.laneDemandVph[lane];
        if (vph === undefined) continue;
        this.config.laneDemandVph[lane] = vph;
        this.rearmLane(lane);
      }
    }

    // Geometry and policy fields are read every tick, so assignment is enough.
    if (patch.laneLengthM !== undefined) this.config.laneLengthM = patch.laneLengthM;
    if (patch.speedLimitMps !== undefined) this.config.speedLimitMps = patch.speedLimitMps;
    if (patch.emsDetectDistanceM !== undefined) {
      this.config.emsDetectDistanceM = patch.emsDetectDistanceM;
    }
    if (patch.emsFiltering !== undefined) this.config.emsFiltering = patch.emsFiltering;
    if (patch.durationS !== undefined) this.config.durationS = patch.durationS;
  }

  /** Reschedule one lane's next arrival from its current stream position. */
  private rearmLane(lane: LaneId): void {
    const vph = this.config.laneDemandVph[lane] ?? 0;
    if (vph <= 0) {
      this.nextArrivalTimes[lane] = Number.POSITIVE_INFINITY;
      return;
    }
    const ratePerS = vph / 3600;
    const u = 1 - this.arrivalRngs[lane]!();
    const gap = -detLn(Math.max(1e-12, u)) / ratePerS;
    this.nextArrivalTimes[lane] = this.simTimeS + gap;
  }

  public step(signal: SignalState): void {
    const dt = TIMING.SIM_DT_S;
    // Module 20 §9 lists `signalTransition` among the domain events. The engine
    // is where a change becomes observable, so the event is emitted here rather
    // than reconstructed later from two samples.
    if (signal.phase !== this.currentSignal.phase || signal.indication !== this.currentSignal.indication) {
      const { phase, indication } = signal;
      this.eventQueue.push({
        kind: 'signalTransition',
        simTimeS: this.simTimeS,
        phase,
        indication,
      });
    }
    this.currentSignal = signal;
    this.simTimeS += dt;
    this.tickCount++;

    // 1. Advance ring buffers (100 bins = 10 s history)
    for (let i = 0; i < LANES.length; i++) {
      const lane = this.lanes[LANES[i]!]!;
      lane.ringHead = (lane.ringHead + 1) % 100;
      lane.arrivalRing[lane.ringHead] = 0;
      lane.dischargeRing[lane.ringHead] = 0;
    }

    // 2. Demand & arrival queues
    this.handleArrivals(dt);

    // 3. Update active incidents
    for (let i = this.incidents.length - 1; i >= 0; i--) {
      const inc = this.incidents[i]!;
      if (inc.remainingS !== undefined) {
        inc.remainingS -= dt;
        if (inc.remainingS <= 0) {
          this.clearIncident(inc.id);
        }
      }
    }

    // 4. Update each lane
    for (let l = 0; l < LANES.length; l++) {
      const laneId = LANES[l]!;
      const lane = this.lanes[laneId]!;
      const signalIndication = signal.lanes[laneId] ?? 'R';
      const boxDistance = lane.getBoxDistance();

      // Find incidents in this lane
      let blockedM: number | null = null;
      let capacityDrop = 1.0;
      for (let k = 0; k < this.incidents.length; k++) {
        const inc = this.incidents[k]!;
        if (inc.lane === laneId) {
          if (inc.kind === 'BLOCKED') {
            blockedM = blockedM === null ? inc.positionM : Math.min(blockedM, inc.positionM);
          } else if (inc.kind === 'CAPACITY_DROP') {
            capacityDrop = 0.5;
          } else if (inc.kind === 'DOUBLE_PARKED') {
            capacityDrop = 0.7;
          }
        }
      }

      // Pre-scan: check if an emergency vehicle is approaching in this lane
      let laneHasEms = false;
      let emsApproachPos = Number.POSITIVE_INFINITY;
      for (let s = 0; s < lane.count; s++) {
        const slot = lane.order[s] as number;
        if ((lane.flags[slot]! & FLAG_EMS) !== 0) {
          laneHasEms = true;
          emsApproachPos = lane.pos[slot] as number;
          break;
        }
      }

      // Iterate over vehicles in lane from front to back
      for (let idx = 0; idx < lane.count; idx++) {
        const slot = lane.order[idx] as number;
        const pos = lane.pos[slot] as number;
        const vel = lane.vel[slot] as number;
        const typ = lane.getVehicleType(slot);
        const spec = VEHICLE_SPECS[typ];
        const isEms = (lane.flags[slot]! & FLAG_EMS) !== 0;
        const hasEmsBehind = !isEms && laneHasEms && pos < emsApproachPos;

        // Effective desired speed v0
        let effectiveV0 = Math.min(this.config.speedLimitMps, spec.maxSpeedMps) * capacityDrop;
        if (hasEmsBehind && signalIndication === 'G') {
          // Normal vehicles ahead of an emergency vehicle yield and clear the intersection rapidly
          effectiveV0 = Math.max(effectiveV0, spec.maxSpeedMps);
        }

        // Leader kinematics
        let leaderDist = Number.POSITIVE_INFINITY;
        let leaderVel = 0;

        if (idx > 0) {
          const leaderSlot = lane.order[idx - 1] as number;
          const leaderPos = lane.pos[leaderSlot] as number;
          const leaderType = lane.getVehicleType(leaderSlot);
          const leaderLen = VEHICLE_SPECS[leaderType].lengthM;
          // `pos` grows upstream: the follower sits at a LARGER position than its
          // leader, so the gap is `pos - leaderPos - leaderLen`. Inverting this
          // produced a permanently negative gap, pinning every second vehicle at
          // its entry point and blocking the approach forever.
          leaderDist = pos - leaderPos - leaderLen;
          leaderVel = lane.vel[leaderSlot] as number;
        }

        // Virtual obstacle from incident
        if (blockedM !== null && pos > blockedM) {
          const distToObstacle = pos - blockedM;
          if (distToObstacle < leaderDist) {
            leaderDist = distToObstacle;
            leaderVel = 0;
          }
        }

        // Virtual stop line leader
        if (pos > 0) {
          let mustStopAtLine = false;
          if (signalIndication === 'R') {
            mustStopAtLine = true;
          } else if (signalIndication === 'Y') {
            // Dilemma zone: can stop at <= 3.5 m/s^2?
            const decelNeeded = (vel * vel) / (2 * Math.max(0.5, pos));
            mustStopAtLine = decelNeeded <= 3.5;
          }

          if (mustStopAtLine && pos < leaderDist) {
            leaderDist = pos;
            leaderVel = 0;
          }
        }

        // EMS shoulder filtering and emergency cruise logic
        let effectiveGap = leaderDist;
        if (isEms) {
          effectiveV0 = Math.max(effectiveV0, TIMING.EMS_CRUISE_MPS);
          if (this.config.emsFiltering && pos > 0) {
            lane.flags[slot] = lane.flags[slot]! | FLAG_FILTERING;
            if (signalIndication === 'G') {
              // Open path through clearing queue when green
              effectiveGap = Math.max(leaderDist, 25.0);
            }
          } else if (pos <= 0) {
            // Inside the intersection box: clear right-of-way to exit
            effectiveGap = Math.max(leaderDist, 30.0);
          }
        }

        // IDM Acceleration calculation
        const s = Math.max(0.1, effectiveGap);
        const deltaV = vel - leaderVel;
        const sqrtAB = Math.sqrt(spec.maxAccel * spec.comfortDecel);
        const sStar = spec.minGapS0 + vel * spec.timeHeadwayT + (vel * deltaV) / (2 * sqrtAB);

        // x2*x2 instead of a power call (Rule 07 §3)
        const ratioV = vel / effectiveV0;
        const ratioV2 = ratioV * ratioV;
        const ratioV4 = ratioV2 * ratioV2;

        const ratioS = sStar / s;
        const ratioS2 = ratioS * ratioS;

        let aIdm = spec.maxAccel * (1 - ratioV4 - ratioS2);
        if (hasEmsBehind && signalIndication === 'G') {
          effectiveV0 = Math.max(effectiveV0, spec.maxSpeedMps);
          if (aIdm > 0) {
            aIdm = Math.min(spec.maxAccel * 1.5, aIdm * 1.4);
          }
        }
        if (aIdm < -9.0) aIdm = -9.0; // clamp physical braking limit

        // Explicit Euler / ballistic update
        const nextVel = Math.max(0, vel + aIdm * dt);
        const nextPos = pos - ((vel + nextVel) / 2) * dt;

        lane.vel[slot] = nextVel;
        lane.pos[slot] = nextPos;

        // Waiting time, idle-fuel accrual and stops
        if (nextVel < 1.0) {
          lane.wait[slot] = (lane.wait[slot] as number) + dt;
          this.idleSecondsByClass[typ] += dt;
          if (nextPos > 0 && nextPos > this.peakQueueM) {
            this.peakQueueM = nextPos;
          }
          if (vel >= 1.0) {
            lane.stops[slot] = Math.min(255, (lane.stops[slot] as number) + 1);
          }
        }

        if (aIdm < -1.0) {
          lane.flags[slot] = lane.flags[slot]! | FLAG_BRAKING;
        } else {
          lane.flags[slot] = lane.flags[slot]! & ~FLAG_BRAKING;
        }

        if (nextPos <= 0 && nextPos > -boxDistance) {
          lane.flags[slot] = lane.flags[slot]! | FLAG_IN_BOX;
        }
      }

      // 5. Check sustained stall at entry boundary (only if jammed at entry and cannot enter)
      for (let idx = lane.count - 1; idx >= 0; idx--) {
        const emsSlot = lane.order[idx] as number;
        if ((lane.flags[emsSlot]! & FLAG_EMS) === 0) continue;
        const emsPos = lane.pos[emsSlot] as number;

        // An ambulance that is rolling, or that has made progress downstream
        // away from the entry boundary, is not stalled.
        if (emsPos < this.config.laneLengthM - EMS_STUCK_ZONE_M) {
          lane.clearEmsStall(emsSlot);
          continue;
        }

        const stalledNow = (lane.vel[emsSlot] as number) < EMS_STALL_MPS;
        if (!stalledNow) {
          lane.clearEmsStall(emsSlot);
          continue;
        }

        if (this.simTimeS - lane.markEmsStall(emsSlot, this.simTimeS) < EMS_STALL_GRACE_S) {
          continue;
        }

        // Genuine sustained stall at the entry end: despawn and report
        const emsType = lane.getVehicleType(emsSlot);
        const emsSpec = VEHICLE_SPECS[emsType];
        const entryTime = lane.t0[emsSlot] as number;
        const waitTime = lane.wait[emsSlot] as number;
        const stops = lane.stops[emsSlot] as number;
        const emsId = lane.takeEmsId(emsSlot);

        lane.removeAt(idx);
        lane.clearEmsStall(emsSlot);
        this.totalExited++;

        this.eventQueue.push({
          kind: 'vehicleExited',
          simTimeS: this.simTimeS,
          lane: laneId,
          vehicleType: emsType,
          delayS: 0,
          stops,
          waitS: waitTime,
          pax: emsSpec.pax,
        });

        this.eventQueue.push({
          kind: 'emsMilestone',
          simTimeS: this.simTimeS,
          emsId: emsId ?? `ems-${laneId}-${Math.round(entryTime * 10)}`,
          lane: laneId,
          milestone: 'despawned',
        });
      }

      // 6. Check front vehicle exit across the far edge of the intersection box
      while (lane.count > 0) {
        const frontSlot = lane.order[0] as number;
        const frontPos = lane.pos[frontSlot] as number;
        if (frontPos <= -boxDistance) {
          const type = lane.getVehicleType(frontSlot);
          const spec = VEHICLE_SPECS[type];
          const entryTime = lane.t0[frontSlot] as number;
          const waitTime = lane.wait[frontSlot] as number;
          const stops = lane.stops[frontSlot] as number;
          const isFrontEms = (lane.flags[frontSlot]! & FLAG_EMS) !== 0;
          const emsId = isFrontEms ? lane.takeEmsId(frontSlot) : null;

          // Free-flow transit time = (laneLength + box) / min(speedLimit, spec.maxSpeed)
          const freeFlowTransitS =
            (this.config.laneLengthM + boxDistance) /
            Math.min(this.config.speedLimitMps, spec.maxSpeedMps);
          const actualTransitS = this.simTimeS - entryTime;
          const delayS = Math.max(0, actualTransitS - freeFlowTransitS);

          lane.removeFront();
          lane.clearEmsStall(frontSlot);
          this.totalExited++;
          lane.dischargeRing[lane.ringHead] = (lane.dischargeRing[lane.ringHead] ?? 0) + 1;

          this.eventQueue.push({
            kind: 'vehicleExited',
            simTimeS: this.simTimeS,
            lane: laneId,
            vehicleType: type,
            delayS,
            stops,
            waitS: waitTime,
            pax: spec.pax,
          });

          if (isFrontEms) {
            this.eventQueue.push({
              kind: 'emsMilestone',
              simTimeS: this.simTimeS,
              emsId: emsId ?? `ems-${laneId}-${Math.round(entryTime * 10)}`,
              lane: laneId,
              milestone: 'boxExited',
              delayS,
            });
          }
        } else {
          break;
        }
      }
    }
  }

  // --- Observation Construction ---

  public observe(): Observation {
    const laneObs: Record<LaneId, LaneObservation> = {} as Record<LaneId, LaneObservation>;

    for (let l = 0; l < LANES.length; l++) {
      const laneId = LANES[l]!;
      const lane = this.lanes[laneId]!;

      let queueLengthM = 0;
      let sumWeightedWaitS = 0;
      let maxWaitS = 0;
      let nearestEmsDist: number | null = null;
      let occupiedLengthM = 0;

      // Module 20 §8: the queue is the *contiguous* run of queued vehicles
      // starting at the stop line. Taking the furthest stopped vehicle anywhere
      // in the lane reported a jam that did not exist whenever one stopped
      // vehicle sat upstream of a moving one.
      for (let i = 0; i < lane.count; i++) {
        const slot = lane.order[i] as number;
        if ((lane.vel[slot] as number) >= 1.0) break;
        const pos = lane.pos[slot] as number;
        if (pos > queueLengthM) queueLengthM = pos;
      }

      let hasEms = false;
      let emsInBox = false;
      const boxDist = lane.getBoxDistance();

      // Scan vehicles in lane
      for (let i = 0; i < lane.count; i++) {
        const slot = lane.order[i] as number;
        const pos = lane.pos[slot] as number;
        const vel = lane.vel[slot] as number;
        const wait = lane.wait[slot] as number;
        const typ = lane.getVehicleType(slot);
        const spec = VEHICLE_SPECS[typ];
        const isEms = (lane.flags[slot]! & FLAG_EMS) !== 0;

        occupiedLengthM += spec.lengthM + spec.minGapS0;

        if (wait > maxWaitS) maxWaitS = wait;
        sumWeightedWaitS += spec.priorityWeight * wait;

        if (isEms) {
          hasEms = true;
          if (pos <= 0 && pos > -boxDist) {
            emsInBox = true;
          } else if (pos > 0) {
            if (nearestEmsDist === null || pos < nearestEmsDist) {
              nearestEmsDist = pos;
            }
          }
        }
      }

      // Calculate 10s arrival/discharge sums
      let arrivals10s = 0;
      let discharged10s = 0;
      for (let b = 0; b < 100; b++) {
        arrivals10s += lane.arrivalRing[b] ?? 0;
        discharged10s += lane.dischargeRing[b] ?? 0;
      }

      laneObs[laneId] = {
        laneId,
        vehicleCount: lane.count,
        queueLengthM,
        sumWeightedWaitS,
        maxWaitS,
        arrivalsLast10s: arrivals10s,
        dischargedLast10s: discharged10s,
        // Convention (Module 20 §8): occupied length is the sum of
        // (vehicle length + minimum gap) over every vehicle in the lane,
        // including those already in the box, divided by `laneLengthM` and
        // capped at 100 %. It is a storage-occupancy proxy, not a density.
        occupancyPct: Math.min(100, (occupiedLengthM / this.config.laneLengthM) * 100),
        nearestEmsDistanceM: nearestEmsDist,
        nearestEmsId: lane.nearestEmsId(),
        hasEms,
        emsInBox,
        valid: true,
      };
    }

    return {
      simTimeS: this.simTimeS,
      lanes: laneObs,
      signal: this.currentSignal,
      activeIncidents: this.incidents.map((inc) => ({
        lane: inc.lane,
        kind: inc.kind,
        positionM: inc.positionM,
      })),
    };
  }

  // --- Domain Events Draining ---

  public drainEvents(): DomainEvent[] {
    const drained = [...this.eventQueue];
    this.eventQueue.length = 0;
    return drained;
  }

  // --- State Hash ---

  public stateHash(): string {
    const views: ArrayBufferView[] = [];
    for (let i = 0; i < LANES.length; i++) {
      const lane = this.lanes[LANES[i]!]!;
      views.push(lane.pos);
      views.push(lane.vel);
      views.push(lane.typ);
      views.push(lane.wait);
      views.push(lane.stops);
      views.push(lane.flags);
      views.push(lane.order);
    }
    return hashState(views);
  }
}
