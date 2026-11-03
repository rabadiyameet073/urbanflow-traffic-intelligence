import { describe, it, expect } from 'vitest';
import {
  AdaptiveParamsSchema,
  DEFAULT_ADAPTIVE_PARAMS,
  DEFAULT_SIM_CONFIG,
  FRAME_INDEX,
  FRAME_MAX_VEHICLES,
  LANES,
  SIGNAL_HEAD,
  SimConfigSchema,
  TIMING,
  TwinWorld,
  VEHICLE_STRIDE,
  canvasToWorld,
  laneAnchor,
  laneAtWorldPoint,
  parseCommand,
  pointInPolygon,
  vehicleWorld,
  viewportFor,
  worldToCanvas,
} from '../src/index.js';
import type { EvpTimelineEntry, WorkerCommand } from '../src/index.js';

const CONFIG = SimConfigSchema.parse({ ...DEFAULT_SIM_CONFIG, seed: 7 });

function world(seed = 7): TwinWorld {
  return new TwinWorld('balanced-parity', seed, SimConfigSchema.parse({ ...CONFIG, seed }));
}

describe('Worker protocol (Module 31 §2)', () => {
  it('rejects a command from a different protocol version', () => {
    const result = parseCommand({ v: 2, type: 'pause' });
    expect(result.ok).toBe(false);
  });

  it('rejects an out-of-range lane demand instead of silently clamping', () => {
    // Clamping is the caller's job (`AppStore.setLaneDemand`); the wire contract
    // refuses the message so a bug cannot look like an operator choice.
    expect(parseCommand({ v: 1, type: 'setLaneDemand', lane: 'NB-TR', vph: 2000 }).ok).toBe(false);
    expect(parseCommand({ v: 1, type: 'setLaneDemand', lane: 'NB-TR', vph: 1200 }).ok).toBe(true);
  });

  it('rejects an unknown lane and an unknown command type', () => {
    expect(parseCommand({ v: 1, type: 'spawnEms', lane: 'XX-TR' }).ok).toBe(false);
    expect(parseCommand({ v: 1, type: 'teleport' }).ok).toBe(false);
  });

  it('accepts every speed the UI offers and nothing in between', () => {
    for (const speed of [0.5, 1, 5, 20]) {
      expect(parseCommand({ v: 1, type: 'run', speed }).ok).toBe(true);
    }
    expect(parseCommand({ v: 1, type: 'run', speed: 2 }).ok).toBe(false);
  });

  it('sizes the frame ceiling to the engine capacity, not a guess', () => {
    expect(FRAME_MAX_VEHICLES).toBe(LANES.length * 512);
    expect(VEHICLE_STRIDE).toBe(6);
  });
});

describe('World ↔ canvas geometry (Module 31 §3.1)', () => {
  it('round-trips a point through both transforms within a micrometre', () => {
    const viewport = viewportFor(800, 600);
    for (const [x, y] of [
      [0, 0],
      [23.5, -41.25],
      [-60, 60],
    ] as const) {
      const px = worldToCanvas(x, y, viewport);
      const back = canvasToWorld(px.px, px.py, viewport);
      expect(Math.abs(back.x - x)).toBeLessThan(1e-6);
      expect(Math.abs(back.y - y)).toBeLessThan(1e-6);
    }
  });

  it('places through lanes on the driver’s right (right-hand traffic, ADR 0020)', () => {
    expect(laneAnchor('NB-TR').x).toBeGreaterThan(0);
    expect(laneAnchor('SB-TR').x).toBeLessThan(0);
    expect(laneAnchor('EB-TR').y).toBeLessThan(0);
    expect(laneAnchor('WB-TR').y).toBeGreaterThan(0);
  });

  it('moves a vehicle upstream, never across the centreline', () => {
    const near = vehicleWorld('NB-TR', 0);
    const far = vehicleWorld('NB-TR', 100);
    expect(far.y).toBeLessThan(near.y);
    expect(far.x).toBe(near.x);
    // Northbound travel is +y, so heading is a quarter turn.
    expect(near.headingRad).toBeCloseTo(Math.PI / 2, 9);
  });

  it('hits the lane that was clicked and nothing outside it', () => {
    // One lane per approach, chosen by the lateral offset rather than by order.
    expect(laneAtWorldPoint(1.75, -30, 300)).toBe('NB-TR');
    expect(laneAtWorldPoint(5.25, -30, 300)).toBe('NB-L');
    expect(laneAtWorldPoint(-1.75, 30, 300)).toBe('SB-TR');
    expect(laneAtWorldPoint(-5.25, 30, 300)).toBe('SB-L');
    // The centreline is shared by the two opposing through lanes, so a click on
    // it must still resolve to exactly one lane rather than falling through.
    expect(laneAtWorldPoint(0, -30, 300)).not.toBeNull();
    // Beyond the carriageway, and past the end of the lane, is a miss.
    expect(laneAtWorldPoint(7.6, 50, 300)).toBeNull();
    expect(laneAtWorldPoint(1.75, 400, 300)).toBeNull();
    expect(laneAtWorldPoint(200, 200, 300)).toBeNull();
  });

  it('includes the interior of a polygon and excludes the exterior', () => {
    const square = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ] as const;
    expect(pointInPolygon(5, 5, square)).toBe(true);
    expect(pointInPolygon(15, 5, square)).toBe(false);
    expect(pointInPolygon(5, -1, square)).toBe(false);
  });
});

