/**
 * System Explorer content model.
 *
 * Every fact in here is transcribed from the repository itself —
 * `docs/ARCHITECTURE.md`, the package `src` trees, `docs/adr/` and the
 * pipeline README — never invented. The page renders from this data so the
 * diagrams stay maintainable and a demo can deep-link any section by id.
 */

// --- Architecture & data flow -------------------------------------------------

export interface ArchNode {
  id: string;
  layer: 'browser' | 'edge' | 'core' | 'data';
  title: string;
  subtitle: string;
  /** Grid slot in the diagram: column (1-based) and row (1-based). */
  col: number;
  row: number;
  detail: string;
  bullets: readonly string[];
}

export interface ArchEdge {
  from: string;
  to: string;
  label: string;
  kind: 'command' | 'frame' | 'request' | 'stream' | 'advice';
  /** Animated flow packet follows this edge in demo mode. */
  live: boolean;
}

export const ARCH_LAYERS: Readonly<Record<ArchNode['layer'], string>> = {
  browser: 'Browser — packages/web',
  core: 'Deterministic core — packages/core (runs inside the Worker)',
  edge: 'Edge gateway — packages/edge (Cloudflare Worker + Durable Object)',
  data: 'Big-data plane — pipeline/ + db/ (observation, never control)',
};

