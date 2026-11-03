/**
 * Module 02 §4: Metrics Contract (single source of truth for reported numbers)
 *
 * Every number the dashboard, the benchmark report and RESULTS.md display is
 * produced here from measured simulation state. Scripts must never synthesise a
 * KPI from another KPI (Rule 00 - honest numbers).
 *
 * Definitions follow Module 02 §4 exactly:
 *   avgDelayS      mean (travel time - free-flow time) of exited vehicles
 *   personDelayS   sum(delay * pax) / sum(pax)
 *   busDelayS      per-class mean delay for buses (equity)
 *   bikeDelayS     per-class mean delay for bikes (equity)
 *   throughputVph  exited vehicles per hour of simulated time
 *   maxQueueM      max queue length over lanes and time (metres)
 *   stopsPerVeh    mean number of stops per exited vehicle
 *   emsDelayS      actual transit - free-flow transit for completed EMS runs
 *   idleFuelL      sum(idle seconds * per-class L/h / 3600)
 *   co2Kg          gasoline fuel * 2.31 + diesel fuel * 2.68 (assumptions)
 *   deniedEntries  arrivals denied after the 30 s entry buffer, count and share
 *   los            HCM grade derived from avgDelayS
 *
 * Conservation law: arrivals = exited + inSystem + denied.
 */
import {
  CO2_KG_PER_L,
  DomainEvent,
  LaneId,
  VEHICLE_SPECS,
  VEHICLE_TYPES,
  VehicleType,
  computeLos,
  LosGrade,
} from '../contracts.js';

/** Per-class delay accumulator. */
interface ClassDelay {
  n: number;
  sumS: number;
}

/**
 * Structural view of the simulator needed to close the metrics contract.
 * `SimEngine` satisfies it; tests can pass a hand-built stub.
 */
export interface MetricsSource {
  readonly simTimeS: number;
  readonly totalArrivals: number;
  readonly totalExited: number;
  readonly totalDenied: number;
  /** Running maximum queue length in metres, updated every physics tick. */
  readonly peakQueueM: number;
  /** Cumulative seconds spent below 1 m/s, per vehicle class. */
  readonly idleSecondsByClass: Readonly<Record<VehicleType, number>>;
  readonly lanes: Readonly<
    Record<LaneId, { readonly count: number; readonly entryBuffer: readonly unknown[] }>
  >;
}

/** Conservation-law audit: arrivals must equal exited + inSystem + denied. */
export interface ConservationCheck {
  arrivals: number;
  exited: number;
  inSystem: number;
  denied: number;
  balanced: boolean;
}

/** Immutable snapshot of the Module 02 §4 metrics for one twin. */
export interface MetricsSnapshot {
  elapsedS: number;
  avgDelayS: number | null;
  personDelayS: number | null;
  busDelayS: number | null;
  bikeDelayS: number | null;
  throughputVph: number | null;
  maxQueueM: number;
  stopsPerVeh: number | null;
  /** Mean measured delay over completed EMS runs; `null` until one completes. */
  emsDelayS: number | null;
  emsRuns: number;
  idleFuelL: number;
  co2Kg: number;
  deniedEntries: number;
  deniedPct: number;
  los: LosGrade | null;
  conservation: ConservationCheck;
}

const EMPTY_IDLE: Record<VehicleType, number> = {
  BIKE: 0,
  CAR: 0,
  BUS: 0,
  TRUCK: 0,
  AMBULANCE: 0,
};

/**
 * Accumulates delay, stop, EMS and denial statistics from drained domain events.
 *
 * The accumulator is deliberately stateful and append-only so that the UI can
 * ingest one drained event batch per animation frame without replaying history.
 */