describe('Twin world (Module 31 §5)', () => {
  it('drives both twins from one seed with identical arrivals', () => {
    const twin = world();
    for (let i = 0; i < 600; i++) twin.tick();

    // The lockstep guarantee: same seed, same demands, so the only difference
    // between the twins is the controller.
    expect(twin.simFixed.totalArrivals).toBe(twin.simAdaptive.totalArrivals);
    expect(twin.simFixed.totalExited).toBeGreaterThan(0);
  });

  it('is bit-identical across two independent worlds', () => {
    const a = world(99);
    const b = world(99);
    for (let i = 0; i < 300; i++) {
      a.tick();
      b.tick();
    }
    expect(a.stateHash()).toBe(b.stateHash());
  });

  it('packs a frame at the documented stride and never exceeds the ceiling', () => {
    const twin = world();
    for (let i = 0; i < 300; i++) twin.tick();

    const vehicles = new Float32Array(FRAME_MAX_VEHICLES * VEHICLE_STRIDE);
    const heads = new Uint8Array(LANES.length);
    const header = twin.packFrame('adaptive', vehicles, heads);

    expect(header.n).toBeGreaterThan(0);
    expect(header.n).toBeLessThanOrEqual(FRAME_MAX_VEHICLES);
    expect(header.tSimS).toBeCloseTo(30, 6);

    // Every packed vehicle must have a finite position and a known type index.
    for (let i = 0; i < header.n; i++) {
      const base = i * VEHICLE_STRIDE;
      expect(Number.isFinite(vehicles[base + FRAME_INDEX.X]!)).toBe(true);
      expect(Number.isFinite(vehicles[base + FRAME_INDEX.Y]!)).toBe(true);
      const type = vehicles[base + FRAME_INDEX.TYPE]!;
      expect(type).toBeGreaterThanOrEqual(0);
      expect(type).toBeLessThanOrEqual(4);
    }

    // Heads are always a legal code, even before the first green.
    for (const code of heads) {
      expect([SIGNAL_HEAD.R, SIGNAL_HEAD.Y, SIGNAL_HEAD.G]).toContain(code);
    }
  });

  it('reports the kernel’s own counters rather than UI-maintained ones', () => {
    const twin = world();
    for (let i = 0; i < 600; i++) twin.tick();
    const safety = twin.safety();
    expect(safety.ticks).toBeGreaterThan(0);
    expect(safety.conflicts).toBe(0);
    expect(safety.violationsPrevented).toBeGreaterThanOrEqual(0);
  });
});