export const ARCH_NODES: readonly ArchNode[] = [
  {
    id: 'ui',
    layer: 'browser',
    title: 'Operator dashboard',
    subtitle: 'vanilla TS · no framework · WCAG 2.2 AA',
    col: 1,
    row: 1,
    detail:
      'Eleven modules, no framework (ADR-0006). The main thread never advances a tick and never reads a vehicle position out of the engine — it only composes the view model and paints.',
    bullets: [
      'ui/app.ts — view composition and control wiring',
      'state/store.ts — measured values in, operator intent out',
      'Judge tour, KPI grid, EVP panel, copilot panel',
    ],
  },
  {
    id: 'canvas',
    layer: 'browser',
    title: 'Canvas 2D renderer',
    subtitle: 'interpolated frames · transferable pools',
    col: 2,
    row: 1,
    detail:
      'Paints two twin intersections from Float32Array frames (stride 6: x, y, heading, length, type, flags). Interpolation runs at display rate between the last two worker frames; physics stays at the fixed 0.1 s step.',
    bullets: [
      'Four-buffer transfer pool; a frame finding the pool empty is dropped, never queued',
      'Ambulance light bar phased from simulated seconds, not wall clock',
      'prefers-reduced-motion removes the pulse',
    ],
  },
  {
    id: 'worker',
    layer: 'browser',
    title: 'Simulation worker',
    subtitle: 'TwinWorld · the only wall clock',
    col: 3,
    row: 1,
    detail:
      'A dedicated Web Worker runs both twins. performance.now() decides only how many ticks run — no simulated quantity is derived from wall time, so a slow machine renders fewer frames of the same simulation.',
    bullets: [
      'Commands zod-validated on arrival against core/worker/protocol.ts',
      'Heartbeat: 2 s without a frame restarts the worker and replays the input log',
      'Every operator edit is logged; restoreTo(t) rebuilds the run bit-exactly',
    ],
  },
  {
    id: 'engine',
    layer: 'core',
    title: 'Sim engine + lanes',
    subtitle: 'IDM car-following · SoA typed arrays',
    col: 1,
    row: 2,
    detail:
      'Bit-deterministic microscopic simulation. Demand generation, IDM car-following, incident obstacles, EMS handling and exit accounting over struct-of-arrays lanes.',
    bullets: [
      'Fixed step 0.1 s; seeded per-lane RNG streams (ADR-0014)',
      'Emergency vehicles: preemption-aware despawn at the stop line, sustained far-end stalls released after a grace period',
      'Conservation law closes: arrivals = exited + in-system + denied',
    ],
  },
  {
    id: 'kernel',
    layer: 'core',
    title: 'Safety kernel',
    subtitle: 'the only writer of SignalState',
    col: 2,
    row: 2,
    detail:
      'The boundary between "a proposal" and "a signal". Enforces invariants I1–I6, owns the phase machine, and refuses — recording why — anything unsafe. A controller cannot express an unsafe action.',
    bullets: [
      'Adaptive and fixed-time controllers are interchangeable proposals',
      'EVP directives pass through the same gate: yellow/all-red are untouchable',
      'failSafe() → FLASH_RED; recovery must pass through ALL_RED',
    ],
  },
  {
    id: 'evp',
    layer: 'core',
    title: 'EVP manager',
    subtitle: 'IDLE → PRECLEAR → EMS_GREEN → RECOVERY',
    col: 3,
    row: 2,
    detail:
      'Validates emergency-preemption requests (idempotency, storm guard, nonce replay, rate limit, plausibility), then runs the four-stage lifecycle against live simulator observations.',
    bullets: [
      'ETA recomputed every tick from the vehicle’s actual position',
      'TIGHT plans are accepted with a recorded shortfall, never by shortening clearance',
      'Full lifecycle logged in simulated time for the judge panel',
    ],
  },
  {
    id: 'edgegw',
    layer: 'edge',
    title: 'Edge gateway',
    subtitle: 'router · HMAC · budget guard',
    col: 1,
    row: 3,
    detail:
      'Cloudflare Worker. Deliberate request order: method → origin → size → content-type → schema → HMAC → nonce → rate limit → plausibility → handler. Uniform error envelope, request-id propagation.',
    bullets: [
      'HMAC-signed EVP requests with daily-salted IP hashing',
      'Durable Object: atomic nonce store, rate windows, replay log, usage ledger',
      'The simulation keeps running correctly if the edge is unavailable',
    ],
  },
  {
    id: 'copilot',
    layer: 'edge',
    title: 'Copilot chain',
    subtitle: 'Muse Spark → Llama → template',
    col: 2,
    row: 3,
    detail:
      'Advisory-only LLM providers behind a fallback chain with cache, circuit breaker and per-source budgets. It has no route that writes a signal state.',
    bullets: [
      'Structured outputs validated with zod at the boundary',
      'Numbers in a diagnosis are checked against the input window; an ungrounded number falls back to the template provider',
      'The template rung is deterministic, refuses unsafe asks, never echoes input',
    ],
  },
  {
    id: 'pipeline',
    layer: 'data',
    title: 'Streaming pipeline',
    subtitle: 'Kafka (KRaft) → PySpark → Parquet',
    col: 1,
    row: 4,
    detail:
      'Structured Streaming job ingests run events, validates them, computes windowed lane-health aggregates and anomaly roll-ups, and writes a Parquet lake. A TypeScript "lite" path produces the same schema without a JVM.',
    bullets: [
      'pipeline/spark/urbanflow_stream.py — the full path',
      'pipeline/lite/urbanflow_lite.ts — node-only demo fallback',
      'SQL views: windowed lane health, anomalies summary',
    ],
  },
  {
    id: 'db',
    layer: 'data',
    title: 'Serving store',
    subtitle: 'MongoDB · shared db package',
    col: 2,
    row: 4,
    detail:
      'The shared @urbanflow/db package (ADR-0021) owns the MongoDB driver and the run/analytics repositories: saved runs, aggregate results and the serving side of the public API.',
    bullets: [
      'saveRun upsert with seeded reports; results read back for the dashboard',
      'Only core and db are shared packages; nothing depends on web',
    ],
  },
  {
    id: 'bench',
    layer: 'data',
    title: 'Bench & evals',
    subtitle: 'paired seeds · bootstrap CI',
    col: 3,
    row: 4,
    detail:
      'packages/bench runs the adaptive-vs-fixed comparison and the EMS detection-distance sweep; evals/ replays recorded LLM responses against a quality floor. Determinism is what makes paired seeds meaningful.',
    bullets: [
      'evp_sweep.ts — detection distance 150/300/500 m, unobserved exits excluded honestly',
      'evals/harness.mjs — replay scoring with a floor gate',
    ],
  },
];

