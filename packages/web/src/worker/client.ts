/**
 * Module 31 §7: main-thread client for the simulation worker.
 *
 * Responsibilities, all of them failure-path:
 *   - **Recycle.** Every received frame buffer goes straight back to the worker
 *     after the renderer has drawn it, so the worker's pool never starves.
 *   - **Heartbeat.** A worker that stops posting frames for 2 s is terminated
 *     and rebuilt from the seed plus the last known sim time (§7 row 1).
 *   - **Ordering.** `requestPreemption` and `verifyProposal` are the commands
 *     with an answer; their resolvers are matched in send order, which is the
 *     order the worker processes them in.
 *
 * Nothing here computes a number that is displayed. It forwards, and it
 * recovers.
 */
import { WORKER_PROTOCOL_VERSION, assertNever } from '@urbanflow/core';
import type {
  EvpDecisionResponse,
  FrameEvent,
  IncidentKind,
  LaneId,
  SimConfig,
  VehicleType,
  WorkerCommand,
  WorkerEvent,
} from '@urbanflow/core';

export interface ProposalVerdict {
  approved: boolean;
  reason: string;
  improvementPct: number;
  currentPersonDelayS: number;
  proposedPersonDelayS: number;
  kernelViolations: number;
}

export interface SimulationHandlers {
  onFrame(event: FrameEvent): void;
  onKpis(event: Extract<WorkerEvent, { type: 'kpis' }>): void;
  onDecision(event: Extract<WorkerEvent, { type: 'decision' }>): void;
  onSafety(event: Extract<WorkerEvent, { type: 'safety' }>): void;
  onHash(event: Extract<WorkerEvent, { type: 'hash' }>): void;
  onEvp(event: Extract<WorkerEvent, { type: 'evp' }>): void;
  onError(code: string, message: string): void;
  /** Called after an automatic rebuild, so the UI can show the recovery. */
  onRestart(tSimS: number): void;
}

const HEARTBEAT_MS = 1000;
const MISSED_FRAME_LIMIT_MS = 2000;

export class SimulationClient {
  private worker: Worker;
  private readonly handlers: Partial<SimulationHandlers>;

  private lastInit: { scenarioId: string; seed: number; config: SimConfig } | null = null;
  private lastT = 0;
  private lastFrameAtMs = 0;
  private running = false;
  private speed = 5;
  private pingCounter = 0;
  private heartbeat: ReturnType<typeof setInterval>;
  private pendingPreemption: Array<(result: EvpDecisionResponse) => void> = [];
  private pendingProposal: Array<(result: ProposalVerdict) => void> = [];
  private restarts = 0;

  constructor(handlers: Partial<SimulationHandlers> = {}) {
    this.handlers = handlers;
    this.worker = this.spawn();
    this.heartbeat = setInterval(() => this.checkHeartbeat(), HEARTBEAT_MS);
  }

  // --- Lifecycle ---