describe('Time travel by replay (Module 31 §6)', () => {
  it('restores an exactly equal hash after a scrub back', () => {
    const twin = world(31);

    for (let i = 0; i < 400; i++) twin.tick();
    const checkpointHash = twin.stateHash();
    const checkpointT = twin.tSimS;

    for (let i = 0; i < 200; i++) twin.tick();
    expect(twin.stateHash()).not.toBe(checkpointHash);

    twin.restoreTo(checkpointT);
    expect(twin.tSimS).toBeCloseTo(checkpointT, 9);
    expect(twin.stateHash()).toBe(checkpointHash);
  });

  it('replays operator edits at the tick they were applied', () => {
    const plain = world(5);
    const edited = world(5);

    for (let i = 0; i < 200; i++) {
      plain.tick();
      edited.tick();
    }
    edited.setLaneDemand('NB-TR', 1500);

    for (let i = 0; i < 200; i++) {
      plain.tick();
      edited.tick();
    }
    const editedHash = edited.stateHash();

    // Scrubbing forward again must reproduce the edit, not the unedited run.
    edited.restoreTo(edited.tSimS);
    expect(edited.stateHash()).toBe(editedHash);
    expect(edited.stateHash()).not.toBe(plain.stateHash());
  });

  it('never scrubs past the furthest tick reached', () => {
    const twin = world(3);
    for (let i = 0; i < 50; i++) twin.tick();
    const reached = twin.tSimS;
    twin.restoreTo(600);
    expect(twin.tSimS).toBeCloseTo(reached, 9);
  });
});

describe('Live parameter edits (Module 31 §2.1 setParams)', () => {
  it('renormalises a partial modal split and keeps it summing to one', () => {
    const twin = world();
    twin.setModalSplit({ CAR: 0.5, BIKE: 0.25, BUS: 0.125, TRUCK: 0.125 });
    const split = twin.simAdaptive.config.modalSplit;
    const total = split.CAR + split.BIKE + split.BUS + split.TRUCK;
    expect(total).toBeCloseTo(1, 9);
    expect(twin.simFixed.config.modalSplit.CAR).toBeCloseTo(split.CAR, 12);
  });

  it('applies a lane-demand edit to both twins equally', () => {
    const twin = world();
    twin.setLaneDemand('EB-L', 0);
    expect(twin.simFixed.config.laneDemandVph['EB-L']).toBe(0);
    expect(twin.simAdaptive.config.laneDemandVph['EB-L']).toBe(0);
  });

  it('accepts a preemption whose measured distance affords the lead time', () => {
    const twin = world();
    // The distance is read back from the simulator after the vehicle is spawned,
    // never passed in by the caller, so the plan below is a measured one.
    const result = twin.requestPreemption('NB-TR');
    expect(result.decision).toBe('accepted');
    expect(result.reason).toBeNull();

    const status = twin.evpStatus();
    expect(status).not.toBeNull();
    expect(status?.stage).toBe('PRECLEAR');
    // 300 m at 12.5 m/s is 24 s of ETA against a 19.5 s required lead.
    expect(status?.planStatus).toBe('OK');
    expect(status?.shortfallS).toBe(0);

    // Both twins received the vehicle, so the comparison stays fair.
    expect(twin.simFixed.totalArrivals).toBe(twin.simAdaptive.totalArrivals);
  });

  it('rate-limits a second request from the same source inside ten seconds', () => {
    const twin = world();
    expect(twin.requestPreemption('NB-TR').decision).toBe('accepted');
    // Same operator console, zero simulated seconds later: the second request
    // is refused rather than queued behind the first.
    const second = twin.requestPreemption('SB-TR');
    expect(second.decision).toBe('rejected');
    expect(second.reason).toBe('RATE_LIMITED');
  });
});

describe('Honest clocks (Module 31 §1)', () => {
  it('advances simTimeS by exactly one step per tick', () => {
    const twin = world();
    for (let i = 0; i < 10; i++) twin.tick();
    expect(twin.tSimS).toBeCloseTo(10 * TIMING.SIM_DT_S, 9);
    expect(twin.tickCount).toBe(10);
  });
});