export const ARCH_EDGES: readonly ArchEdge[] = [
  { from: 'ui', to: 'worker', label: 'commands (zod-validated)', kind: 'command', live: true },
  { from: 'worker', to: 'canvas', label: 'frames (transferable)', kind: 'frame', live: true },
  { from: 'ui', to: 'edgegw', label: 'fetch JSON', kind: 'request', live: false },
  { from: 'edgegw', to: 'copilot', label: 'provider chain', kind: 'advice', live: false },
  { from: 'worker', to: 'pipeline', label: 'run events', kind: 'stream', live: true },
  { from: 'pipeline', to: 'db', label: 'Parquet → serving', kind: 'stream', live: true },
  { from: 'db', to: 'edgegw', label: 'analytics API', kind: 'request', live: false },
  { from: 'engine', to: 'kernel', label: 'Observation → proposal', kind: 'command', live: false },
  { from: 'evp', to: 'kernel', label: 'directive', kind: 'command', live: false },
];

// --- Project structure ---------------------------------------------------------

export interface TreeNode {
  name: string;
  desc: string;
  children?: readonly TreeNode[];
}

export const PROJECT_TREE: readonly TreeNode[] = [
  {
    name: 'packages/',
    desc: 'pnpm workspaces (ADR-0017): one verify command, one lockfile.',
    children: [
      {
        name: 'core/',
        desc: 'Pure, deterministic engine. Depends on nothing but zod; never touches a clock or the DOM.',
        children: [
          { name: 'src/contracts.ts', desc: 'Single source of truth: every wire type, zod-inferred.' },
          { name: 'src/sim/', desc: 'engine.ts (IDM physics, events) · lane.ts (struct-of-arrays) · geometry.' },
          { name: 'src/control/', desc: 'kernel (single writer) · adaptive + fixed · pressure · EVP · watchdog · what-if · NTCIP.' },
          { name: 'src/worker/', desc: 'TwinWorld, frame packing, zod command protocol, input-log replay.' },
          { name: 'src/metrics/', desc: 'avgDelay, personDelay, throughput, LOS bands, fuel and CO₂.' },
          { name: 'src/vision/', desc: 'Camera-mode geometry helpers for the SAM mask overlay.' },
          { name: 'src/helpers/', desc: 'rng · hash · hmac · canonical-json · stats · sim-clock.' },
        ],
      },
      {
        name: 'web/',
        desc: 'Operator dashboard: vanilla TS, Canvas 2D, simulation in a Worker.',
        children: [
          { name: 'src/ui/', desc: 'app composition · dom helper (no innerHTML) · judge tour · icons.' },
          { name: 'src/render/', desc: 'canvas renderer + palette read from CSS tokens.' },
          { name: 'src/worker/', desc: 'sim.worker.ts IO shell · client with heartbeat and restart.' },
          { name: 'src/state/', desc: 'store view model · storage · console tail.' },
          { name: 'src/styles/', desc: 'tokens · base · components — control-room design system.' },
        ],
      },
      {
        name: 'edge/',
        desc: 'Cloudflare Worker: router, HMAC security, budget guard, Durable Object room, copilot providers.',
      },
      {
        name: 'bench/',
        desc: 'Adaptive-vs-fixed benchmark and the EMS detection-distance sweep.',
      },
    ],
  },
  {
    name: 'db/',
    desc: 'Shared persistence package (ADR-0021): MongoDB client, repositories, run store.',
  },
  {
    name: 'pipeline/',
    desc: 'Big-data plane.',
    children: [
      { name: 'spark/', desc: 'urbanflow_stream.py — Structured Streaming → Parquet lake.' },
      { name: 'lite/', desc: 'urbanflow_lite.ts — same aggregates, node only, no JVM.' },
      { name: 'sql/', desc: 'Windowed lane health · anomalies summary.' },
      { name: 'docker/', desc: 'Kafka KRaft image, Spark connector jars (ADR-0009).' },
    ],
  },
  {
    name: 'evals/',
    desc: 'LLM quality floor: recorded responses replayed against fixtures; live rung optional.',
  },
  {
    name: 'docs/',
    desc: 'Architecture, ADRs (20 recorded), API, safety case, runbooks, test report, limitations.',
  },
  {
    name: 'scripts/',
    desc: 'fitness.mjs (dependency graph + budgets) · docs-check · gen-api-schemas · run-regression.',
  },
  {
    name: 'instruction/',
    desc: 'The specification set every module is implemented against (platform specs, standards, audits).',
  },
];

