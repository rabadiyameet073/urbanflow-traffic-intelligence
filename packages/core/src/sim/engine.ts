/**
 * Module 20: Bit-Deterministic Simulation Engine
 * High-performance, zero-randomness physics engine using typed arrays.
 */
import {
  LANES,
  LaneId,
  VehicleType,
  VEHICLE_TYPES,
  VEHICLE_SPECS,
  TIMING,
  SimConfig,
  DEFAULT_SIM_CONFIG,
  SignalState,
  Observation,
  LaneObservation,
  DomainEvent,
  IncidentKind,
} from '../contracts.js';
import { splitRng, detLn } from '../helpers/rng.js';
import { hashState } from '../helpers/hash.js';
import { SimLane } from './lane.js';
import { FLAG_BRAKING, FLAG_EMS, FLAG_IN_BOX, FLAG_FILTERING, ActiveIncident, QueuedArrival } from './types.js';

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

  constructor(config: Partial<SimConfig> = {}) {
    this.config = { ...DEFAULT_SIM_CONFIG, ...config };

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

    this.currentSignal = {
      phase: null,
      indication: 'ALL_RED',
      timeInStateS: 0,
      lanes: {
        'NB-TR': 'R', 'NB-L': 'R',
        'SB-TR': 'R', 'SB-L': 'R',
        'EB-TR': 'R', 'EB-L': 'R',
        'WB-TR': 'R', 'WB-L': 'R',
      },
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

  public spawnEms(lane: LaneId): string {
    const emsId = `ems-${lane}-${Math.floor(this.simTimeS * 10)}`;
    const simLane = this.lanes[lane];
    if (!simLane) return emsId;

    simLane.entryBuffer.unshift({
      type: 'AMBULANCE',
      tArrivalS: this.simTimeS,
      tQueuedS: 0,
      isEms: true,
      emsId,
    });

    this.eventQueue.push({
      kind: 'emsMilestone',
      simTimeS: this.simTimeS,
      emsId,
      lane,
      milestone: 'spawned',
    });

    return emsId;
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

  public step(signal: SignalState): void {
    const dt = TIMING.SIM_DT_S;
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

      // Iterate over vehicles in lane from front to back
      for (let idx = 0; idx < lane.count; idx++) {
        const slot = lane.order[idx] as number;
        const pos = lane.pos[slot] as number;
        const vel = lane.vel[slot] as number;
        const typ = lane.getVehicleType(slot);
        const spec = VEHICLE_SPECS[typ];
        const isEms = (lane.flags[slot]! & FLAG_EMS) !== 0;

        // Effective desired speed v0
        const v0 = Math.min(this.config.speedLimitMps, spec.maxSpeedMps) * capacityDrop;

        // Leader kinematics
        let leaderDist = Number.POSITIVE_INFINITY;
        let leaderVel = 0;

        if (idx > 0) {
          const leaderSlot = lane.order[idx - 1] as number;
          const leaderPos = lane.pos[leaderSlot] as number;
          const leaderType = lane.getVehicleType(leaderSlot);
          const leaderLen = VEHICLE_SPECS[leaderType].lengthM;
          leaderDist = leaderPos - pos - leaderLen;
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

        // EMS shoulder filtering logic
        let effectiveGap = leaderDist;
        let effectiveV0 = v0;
        if (isEms && this.config.emsFiltering && pos > 0) {
          lane.flags[slot] = lane.flags[slot]! | FLAG_FILTERING;
          effectiveV0 = Math.min(v0, 8.0); // max 8 m/s on shoulder
          if (signalIndication === 'G') {
            effectiveGap = Math.max(leaderDist, 20.0);
          }
        }

        // IDM Acceleration calculation
        const s = Math.max(0.1, effectiveGap);
        const deltaV = vel - leaderVel;
        const sqrtAB = Math.sqrt(spec.maxAccel * spec.comfortDecel);
        const sStar = spec.minGapS0 + vel * spec.timeHeadwayT + (vel * deltaV) / (2 * sqrtAB);

        // x2*x2 instead of Math.pow(x, 4)
        const ratioV = vel / effectiveV0;
        const ratioV2 = ratioV * ratioV;
        const ratioV4 = ratioV2 * ratioV2;

        const ratioS = sStar / s;
        const ratioS2 = ratioS * ratioS;

        let aIdm = spec.maxAccel * (1 - ratioV4 - ratioS2);
        if (aIdm < -9.0) aIdm = -9.0; // clamp physical braking limit

        // Explicit Euler / ballistic update
        const nextVel = Math.max(0, vel + aIdm * dt);
        const nextPos = pos - ((vel + nextVel) / 2) * dt;

        lane.vel[slot] = nextVel;
        lane.pos[slot] = nextPos;

        // Waiting time & stops
        if (nextVel < 1.0) {
          lane.wait[slot] = (lane.wait[slot] as number) + dt;
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

      // 5. Check front vehicle exit
      if (lane.count > 0) {
        const frontSlot = lane.order[0] as number;
        const frontPos = lane.pos[frontSlot] as number;
        if (frontPos <= -boxDistance) {
          const type = lane.getVehicleType(frontSlot);
          const spec = VEHICLE_SPECS[type];
          const entryTime = lane.t0[frontSlot] as number;
          const waitTime = lane.wait[frontSlot] as number;
          const stops = lane.stops[frontSlot] as number;
          const isEms = (lane.flags[frontSlot]! & FLAG_EMS) !== 0;

          // Free-flow transit time = (laneLength + box) / min(speedLimit, spec.maxSpeed)
          const freeFlowTransitS =
            (this.config.laneLengthM + boxDistance) /
            Math.min(this.config.speedLimitMps, spec.maxSpeedMps);
          const actualTransitS = this.simTimeS - entryTime;
          const delayS = Math.max(0, actualTransitS - freeFlowTransitS);

          lane.removeFront();
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

          if (isEms) {
            this.eventQueue.push({
              kind: 'emsMilestone',
              simTimeS: this.simTimeS,
              emsId: `ems-${laneId}`,
              lane: laneId,
              milestone: 'boxExited',
              delayS,
            });
          }
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

        if (pos > 0 && vel < 1.0) {
          queueLengthM = Math.max(queueLengthM, pos);
        }

        if (isEms && pos > 0) {
          if (nearestEmsDist === null || pos < nearestEmsDist) {
            nearestEmsDist = pos;
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
        occupancyPct: Math.min(100, (occupiedLengthM / this.config.laneLengthM) * 100),
        nearestEmsDistanceM: nearestEmsDist,
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