describe('Approve & Apply wiring (Module 04 §3.4 setAdaptiveParams)', () => {
  it('accepts an in-bounds patch on the wire and refuses an out-of-bounds one', () => {
    expect(
      parseCommand({ v: 1, type: 'setAdaptiveParams', params: { G_MIN_EFFICIENT_S: 18, RATIO: 2.4, FLOOR: 6 } }).ok,
    ).toBe(true);
    // Below the schema floor of 12 s: refused, not clamped (Rule 08).
    expect(parseCommand({ v: 1, type: 'setAdaptiveParams', params: { G_MIN_EFFICIENT_S: 5 } }).ok).toBe(false);
    expect(AdaptiveParamsSchema.partial().strict().safeParse({ YELLOW_S: 4 }).success).toBe(false);
  });

  it('accepts the exportDebugBundle command as a bare envelope', () => {
    expect(parseCommand({ v: 1, type: 'exportDebugBundle' }).ok).toBe(true);
    expect(parseCommand({ v: 1, type: 'exportDebugBundles' }).ok).toBe(false);
  });

  it('merges a patch into the adaptive controller and replays it identically', () => {
    const twin = world(17);
    for (let i = 0; i < 120; i++) twin.tick();

    twin.setAdaptiveParams({ G_MIN_EFFICIENT_S: 18, FLOOR: 6 });
    expect(twin.ctrlAdaptive.params.G_MIN_EFFICIENT_S).toBe(18);
    expect(twin.ctrlAdaptive.params.FLOOR).toBe(6);
    // Untouched keys keep their defaults — a partial patch is a merge, not a replace.
    expect(twin.ctrlAdaptive.params.RATIO).toBe(DEFAULT_ADAPTIVE_PARAMS.RATIO);

    for (let i = 0; i < 120; i++) twin.tick();
    const reachedT = twin.tSimS;
    const reachedHash = twin.stateHash();

    // Scrub back and return: the replay must reproduce the approved change,
    // not the pre-approval defaults (Rule: replay the log, never a snapshot).
    twin.restoreTo(12);
    twin.restoreTo(reachedT);
    expect(twin.ctrlAdaptive.params.G_MIN_EFFICIENT_S).toBe(18);
    expect(twin.stateHash()).toBe(reachedHash);
  });

  it('never lets a what-if proposal reach the kernel via the wire', () => {
    const twin = world(11);
    const tampered = twin.verifyProposal({ YELLOW_S: 4 });
    expect(tampered.approved).toBe(false);
    // A rejected proposal was never recorded, so the input log stays empty of it.
    expect(twin.debugBundleData().inputLog.some((e) => e.action === 'setAdaptiveParams')).toBe(false);
  });
});

describe('EVP timeline (T22)', () => {
  it('records the accepted lifecycle in simulated time, oldest first', () => {
    const twin = world(23);
    for (let i = 0; i < 100; i++) twin.tick();
    expect(twin.evpTimeline()).toHaveLength(0);

    twin.requestPreemption('NB-TR');
    for (let i = 0; i < 400; i++) twin.tick(); // 40 s: enough to grant green and reach the line

    const timeline = twin.evpTimeline();
    const actions = timeline.map((e) => e.action);
    expect(actions).toContain('requested');
    expect(actions).toContain('accepted');
    expect(actions).toContain('green_granted');
    expect(timeline.every((e, idx) => idx === 0 || e.tSimS >= timeline[idx - 1]!.tSimS)).toBe(true);
    expect(timeline.every((e) => Number.isFinite(e.tSimS) && e.detail.length > 0)).toBe(true);
  });

  it('is bit-identical across two independently replayed worlds', () => {
    const a = world(29);
    const b = world(29);
    for (const twin of [a, b]) {
      for (let i = 0; i < 60; i++) twin.tick();
      twin.requestPreemption('EB-TR');
      for (let i = 0; i < 300; i++) twin.tick();
    }
    a.restoreTo(a.tSimS);
    expect(a.evpTimeline()).toEqual(b.evpTimeline());
    expect(a.stateHash()).toBe(b.stateHash());
  });

  it('logs a cancel with the simulated time it happened', () => {
    const twin = world(37);
    twin.requestPreemption('SB-TR');
    expect(twin.cancelPreemption()).toBe(true);
    const last: EvpTimelineEntry | undefined = twin.evpTimeline().at(-1);
    expect(last?.action).toBe('cancelled');
    expect(last?.tSimS).toBe(twin.tSimS);
  });
});