export class MetricsAccumulator {
  private exited = 0;
  private delaySumS = 0;
  private personDelayWeightedS = 0;
  private paxSum = 0;
  private stopsSum = 0;
  private readonly classDelay = new Map<VehicleType, ClassDelay>();
  private emsDelaySumS = 0;
  private emsRuns = 0;

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.exited = 0;
    this.delaySumS = 0;
    this.personDelayWeightedS = 0;
    this.paxSum = 0;
    this.stopsSum = 0;
    this.classDelay.clear();
    for (const type of VEHICLE_TYPES) {
      this.classDelay.set(type, { n: 0, sumS: 0 });
    }
    this.emsDelaySumS = 0;
    this.emsRuns = 0;
  }

  /** Ingest one drained batch of simulator domain events. Idempotent per batch. */
  public ingest(events: readonly DomainEvent[]): void {
    for (const event of events) {
      if (event.kind === 'vehicleExited') {
        this.recordExit(event.vehicleType, event.delayS, event.stops, event.pax);
      } else if (event.kind === 'emsMilestone') {
        // `boxExited` is the only milestone that carries a completed transit delay.
        if (event.milestone === 'boxExited' && typeof event.delayS === 'number') {
          this.emsDelaySumS += event.delayS;
          this.emsRuns++;
        }
      }
    }
  }

  private recordExit(type: VehicleType, delayS: number, stops: number, pax: number): void {
    const delay = Number.isFinite(delayS) && delayS > 0 ? delayS : 0;
    const passengerCount = Number.isFinite(pax) && pax > 0 ? pax : VEHICLE_SPECS[type].pax;

    this.exited++;
    this.delaySumS += delay;
    this.personDelayWeightedS += delay * passengerCount;
    this.paxSum += passengerCount;
    this.stopsSum += Number.isFinite(stops) ? stops : 0;

    const bucket = this.classDelay.get(type);
    if (bucket) {
      bucket.n++;
      bucket.sumS += delay;
    }
  }

  private classMean(type: VehicleType): number | null {
    const bucket = this.classDelay.get(type);
    if (!bucket || bucket.n === 0) return null;
    return bucket.sumS / bucket.n;
  }

  /**
   * Idle fuel in litres from cumulative per-class idle seconds.
   * Classes that do not burn fuel while stopped (bikes) contribute 0.
   */
  private static idleFuelL(idleSecondsByClass: Readonly<Record<VehicleType, number>>): {
    fuelL: number;
    co2Kg: number;
  } {
    let fuelL = 0;
    let co2Kg = 0;

    for (const type of VEHICLE_TYPES) {
      const seconds = idleSecondsByClass[type] ?? 0;
      if (seconds <= 0) continue;

      const spec = VEHICLE_SPECS[type];
      const litres = (seconds * spec.idleFuelLPerHour) / 3600.0;
      fuelL += litres;
      co2Kg += litres * CO2_KG_PER_L[spec.fuelType];
    }

    return { fuelL, co2Kg };
  }

  /** Build an immutable snapshot, closing the conservation law against `source`. */
  public snapshot(source: MetricsSource): MetricsSnapshot {
    const elapsedS = source.simTimeS;

    let inSystem = 0;
    for (const lane of Object.values(source.lanes)) {
      inSystem += lane.count + lane.entryBuffer.length;
    }

    const conservation: ConservationCheck = {
      arrivals: source.totalArrivals,
      exited: source.totalExited,
      inSystem,
      denied: source.totalDenied,
      // Vehicles waiting in the entry buffer are still in the system, so this closes exactly.
      balanced: source.totalArrivals === source.totalExited + inSystem + source.totalDenied,
    };

    const { fuelL, co2Kg } = MetricsAccumulator.idleFuelL(source.idleSecondsByClass);
    const avgDelayS = this.exited > 0 ? this.delaySumS / this.exited : null;
    const deniedPct =
      source.totalArrivals > 0 ? (source.totalDenied / source.totalArrivals) * 100 : 0;

    return {
      elapsedS,
      avgDelayS,
      personDelayS: this.paxSum > 0 ? this.personDelayWeightedS / this.paxSum : null,
      busDelayS: this.classMean('BUS'),
      bikeDelayS: this.classMean('BIKE'),
      throughputVph: elapsedS > 0 ? (source.totalExited / elapsedS) * 3600 : null,
      maxQueueM: source.peakQueueM,
      stopsPerVeh: this.exited > 0 ? this.stopsSum / this.exited : null,
      emsDelayS: this.emsRuns > 0 ? this.emsDelaySumS / this.emsRuns : null,
      emsRuns: this.emsRuns,
      idleFuelL: fuelL,
      co2Kg,
      deniedEntries: source.totalDenied,
      deniedPct,
      los: computeLos(avgDelayS),
      conservation,
    };
  }
}

/** Default idle-seconds record, exported so callers can build a `MetricsSource`. */
export function emptyIdleSecondsByClass(): Record<VehicleType, number> {
  return { ...EMPTY_IDLE };
}

/**
 * Relative difference between adaptive and fixed, expressed in percent.
 * Returns `null` when the baseline is missing or non-positive so the UI can
 * render an em dash instead of inventing a number (Module 41 §6).
 */
export function relativeChangePct(value: number | null, baseline: number | null): number | null {
  if (value === null || baseline === null) return null;
  if (!Number.isFinite(value) || !Number.isFinite(baseline)) return null;
  if (baseline <= 0) return null;
  return ((value - baseline) / baseline) * 100;
}