  private spawn(): Worker {
    const worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent): void => this.receive(event);
    worker.onerror = (event: ErrorEvent): void => {
      this.handlers.onError?.('WORKER_ERROR', event.message || 'simulation worker crashed');
      this.restart();
    };
    return worker;
  }

  /**
   * Rebuild after a crash or a missed heartbeat.
   *
   * The world is re-derived from the seed and the input log inside the worker,
   * so `restoreTo` returns an identical state rather than an approximation.
   * That is the safety property that makes a silent restart acceptable.
   */
  private restart(): void {
    if (!this.lastInit) return;

    this.worker.terminate();
    this.pendingPreemption = [];
    this.pendingProposal = [];
    this.worker = this.spawn();
    this.restarts++;

    this.send({ ...this.lastInit, v: WORKER_PROTOCOL_VERSION, type: 'init' });
    if (this.lastT > 0) this.restoreTo(this.lastT);
    if (this.running) this.run(this.speed);

    this.handlers.onRestart?.(this.lastT);
  }

  private checkHeartbeat(): void {
    if (!this.running) return;

    // Ask the worker to prove it is alive; a missed frame alone is not proof of
    // death, because the main thread can be the slow side.
    this.pingCounter++;
    this.send({ v: WORKER_PROTOCOL_VERSION, type: 'ping', n: this.pingCounter });

    if (performance.now() - this.lastFrameAtMs > MISSED_FRAME_LIMIT_MS) {
      this.restart();
    }
  }

  public dispose(): void {
    clearInterval(this.heartbeat);
    this.worker.terminate();
  }

  public get restartCount(): number {
    return this.restarts;
  }

  // --- Commands ---

  public init(scenarioId: string, seed: number, config: SimConfig): void {
    this.lastInit = { scenarioId, seed, config };
    this.lastT = 0;
    this.running = false;
    this.send({ v: WORKER_PROTOCOL_VERSION, type: 'init', scenarioId, seed, config });
  }

  public run(speed: number): void {
    this.speed = speed;
    this.running = true;
    this.lastFrameAtMs = performance.now();
    this.send({ v: WORKER_PROTOCOL_VERSION, type: 'run', speed: this.clampSpeed(speed) });
  }

  public pause(): void {
    this.running = false;
    this.send({ v: WORKER_PROTOCOL_VERSION, type: 'pause' });
  }

  public step(): void {
    this.send({ v: WORKER_PROTOCOL_VERSION, type: 'step' });
  }

  public reset(seed: number): void {
    this.lastT = 0;
    this.send({ v: WORKER_PROTOCOL_VERSION, type: 'reset', seed });
  }

  public setLaneDemand(lane: LaneId, vph: number): void {
    this.send({ v: WORKER_PROTOCOL_VERSION, type: 'setLaneDemand', lane, vph });
  }

  public setModalSplit(split: Record<'CAR' | 'BIKE' | 'BUS' | 'TRUCK', number>): void {
    this.send({ v: WORKER_PROTOCOL_VERSION, type: 'setModalSplit', split });
  }

  public spawnEms(lane: LaneId, distanceM?: number): void {
    this.send({
      v: WORKER_PROTOCOL_VERSION,
      type: 'spawnEms',
      lane,
      ...(distanceM === undefined ? {} : { distanceM }),
    });
  }

  /**
   * Inject `count` vehicles of one class into one approach (Module 31 §4).
   *
   * `distanceM` omitted means "join the entry queue"; given means "appear that
   * far upstream". The worker decides where the vehicle actually lands — this
   * side only states the request.
   */
  public spawnVehicle(
    lane: LaneId,
    vehicleType: VehicleType,
    count = 1,
    distanceM?: number,
  ): void {
    this.send({
      v: WORKER_PROTOCOL_VERSION,
      type: 'spawnVehicle',
      lane,
      vehicleType,
      count,
      ...(distanceM === undefined ? {} : { distanceM }),
    });
  }

  public injectIncident(
    lane: LaneId,
    kind: IncidentKind,
    positionM: number,
    durationS: number,
  ): void {
    this.send({
      v: WORKER_PROTOCOL_VERSION,
      type: 'injectIncident',
      lane,
      kind,
      positionM,
      durationS,
    });
  }

  public clearIncident(lane: LaneId): void {
    this.send({ v: WORKER_PROTOCOL_VERSION, type: 'clearIncident', lane });
  }

  public setParams(params: Partial<SimConfig>): void {
    // The worker re-validates; sending a partial patch is the documented shape.
    this.send({ v: WORKER_PROTOCOL_VERSION, type: 'setParams', params } as WorkerCommand);
  }

  public restoreTo(tSimS: number): void {
    this.send({ v: WORKER_PROTOCOL_VERSION, type: 'restoreTo', tSimS });
  }

  public requestSnapshot(): void {
    this.send({ v: WORKER_PROTOCOL_VERSION, type: 'requestSnapshot' });
  }

  public requestPreemption(lane: LaneId, distanceM?: number): Promise<EvpDecisionResponse> {
    const promise = new Promise<EvpDecisionResponse>((resolve) => {
      this.pendingPreemption.push(resolve);
    });
    this.send({ v: WORKER_PROTOCOL_VERSION, type: 'requestPreemption', lane, distanceM });
    return promise;
  }

  /** Abandon the running preemption; normal control resumes (Module 03 §5.3). */
  public cancelPreemption(): void {
    this.send({ v: WORKER_PROTOCOL_VERSION, type: 'cancelPreemption' });
  }

  /**
   * Ask the worker to verify a proposed parameter change (Module 04 §3.4).
   *
   * Nothing is applied: the verdict says whether it *would* be, and why not.
   */
  public verifyProposal(params: Record<string, unknown>): Promise<ProposalVerdict> {
    const promise = new Promise<ProposalVerdict>((resolve) => {
      this.pendingProposal.push(resolve);
    });
    this.send({ v: WORKER_PROTOCOL_VERSION, type: 'verifyProposal', params });
    return promise;
  }

  // --- Inbound ---

  private receive(event: MessageEvent): void {
    const data = event.data as WorkerEvent;
    if (typeof data !== 'object' || data === null) return;
    if (data.v !== WORKER_PROTOCOL_VERSION) {
      this.handlers.onError?.('PROTOCOL_VERSION', `worker speaks v${String(data.v)}`);
      this.restart();
      return;
    }

    switch (data.type) {
      case 'frame':
        this.lastFrameAtMs = performance.now();
        this.lastT = data.header.tSimS;
        this.handlers.onFrame?.(data);
        // Draw synchronously, then hand the buffer straight back. Holding it
        // would starve the pool and the worker would start dropping frames.
        this.send({
          v: WORKER_PROTOCOL_VERSION,
          type: 'recycle',
          vehicles: data.vehicles,
          signalHeads: data.signalHeads,
        });
        break;

      case 'kpis':
        this.lastT = data.tSimS;
        this.handlers.onKpis?.(data);
        break;

      case 'decision':
        this.handlers.onDecision?.(data);
        break;

      case 'safety':
        this.handlers.onSafety?.(data);
        break;

      case 'hash':
        this.handlers.onHash?.(data);
        break;

      case 'evp':
        this.handlers.onEvp?.(data);
        break;

      case 'preemptionResult': {
        const resolve = this.pendingPreemption.shift();
        resolve?.(data.result);
        break;
      }

      case 'proposalVerified': {
        const resolve = this.pendingProposal.shift();
        resolve?.(data.result);
        break;
      }

      case 'error':
        this.handlers.onError?.(data.code, data.message);
        break;

      case 'pong':
      case 'snapshot':
      case 'dropped':
        break;

      default:
        // Module 50 §5: never-check — a new WorkerEvent variant must be
        // handled here, not swallowed.
        return assertNever(data);
    }
  }

  private send(command: WorkerCommand): void {
    this.worker.postMessage(command);
  }

  private clampSpeed(speed: number): 0.5 | 1 | 5 | 20 {
    if (speed >= 20) return 20;
    if (speed >= 5) return 5;
    if (speed >= 1) return 1;
    return 0.5;
  }
}