describe('Debug bundle data (Module 16 §6 / T23)', () => {
  it('maps the input log to seconds with the full command as payload', () => {
    const twin = world(41);
    for (let i = 0; i < 50; i++) twin.tick();
    twin.setLaneDemand('NB-TR', 900);
    twin.setAdaptiveParams({ GAP_S: 2 });
    const bundle = twin.debugBundleData();

    expect(bundle.seed).toBe(41);
    expect(bundle.scenarioId).toBe('balanced-parity');
    expect(bundle.stateHash).toBe(twin.stateHash());
    expect(bundle.tSimS).toBeCloseTo(50 * TIMING.SIM_DT_S, 9);

    const edits = bundle.inputLog.filter((e) => e.action === 'setLaneDemand' || e.action === 'setAdaptiveParams');
    expect(edits.map((e) => e.action).sort()).toEqual(['setAdaptiveParams', 'setLaneDemand']);
    expect(edits.every((e) => e.t === Math.round(e.t * 10) / 10)).toBe(true); // tick-aligned seconds
    const laneEdit = edits.find((e) => e.action === 'setLaneDemand')!;
    expect((laneEdit.payload as WorkerCommand & { vph?: number }).vph).toBe(900);

    // Every recorded payload must survive re-validation — a bundle that cannot
    // be parsed cannot be replayed by `pnpm repro`.
    expect(bundle.inputLog.every((e) => parseCommand(e.payload).ok)).toBe(true);

    expect(bundle.kernelCounters.ticks).toBe(50);
    expect(bundle.kernelCounters.conflicts).toBe(0);
    expect(bundle.adaptiveParams.GAP_S).toBe(2);
  });

  it('rebuilds an identical world through applyExternalCommand', () => {
    const twin = world(43);
    for (let i = 0; i < 80; i++) twin.tick();
    twin.setLaneDemand('WB-L', 600);
    for (let i = 0; i < 80; i++) twin.tick();
    const bundle = twin.debugBundleData();

    const rebuilt = world(43);
    const byTick = new Map<number, WorkerCommand[]>();
    for (const entry of bundle.inputLog) {
      const parsed = parseCommand(entry.payload);
      if (!parsed.ok) throw new Error('bundle payload failed validation');
      const tick = Math.round(entry.t / TIMING.SIM_DT_S);
      const bucket = byTick.get(tick);
      if (bucket) bucket.push(parsed.command);
      else byTick.set(tick, [parsed.command]);
    }
    for (let tick = 0; tick < twin.tickCount; tick++) {
      for (const command of byTick.get(tick) ?? []) rebuilt.applyExternalCommand(command);
      rebuilt.tick();
    }
    expect(rebuilt.stateHash()).toBe(bundle.stateHash);
  });
});

describe('Kernel observability reaches the worker boundary (Module 16 §4.1)', () => {
  it('forwards the gauges instead of collapsing them into one integer', () => {
    const twin = world();
    for (let i = 0; i < 900; i++) twin.tick(); // 90 simulated seconds: a full cycle

    const safety = twin.safety();
    expect(safety.conflicts).toBe(0);
    expect(safety.ticks).toBe(900);

    // These four existed on `SafetyKernel.getMetrics()` all along and were being
    // dropped at this boundary, so the audit panel could not show them.
    expect(Number.isFinite(safety.minGreenSeenS)).toBe(true);
    expect(safety.minGreenSeenS).toBeGreaterThanOrEqual(TIMING.G_MIN_S);
    expect(safety.maxGreenSeenS).toBeGreaterThanOrEqual(safety.minGreenSeenS);
    expect(safety.yellowCompliancePct).toBe(100);
    expect(safety.allRedCompliancePct).toBe(100);
    expect(typeof safety.violationsPreventedByType).toBe('object');
  });
});