// --- Components and relationships ----------------------------------------------

export interface ComponentCard {
  id: string;
  pkg: 'core' | 'web' | 'edge' | 'pipeline' | 'db' | 'bench';
  title: string;
  role: string;
  dependsOn: readonly string[];
  usedBy: readonly string[];
}

export const COMPONENTS: readonly ComponentCard[] = [
  {
    id: 'contracts',
    pkg: 'core',
    title: 'contracts',
    role: 'Single source of truth for every type on every wire: SignalState, Observation, EvpRequest, DomainEvent, SimConfig.',
    dependsOn: ['zod'],
    usedBy: ['engine', 'kernel', 'evp', 'twin', 'protocol', 'edge', 'web', 'db', 'bench'],
  },
  {
    id: 'engine',
    pkg: 'core',
    title: 'sim/engine + lane',
    role: 'Bit-deterministic microscopic simulation: arrivals, IDM car-following, incidents, EMS lifecycle, exit accounting, domain events.',
    dependsOn: ['contracts', 'lane', 'rng', 'hash'],
    usedBy: ['twin', 'what-if', 'bench'],
  },
  {
    id: 'kernel',
    pkg: 'core',
    title: 'control/kernel',
    role: 'The only writer of SignalState. Phase machine plus invariants I1–I6; refuses unsafe proposals and records why.',
    dependsOn: ['contracts'],
    usedBy: ['twin', 'evp', 'what-if', 'bench'],
  },
  {
    id: 'adaptive',
    pkg: 'core',
    title: 'control/adaptive + fixed + pressure',
    role: 'Phase selection from lane pressure with a switching-cost guard (ADR-0005); fixed-time cycler is the benchmark baseline and a real fallback.',
    dependsOn: ['contracts', 'kernel'],
    usedBy: ['twin', 'bench'],
  },
  {
    id: 'evp',
    pkg: 'core',
    title: 'control/evp',
    role: 'Emergency-vehicle preemption: request validation (idempotency, storm guard, nonce, rate limit, plausibility) and the PRECLEAR → EMS_GREEN → RECOVERY machine.',
    dependsOn: ['contracts', 'kernel'],
    usedBy: ['twin', 'edge'],
  },
  {
    id: 'metrics',
    pkg: 'core',
    title: 'metrics',
    role: 'Delay, person-delay, throughput, max queue, LOS bands, fuel burn and CO₂ — from drained domain events only.',
    dependsOn: ['contracts'],
    usedBy: ['twin', 'web', 'bench'],
  },
  {
    id: 'twin',
    pkg: 'core',
    title: 'worker/twin (TwinWorld)',
    role: 'Two engines on identical arrivals, one controller each; records every command, replays the input log on scrub, hashes state.',
    dependsOn: ['engine', 'kernel', 'adaptive', 'evp', 'metrics', 'protocol'],
    usedBy: ['sim.worker', 'bench'],
  },
  {
    id: 'protocol',
    pkg: 'core',
    title: 'worker/protocol',
    role: 'The thread boundary: zod-validated commands in, transferred Float32Array frames out, plus the EVP timeline wire type.',
    dependsOn: ['contracts'],
    usedBy: ['sim.worker', 'client', 'edge'],
  },
  {
    id: 'sim.worker',
    pkg: 'web',
    title: 'web/worker/sim.worker',
    role: 'IO shell — the only place a wall clock is read; turns elapsed time into a whole number of ticks, capped per frame.',
    dependsOn: ['twin', 'protocol'],
    usedBy: ['client'],
  },
  {
    id: 'client',
    pkg: 'web',
    title: 'web/worker/client',
    role: 'Main-thread side of the protocol: spawn, transfer, recycle, heartbeat, restart-and-replay.',
    dependsOn: ['protocol'],
    usedBy: ['store'],
  },
  {
    id: 'store',
    pkg: 'web',
    title: 'web/state/store',
    role: 'View model: measured values in, operator intent out. Owns no engine; the UI cannot advance a tick.',
    dependsOn: ['client', 'metrics'],
    usedBy: ['app', 'canvas'],
  },
  {
    id: 'canvas',
    pkg: 'web',
    title: 'web/render/canvas',
    role: 'Canvas 2D twin renderer: interpolates two frames, paints in world metres, design tokens only.',
    dependsOn: ['store', 'palette'],
    usedBy: ['app'],
  },
  {
    id: 'app',
    pkg: 'web',
    title: 'web/ui/app',
    role: 'View composition and control wiring: header, KPI grid, lane table, interaction lab, EVP panel, copilot panel, judge tour.',
    dependsOn: ['store', 'canvas'],
    usedBy: [],
  },
  {
    id: 'edge',
    pkg: 'edge',
    title: 'edge gateway',
    role: 'Route table, origin gate, HMAC verification, budget guard, Durable-Object nonce/rate/replay state, uniform error envelope.',
    dependsOn: ['contracts', 'protocol', 'db'],
    usedBy: ['copilot', 'web'],
  },
  {
    id: 'copilot',
    pkg: 'edge',
    title: 'copilot providers',
    role: 'Muse Spark → Llama → deterministic template, with cache, circuit breaker and semantic-number verification. Advisory-only: no route writes a signal.',
    dependsOn: ['edge'],
    usedBy: ['web'],
  },
  {
    id: 'pipeline',
    pkg: 'pipeline',
    title: 'spark / lite pipeline',
    role: 'Kafka ingest → validation → windowed aggregates → Parquet lake; the lite path repeats it in TypeScript with no JVM.',
    dependsOn: ['contracts'],
    usedBy: ['db'],
  },
  {
    id: 'db',
    pkg: 'db',
    title: 'shared db package',
    role: 'MongoDB client and repositories (ADR-0021): saved runs, aggregate results, serving side of the analytics API.',
    dependsOn: ['contracts'],
    usedBy: ['edge'],
  },
  {
    id: 'bench',
    pkg: 'bench',
    title: 'bench',
    role: 'Paired-seed adaptive-vs-fixed benchmark with bootstrap CIs, and the EMS detection-distance sweep.',
    dependsOn: ['engine', 'kernel', 'adaptive', 'evp', 'metrics'],
    usedBy: [],
  },
];

// --- Workflows ------------------------------------------------------------------

export interface WorkflowStep {
  title: string;
  text: string;
}

export interface Workflow {
  id: string;
  title: string;
  summary: string;
  steps: readonly WorkflowStep[];
}

export const WORKFLOWS: readonly Workflow[] = [
  {
    id: 'tick',
    title: 'The 10 Hz control loop',
    summary:
      'One simulated tick, start to finish. Everything the operator sees is downstream of this loop and nothing reads a wall clock inside the core.',
    steps: [
      { title: 'Observe', text: 'TwinWorld builds an Observation: per-lane queue length, weighted wait, occupancy, nearest EMS distance — read from struct-of-arrays lanes.' },
      { title: 'Decide', text: 'The adaptive controller scores lane pressure and proposes a phase action; the fixed-time cycler proposes its timetable. Both are only proposals.' },
      { title: 'Preempt?', text: 'If an ambulance is bound to an EVP plan, the manager adds a directive (PRECLEAR / EMS_GREEN) alongside the controller action.' },
      { title: 'Kernel gate', text: 'SafetyKernel.step is the single writer: it validates the merged proposal against invariants I1–I6, then emits the only SignalState that exists. Refusals are counted, never skipped.' },
      { title: 'Physics', text: 'SimEngine.step advances IDM car-following for every vehicle, handles arrivals, incidents, the emergency-vehicle lifecycle and exit accounting, and queues domain events.' },
      { title: 'Frame out', text: 'packFrame writes one Float32Array (stride 6) plus signal heads; the buffer is transferred to the main thread, rendered at display rate, transferred back and reused.' },
    ],
  },
  {
    id: 'evp',
    title: 'Emergency preemption, end to end',
    summary:
      'From the operator pressing the ambulance button to normal control resuming — with the safety guarantees that make it demo-able.',
    steps: [
      { title: 'Inject', text: 'spawnEms writes the ambulance into the lane at its real detection distance doing 54 km/h — the distance the controller is asked to rescue is the distance the vehicle actually has.' },
      { title: 'Validate', text: 'The EVP manager checks idempotency, storm guard, nonce replay, per-source rate limit and physical plausibility before any plan exists.' },
      { title: 'Plan', text: 'ETA versus required lead time (clearance + preclear + queue flush). A TIGHT plan is accepted with the shortfall recorded — yellow and all-red are never shortened.' },
      { title: 'PRECLEAR', text: 'The kernel is asked to switch to the ambulance phase through the ordinary yellow → all-red clearance. No special-casing of the safety machine.' },
      { title: 'EMS_GREEN', text: 'Green dwell holds while the vehicle approaches; the live ETA is recomputed from the simulator every tick, and cross-street traffic is stopped.' },
      { title: 'Cleared', text: 'The ambulance despawns at the stop line — it has cleared the controlled point, so it never sits in the intersection. boxExited fires with the measured transit delay.' },
      { title: 'Recovery', text: 'RECOVERY returns through all-red to normal control; a sustained stall at the entry end releases the vehicle after a grace period so nothing blocks the panel.' },
    ],
  },
  {
    id: 'twins',
    title: 'Twins, replay and share links',
    summary:
      'Why the comparison is honest: identical arrivals, one difference, and a time machine that rebuilds the past bit-exactly.',
    steps: [
      { title: 'One seed', text: 'splitRng gives every lane and concern its own stream (ADR-0014): adding a lane cannot shift another lane’s arrivals, so both twins face identical traffic.' },
      { title: 'Two engines', text: 'Fixed-time on the left, adaptive on the right. The only difference between the columns is the controller — which is what makes the KPI delta meaningful.' },
      { title: 'Input log', text: 'Every operator edit is recorded with its simulated tick: demand changes, injections, preemptions. The log is the run’s DNA.' },
      { title: 'Scrub', text: 'restoreTo(t) rebuilds both engines from scratch and replays the log to tick t — scrubbing forward afterwards is exact, because the log defines what can be reproduced.' },
      { title: 'Verify', text: 'FNV-1a state hashes over canonical byte layouts prove two runs identical; the same seed on another machine produces the same numbers.' },
      { title: 'Share', text: 'Scenario, seed and edits encode into the URL hash (ADR-0019): a judge opens the link and gets the exact run, frame for frame.' },
    ],
  },
  {
    id: 'data',
    title: 'From events to answers',
    summary:
      'The big-data plane: it observes the simulation and answers questions about it — it never drives a signal.',
    steps: [
      { title: 'Emit', text: 'Domain events (exits, delays, EMS milestones, incidents) leave the engine as typed, versioned JSON.' },
      { title: 'Ingest', text: 'Kafka in KRaft mode buffers the stream (ADR-0009); the Spark job validates each record against the shared schema before anything is trusted.' },
      { title: 'Aggregate', text: 'Structured Streaming computes windowed per-lane health and anomaly roll-ups; the same aggregates exist as a TypeScript lite path for machines without a JVM.' },
      { title: 'Lake', text: 'Results land in Parquet (ADR-0008) — columnar, partitionable, and readable by both Spark and the serving layer.' },
      { title: 'Serve', text: 'The shared db package upserts runs and results into MongoDB; the edge gateway exposes them through the same zod-typed API the dashboard consumes.' },
      { title: 'Explain', text: 'The copilot answers questions over that evidence; numbers in its answers are checked against the input window before anything is shown.' },
    ],
  },
];
