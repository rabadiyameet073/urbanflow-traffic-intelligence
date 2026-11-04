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
  layer: 'browser' | 'core' | 'edge' | 'data';
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
  browser: 'Browser Layer — packages/web (Zero Main-Thread Blocking)',
  core: 'Deterministic Core — packages/core (Runs Inside Worker)',
  edge: 'Edge Gateway — packages/edge (Cloudflare Worker + Durable Object)',
  data: 'Big-Data Plane — pipeline/ + db/ (Time-Series Parquet Lake + MongoDB)',
};

export const ARCH_NODES: readonly ArchNode[] = [
  {
    id: 'ui',
    layer: 'browser',
    title: 'Operator Dashboard',
    subtitle: 'vanilla TS · no framework · WCAG 2.2 AA',
    col: 1,
    row: 1,
    detail:
      'Eleven lightweight UI modules built in vanilla TypeScript with zero framework overhead (ADR-0006). The main thread never advances simulation ticks and never reads raw physics memory directly — it strictly composes the view model and renders.',
    bullets: [
      'ui/app.ts — reactive view composition and control wiring',
      'state/store.ts — measured values in, operator intent out',
      'Automated 90s judge tour, KPI grid, emergency preemption panel, copilot chat',
      'No innerHTML anywhere — all DOM mutations run through safe type-safe builders',
    ],
  },
  {
    id: 'worker',
    layer: 'browser',
    title: 'Simulation Worker',
    subtitle: 'TwinWorld · transferable buffers · only clock',
    col: 2,
    row: 1,
    detail:
      'A dedicated Web Worker runs both digital twins (simFixed and simAdaptive) in background threads. performance.now() determines only how many fixed 0.1s ticks elapse — no physics quantity is ever derived from wall-clock time, ensuring reproducible physics across any device.',
    bullets: [
      'Inbound commands zod-validated against core/worker/protocol.ts',
      'Transferable memory pool: zero-copy Float32Array frames handed to main thread',
      'Heartbeat monitor: 2 s without a frame restarts worker and replays input log',
      'Scrubbing & Time-travel: restoreTo(t) reconstructs any previous frame bit-exactly',
    ],
  },
  {
    id: 'canvas',
    layer: 'browser',
    title: 'Canvas 2D Renderer',
    subtitle: '14m highway asphalt · dynamic interpolation',
    col: 3,
    row: 1,
    detail:
      'High-performance 2D canvas renderer displaying twin intersections side-by-side. Uses 14m dark asphalt pavement with double amber centrelines, dashed white lane dividers, corner kerbs, and stop lines. Interpolates vehicle positions smoothly between worker frames at display refresh rate.',
    bullets: [
      'Four-buffer transferable pool; if pool is temporarily empty, frame is dropped rather than queueing',
      'Emergency flashing beacons & headlights phased deterministically from sim seconds',
      'All 8 approach lanes (through and left-turn) fully contained on road asphalt',
      'Full prefers-reduced-motion support disables flashing and sudden transitions',
    ],
  },
  {
    id: 'engine',
    layer: 'core',
    title: 'Sim Engine & Lanes',
    subtitle: 'IDM physics · Struct-of-Arrays · PRNG streams',
    col: 1,
    row: 2,
    detail:
      'Bit-deterministic microscopic traffic simulation. Implements Intelligent Driver Model (IDM) car-following, per-lane independent PRNG streams (ADR-0014), incident obstacle modeling, emergency vehicle kinematics, and strict vehicle conservation accounting.',
    bullets: [
      'Fixed 0.1s dt step; splitRng(seed, "arrivals:${lane}") prevents cross-lane RNG contamination',
      'Struct-of-Arrays typed arrays (pos, vel, wait, stops, flags) for cache locality',
      'Full intersection traversal: ambulances cruise across the entire box to -boxDistance exit',
      'Conservation invariant: totalArrivals = totalExited + inSystem + totalDenied holds strictly',
    ],
  },
  {
    id: 'kernel',
    layer: 'core',
    title: 'Single-Writer Safety Kernel',
    subtitle: 'invariants I1–I6 · the only writer of signals',
    col: 2,
    row: 2,
    detail:
      'The deterministic boundary between "an algorithm proposal" and "an authoritative signal state". Enforces safety invariants I1–I6 on every single tick. Neither AI models, adaptive algorithms, nor emergency preemption can ever write signal states directly.',
    bullets: [
      'Minimum Green Invariant (I1): clamps green to >= 7.0s (TIMING.G_MIN_S)',
      'Mandatory Yellow (3.5s) and All-Red (2.0s) clearance buffers strictly enforced',
      'Anti-starvation clamp: yields green to any approach waiting >= 120s',
      'assertInvariants(nextState): mathematical proof that conflicting phases never turn green',
      'Fail-safe fallback: watchdog isolation commands FLASH_RED; recovery forces ALL_RED',
    ],
  },
  {
    id: 'evp',
    layer: 'core',
    title: 'EVP Manager',
    subtitle: 'IDLE → PRECLEAR → EMS_GREEN → RECOVERY',
    col: 3,
    row: 2,
    detail:
      'Emergency Vehicle Preemption coordination engine. Validates incoming V2X radio requests with single-use nonce stores, 10s storm guard rate limiters, and physical plausibility bounds. Coordinates the 4-stage preemption lifecycle through the safety kernel.',
    bullets: [
      'ETA recalculated each tick from actual physical vehicle distance in the simulator',
      'Storm Guard Flooding Defense: >20 requests in 10s triggers 30s automatic lockout',
      'Single-use seenNonces set immediately drops replayed radio beacons',
      'Shoulder filtering: ambulance cruises at 15 m/s while vehicles ahead yield and flush',
    ],
  },
  {
    id: 'edgegw',
    layer: 'edge',
    title: 'Edge Gateway & Security',
    subtitle: 'HMAC-SHA256 · Cloudflare Worker · Durable Object',
    col: 1,
    row: 3,
    detail:
      'Edge Gateway running on Cloudflare Workers. Enforces strict zero-trust request processing: Method → Origin → Payload Size → Content-Type → Zod Schema → HMAC-SHA256 Signature → Nonce Store → Timestamp Skew Window → Handler.',
    bullets: [
      'Constant-time HMAC-SHA256 verification (crypto.subtle.verify) eliminates side channels',
      'Timestamp skew window: rejects any packet older or newer than 30 seconds',
      'Durable Object Room: distributed atomic state synchronization across multi-operator dashboards',
      'Uniform error envelope and distributed trace request-id propagation',
    ],
  },
  {
    id: 'copilot',
    layer: 'edge',
    title: 'Meta AI Copilot & Provenance',
    subtitle: 'Llama · Muse Spark · Provenance Verification Gate',
    col: 2,
    row: 3,
    detail:
      'Meta AI traffic intelligence copilot. Executes a resilient provider fallback ladder: Muse Spark → Meta Llama → Deterministic Template. Equipped with a strict Provenance Verification Gate (verifySemanticNumbers) that checks every number quoted by the LLM against the physics engine.',
    bullets: [
      'Four distinct Muse prompt surfaces: diagnose, explain, chat, and advisory reports',
      'Provenance Gate: ungrounded or hallucinated metrics instantly fall back to verified template',
      'Circuit breaker opens after 3 consecutive failures to safeguard edge compute budgets',
      'Advisory only: structurally impossible for AI copilot to write to traffic signal states',
    ],
  },
  {
    id: 'bench',
    layer: 'edge',
    title: 'Bench & Evaluation Engine',
    subtitle: 'paired seeds · bootstrap CIs · 150/300/500m sweeps',
    col: 3,
    row: 3,
    detail:
      'Statistical validation harness comparing adaptive control against the fixed-time baseline across identical pseudo-random arrival seeds. Computes 95% bootstrap confidence intervals across delay, person-delay, throughput, and emissions.',
    bullets: [
      'Paired-seed runs eliminate stochastic noise; identical vehicles face both algorithms',
      'Emergency detection distance sweep across 150m, 300m, and 500m detection horizons',
      'Excludes unobserved vehicles honestly at the end of runs to prevent boundary bias',
      'Replay scoring harness enforces strict quality floor before deployment',
    ],
  },
  {
    id: 'pipeline',
    layer: 'data',
    title: 'Streaming Pipeline',
    subtitle: 'Kafka KRaft → PySpark / TS Lite → Parquet Lake',
    col: 1,
    row: 4,
    detail:
      'High-throughput streaming telemetry pipeline. Ingests simulator domain events, validates schemas, computes 10-second rolling window aggregations, tracks online EWMA variance, and partitions data into an immutable Parquet lake.',
    bullets: [
      'pipeline/spark/urbanflow_stream.py — Apache Spark Structured Streaming production path',
      'pipeline/lite/urbanflow_lite.ts — Zero-dependency TypeScript streaming fallback for local demo',
      'Rolling 10s windows compute per-lane saturation, speed variance, and anomaly scores',
      'Partitioned columnar Parquet format enables rapid time-series analytical queries',
    ],
  },
  {
    id: 'db',
    layer: 'data',
    title: 'MongoDB Operational Store',
    subtitle: 'shared db · collections: runs, replays, audits, incidents',
    col: 2,
    row: 4,
    detail:
      'Shared persistence layer powered by MongoDB and the shared @urbanflow/db package (ADR-0021). Stores preemption audit logs, verified run telemetry, incident histories, and compressed replay buffers for post-incident playback.',
    bullets: [
      'Four auto-provisioned collections: incident_logs, audit_events, replays, and runs',
      'Compound indexing on { ts: -1 }, { seed: 1 }, and TTL expiration for ephemeral data',
      'Average read/write latency < 2.0 ms ensures zero lag on dashboard queries',
      'Immutable audit trail recording every HMAC-verified emergency vehicle preemption',
    ],
  },
];

export const ARCH_EDGES: readonly ArchEdge[] = [
  { from: 'ui', to: 'worker', label: 'commands (zod-validated)', kind: 'command', live: true },
  { from: 'worker', to: 'engine', label: '10 Hz tick & seed', kind: 'command', live: true },
  { from: 'engine', to: 'kernel', label: 'observation & proposal', kind: 'command', live: true },
  { from: 'evp', to: 'kernel', label: 'preemption directive', kind: 'command', live: true },
  { from: 'kernel', to: 'engine', label: 'SignalState (I1-I6)', kind: 'command', live: true },
  { from: 'worker', to: 'canvas', label: 'transferable Float32Array', kind: 'frame', live: true },
  { from: 'canvas', to: 'ui', label: '60 FPS display paint', kind: 'frame', live: false },
  { from: 'ui', to: 'edgegw', label: 'HMAC-signed V2X', kind: 'request', live: true },
  { from: 'edgegw', to: 'evp', label: 'verified emergency req', kind: 'command', live: true },
  { from: 'edgegw', to: 'copilot', label: 'grounded diagnosis', kind: 'advice', live: true },
  { from: 'copilot', to: 'ui', label: 'provenance-verified report', kind: 'advice', live: false },
  { from: 'worker', to: 'pipeline', label: 'domain events stream', kind: 'stream', live: true },
  { from: 'pipeline', to: 'db', label: 'windowed Parquet & Mongo', kind: 'stream', live: true },
  { from: 'db', to: 'edgegw', label: 'analytics & replays API', kind: 'request', live: false },
  { from: 'engine', to: 'bench', label: 'paired seeds test', kind: 'command', live: false },
];

// --- Flow Presets for Interactive Trace Simulator ----------------------------

export interface FlowStep {
  step: number;
  title: string;
  from: string;
  to: string;
  protocol: string;
  detail: string;
}

export interface FlowPreset {
  id: string;
  title: string;
  shortLabel: string;
  description: string;
  nodeIds: readonly string[];
  steps: readonly FlowStep[];
}

export const FLOW_PRESETS: readonly FlowPreset[] = [
  {
    id: 'full',
    title: 'Complete End-to-End System Flow',
    shortLabel: 'Full System Flow',
    description:
      'Complete end-to-end data lifecycle: from operator interactions on the UI main thread through worker isolation, single-writer safety gating, edge cryptographic verification, Meta AI explanation, and big-data lake persistence.',
    nodeIds: ['ui', 'worker', 'canvas', 'engine', 'kernel', 'evp', 'edgegw', 'copilot', 'pipeline', 'db'],
    steps: [
      {
        step: 1,
        title: 'Operator Intent & Command Validation',
        from: 'ui',
        to: 'worker',
        protocol: 'Worker Protocol (postMessage)',
        detail:
          'Operator interactions (demand edits, manual phase triggers, ambulance injection) are validated against Zod schemas on the UI thread and posted to the dedicated Web Worker thread without blocking the browser.',
      },
      {
        step: 2,
        title: 'Observation & Max-Pressure Proposal',
        from: 'worker',
        to: 'engine',
        protocol: 'In-Memory SoA Structs',
        detail:
          'TwinWorld steps SimEngine by 0.1s. Engine scans Struct-of-Arrays lanes (queue depth, delay, occupancy) and computes max-pressure phase selection proposals for both fixed and adaptive controllers in parallel.',
      },
      {
        step: 3,
        title: 'Single-Writer Safety Kernel Gating',
        from: 'engine',
        to: 'kernel',
        protocol: 'Kernel Invariant Check (I1–I6)',
        detail:
          'SafetyKernel strictly inspects the proposal. Enforces Minimum Green (>=7.0s), Mandatory Yellow Clearance (3.5s), and All-Red Clearance (2.0s). Conflicting phases are mathematically barred from receiving simultaneous green lights.',
      },
      {
        step: 4,
        title: 'IDM Ballistic Update & Frame Packing',
        from: 'kernel',
        to: 'worker',
        protocol: 'Ballistic Euler & Ring Buffers',
        detail:
          'Engine updates vehicle velocity and position via Intelligent Driver Model. Exited vehicles are recorded in arrival/discharge rings. TwinWorld packs vehicle coordinates into pre-allocated Float32Array buffers.',
      },
      {
        step: 5,
        title: 'Zero-Copy Frame Transfer & Canvas Rendering',
        from: 'worker',
        to: 'canvas',
        protocol: 'Transferable ArrayBuffer',
        detail:
          'Float32Array buffers are transferred with zero copy overhead to the main thread. Canvas 2D Twin Renderer interpolates coordinates at 60 FPS on 14m dark asphalt with highway road markings.',
      },
      {
        step: 6,
        title: 'V2X Ingress & Cryptographic Authentication',
        from: 'ui',
        to: 'edgegw',
        protocol: 'HMAC-SHA256 / HTTPS',
        detail:
          'Emergency vehicle preemption requests arrive at Cloudflare Worker edge. Gateway verifies HMAC-SHA256 in constant time, checks ±30s timestamp skew window, and validates against the Durable Object single-use nonce store.',
      },
      {
        step: 7,
        title: 'Meta AI Explanation & Provenance Verification',
        from: 'edgegw',
        to: 'copilot',
        protocol: 'Meta Llama / Muse Spark API',
        detail:
          'Edge Gateway queries Meta Llama / Muse Spark with structured traffic observations. Provenance Gate (verifySemanticNumbers) checks all quoted numbers against the engine to guarantee hallucination-free advice.',
      },
      {
        step: 8,
        title: 'Streaming Telemetry Ingest & Lake Storage',
        from: 'worker',
        to: 'pipeline',
        protocol: 'Kafka KRaft / Parquet / MongoDB',
        detail:
          'Domain events drain from the engine to Kafka KRaft. Streaming window processor calculates 10s rolling averages and EWMA variance. Data commits to columnar Parquet files and MongoDB collections (latency < 2ms).',
      },
    ],
  },
  {
    id: 'sim',
    title: '10 Hz Simulation & Render Loop',
    shortLabel: '10 Hz Sim Loop',
    description:
      'High-frequency background simulation and rendering cycle: maintains 60 FPS UI responsiveness while running bit-deterministic microscopic physics decoupled in a Web Worker.',
    nodeIds: ['worker', 'engine', 'kernel', 'canvas', 'ui'],
    steps: [
      {
        step: 1,
        title: 'Accumulate Elapsed Time & Advance Tick',
        from: 'worker',
        to: 'engine',
        protocol: 'SimEngine.step(dt = 0.1s)',
        detail:
          'Worker tracks performance.now() to compute elapsed wall time. Steps the engine by whole 0.1s intervals. Slower devices run fewer visual frames without altering simulation speed or physics accuracy.',
      },
      {
        step: 2,
        title: 'Multi-Lane Independent Stream Execution',
        from: 'engine',
        to: 'engine',
        protocol: 'splitRng per-lane streams',
        detail:
          'Each of the 8 lanes operates on an independent random number stream. IDM car-following calculates acceleration, speed, and spacing without cross-lane state contamination.',
      },
      {
        step: 3,
        title: 'Safety Kernel Invariant Enforcment',
        from: 'engine',
        to: 'kernel',
        protocol: 'SafetyKernel.step()',
        detail:
          'Kernel receives controller proposals, checks red wait times, clamps phase changes, and outputs the single authoritative SignalState.',
      },
      {
        step: 4,
        title: 'Transferable Buffer Dispatch',
        from: 'worker',
        to: 'canvas',
        protocol: 'postMessage([vehicles.buffer, heads.buffer])',
        detail:
          'Memory buffers are transferred directly. The UI main thread never incurs garbage collection pauses or heap copy overhead.',
      },
      {
        step: 5,
        title: 'Dynamic Highway Canvas Paint',
        from: 'canvas',
        to: 'ui',
        protocol: 'CanvasRenderingContext2D',
        detail:
          'Paints vehicles with directional headings, animated flashing beacons, brake lights, and selected approach corridors on 14m asphalt with double amber dividers.',
      },
    ],
  },
  {
    id: 'evp',
    title: 'Emergency Vehicle V2X Preemption Lifecycle',
    shortLabel: 'Emergency Preemption (EVP)',
    description:
      'Complete preemption workflow: from inbound radio beacon through cryptographic gateway verification, yellow/all-red clearance buffer enforcement, queue flushing, and full intersection box traversal.',
    nodeIds: ['ui', 'edgegw', 'evp', 'kernel', 'engine'],
    steps: [
      {
        step: 1,
        title: 'Emergency Vehicle Injection & Inbound V2X Beacon',
        from: 'ui',
        to: 'edgegw',
        protocol: 'SignedEvp HTTP POST',
        detail:
          'Ambulance spawns at detection distance doing 15 m/s. Radiates signed V2X radio beacon containing vehicle id, approach lane, speed, and cryptographic signature.',
      },
      {
        step: 2,
        title: 'Edge Authentication & Anti-Replay Defense',
        from: 'edgegw',
        to: 'evp',
        protocol: 'Constant-time HMAC-SHA256 & Nonce Check',
        detail:
          'Edge Gateway verifies signature using crypto.subtle.verify. Durable Object checks seenNonces map and 10-second request velocity. Floods (>20 in 10s) trigger 30s lockout.',
      },
      {
        step: 3,
        title: 'Mandatory Yellow & All-Red Preclearance',
        from: 'evp',
        to: 'kernel',
        protocol: 'PRECLEAR Stage Transition',
        detail:
          'EVP Manager submits preemption directive. Kernel enforces mandatory 3.5s yellow and 2.0s all-red buffers to safely clear cross-street traffic. Clearance times are never shortened.',
      },
      {
        step: 4,
        title: 'Green Dwell, Queue Flushing & Shoulder Filtering',
        from: 'kernel',
        to: 'engine',
        protocol: 'EMS_GREEN Stage',
        detail:
          'Green signal granted to ambulance approach. Vehicles ahead accelerate aggressively (1.5x) to flush the queue forward. Ambulance filters past traffic at 15 m/s.',
      },
      {
        step: 5,
        title: 'Full Intersection Box Traversal & Safe Recovery',
        from: 'engine',
        to: 'evp',
        protocol: 'boxExited Milestone',
        detail:
          'Ambulance smoothly cruises across the entire intersection box from pos = 0 to -boxDistance, exiting at the far boundary. boxExited fires with transit delay. System returns safely through ALL_RED to normal control.',
      },
    ],
  },
  {
    id: 'copilot',
    title: 'Meta AI Copilot & Hallucination Provenance Gate',
    shortLabel: 'Meta AI & Provenance Gate',
    description:
      'Intelligent traffic advisory pipeline: queries Meta Llama / Muse Spark with contextual simulation telemetry and executes cryptographic provenance verification to eliminate hallucinated numbers.',
    nodeIds: ['ui', 'edgegw', 'copilot'],
    steps: [
      {
        step: 1,
        title: 'Operator Diagnostic Query Ingress',
        from: 'ui',
        to: 'edgegw',
        protocol: 'POST /api/copilot/diagnose',
        detail:
          'Operator clicks "Diagnose Bottleneck" or asks a traffic question. Gateway inspects local cache and enforces per-source rate limits.',
      },
      {
        step: 2,
        title: 'Meta Model Inference (Llama / Muse Spark)',
        from: 'edgegw',
        to: 'copilot',
        protocol: 'Meta AI SDK / Interaction API',
        detail:
          'Edge Gateway dispatches prompt with telemetry context to Meta Llama / Muse Spark. Bounded 3-round tool loop queries current speeds, queue lengths, and signal states.',
      },
      {
        step: 3,
        title: 'Provenance Verification Gate (verifySemanticNumbers)',
        from: 'copilot',
        to: 'copilot',
        protocol: 'Semantic Provenance Matcher',
        detail:
          'The gateway extracts all numerical quantities (speeds, delay seconds, vehicle counts) from the LLM output and checks them against actual simulation values. If ungrounded numbers are found, the output drops to the verified template rung.',
      },
      {
        step: 4,
        title: 'Verified Advisory Delivery to Operator',
        from: 'copilot',
        to: 'ui',
        protocol: 'JSON Advisory Envelope',
        detail:
          'Operator receives verified, trustworthy traffic insights, actionable recommendations, and confidence metrics without risks of fabricated metrics.',
      },
    ],
  },
  {
    id: 'lake',
    title: 'Streaming Data Lake & MongoDB Operational Store',
    shortLabel: 'Data Lake & MongoDB',
    description:
      'Big-data streaming architecture: real-time Kafka buffer, 10-second rolling window aggregations, immutable columnar Parquet data lake, and high-speed MongoDB operational store.',
    nodeIds: ['engine', 'worker', 'pipeline', 'db', 'edgegw', 'ui'],
    steps: [
      {
        step: 1,
        title: 'Domain Event Ingestion & Kafka Buffer',
        from: 'engine',
        to: 'pipeline',
        protocol: 'Versioned Domain Events (JSON)',
        detail:
          'Simulation engine drains domain events (vehicleExited, emsMilestone, incidentStarted, phaseChanged) into Kafka KRaft streaming buffer.',
      },
      {
        step: 2,
        title: 'PySpark & TypeScript Window Aggregators',
        from: 'pipeline',
        to: 'pipeline',
        protocol: '10s Rolling Tumbling Windows',
        detail:
          'PySpark Structured Streaming (and local TypeScript lite engine) computes rolling 10s arrival rates, discharge capacity, speed variance, and Level of Service (LOS) bands.',
      },
      {
        step: 3,
        title: 'Parquet Lake Partitioning & MongoDB Persistence',
        from: 'pipeline',
        to: 'db',
        protocol: 'Columnar Parquet & MongoDB BSON',
        detail:
          'Aggregated telemetry writes to partitioned Parquet files for big-data lake analytics. Active runs, audit events, and replay blobs persist to MongoDB with compound indexes.',
      },
      {
        step: 4,
        title: 'Analytical Query Serving & Historical Playback',
        from: 'db',
        to: 'ui',
        protocol: 'REST API & Replay Codec',
        detail:
          'Historical performance metrics, preemption audit logs, and bit-exact replay streams are served to the operator dashboard with <2ms database query latency.',
      },
    ],
  },
];

// --- Project structure ---------------------------------------------------------

export interface TreeNode {
  name: string;
  desc: string;
  badge?: string;
  repoUrl?: string;
  children?: readonly TreeNode[];
}

export const PROJECT_TREE: readonly TreeNode[] = [
  {
    name: 'packages/',
    desc: 'pnpm monorepo workspaces (ADR-0017): unified toolchain, atomic verification, single lockfile.',
    children: [
      {
        name: 'core/',
        desc: 'Pure, bit-deterministic traffic engine. Depends only on zod; never reads wall-clock time or DOM.',
        badge: 'Zero DOM / Pure Core',
        children: [
          {
            name: 'src/contracts.ts',
            desc: 'Single source of truth: Zod-inferred wire types, SignalState, Observation, DomainEvent, and physical timing constants.',
            badge: 'Wire Contracts',
          },
          {
            name: 'src/sim/',
            desc: 'Microscopic physics and lane infrastructure.',
            children: [
              { name: 'engine.ts', desc: 'IDM car-following, per-lane PRNG streams, incident obstacles, full box traversal, vehicle conservation.' },
              { name: 'lane.ts', desc: 'Struct-of-Arrays typed arrays (pos, vel, wait, stops, flags) with FIFO queue order and 100-bin ring buffers.' },
              { name: 'geometry.ts', desc: 'World metres to canvas pixel coordinate mappings, lane anchors, and axis-aligned heading constants.' },
              { name: 'types.ts', desc: 'Bitwise simulation flags (FLAG_EMS, FLAG_IN_BOX, FLAG_FILTERING, FLAG_BRAKING) and active incident schemas.' },
            ],
          },
          {
            name: 'src/control/',
            desc: 'Signal control algorithms and cyber-safety enforcement.',
            children: [
              { name: 'kernel.ts', desc: 'Single-writer deterministic safety kernel. Enforces invariants I1–I6, yellow/all-red clearances, and failSafe.' },
              { name: 'evp.ts', desc: 'Emergency Vehicle Preemption manager: single-use nonces, storm guard (20 req/10s), 4-stage lifecycle.' },
              { name: 'watchdog.ts', desc: 'Hardware heartbeat watchdog: checks controller liveliness; commands FLASH_RED upon software failure.' },
              { name: 'adaptive.ts', desc: 'Max-pressure adaptive phase selection with switching-cost guard (ADR-0005) and phase starvation prevention.' },
              { name: 'fixed.ts', desc: 'Fixed-time 90s timetable baseline (4 phases: NS Left, NS Thru, EW Left, EW Thru).' },
              { name: 'whatif.ts', desc: 'Branching counterfactual simulation for testing alternative control decisions on historical traces.' },
            ],
          },
          {
            name: 'src/worker/',
            desc: 'Multi-threaded digital twin coordination.',
            children: [
              { name: 'twin.ts', desc: 'TwinWorld orchestrator: steps fixed and adaptive digital twins in synchronous lockstep under identical seeds.' },
              { name: 'protocol.ts', desc: 'Thread boundary Zod schemas: validates commands, error payloads, and transferable frame buffers.' },
            ],
          },
          {
            name: 'src/metrics/',
            desc: 'Delay calculations, person-delay, throughput, Level of Service (LOS A–F) bands, and idle fuel/emissions tracking.',
          },
          {
            name: 'src/helpers/',
            desc: 'hmac.ts (constant-time verification), rng.ts (split RNG streams), hash.ts (FNV-1a state hashing), sim-clock.ts.',
          },
        ],
      },
      {
        name: 'web/',
        desc: 'High-performance operator dashboard: vanilla TypeScript, Canvas 2D twin view, Web Worker sim, WCAG AA control room.',
        badge: 'Vanilla TS / No Framework',
        children: [
          {
            name: 'src/ui/',
            desc: 'app.ts (view composition), dom.ts (safe DOM without innerHTML), judge-tour.ts (automated demo walkthrough), camera-overlay.ts (SAM vision).',
          },
          {
            name: 'src/render/',
            desc: 'canvas.ts (HiDPI 2D twin renderer, 14m dark asphalt, double amber centrelines, dashed dividers, corner kerbs, headlights).',
          },
          {
            name: 'src/worker/',
            desc: 'sim.worker.ts (background sim thread, zero-copy buffer transfer), client.ts (worker lifecycle supervisor with restart & replay).',
          },
          {
            name: 'src/state/',
            desc: 'store.ts (unidirectional reactive view model), storage.ts (browser persistence), console.ts (in-app audit log).',
          },
          {
            name: 'src/pages/',
            desc: 'system.ts & system-data.ts: dedicated interactive System Explorer and architecture briefing page (/system).',
          },
          {
            name: 'src/styles/',
            desc: 'tokens.css (Okabe-Ito colorblind-safe tokens), base.css, components.css, system.css (control-room flat matte aesthetics).',
          },
        ],
      },
      {
        name: 'edge/',
        desc: 'Edge Gateway running on Cloudflare Workers + Durable Objects. Provides zero-trust security and Meta AI integration.',
        badge: 'Zero-Trust Gateway',
        children: [
          { name: 'src/index.ts', desc: 'Router table, request validation sequence, origin allow-list check, uniform JSON error envelopes.' },
          { name: 'src/security/', desc: 'HMAC-SHA256 signature verification, IP rate limiter, timestamp skew window check (±30s).' },
          { name: 'src/copilot/', desc: 'Meta Llama / Muse Spark integration, circuit breaker, cache, and Provenance Verification Gate (verifySemanticNumbers).' },
          { name: 'src/do/Room.ts', desc: 'Cloudflare Durable Object: strongly consistent multi-operator coordination, rate limits, and nonce store.' },
          { name: 'src/db/mongo.ts', desc: 'MongoDB client, connection pooling, compound indexing, collection provisioning, audit log persistence.' },
        ],
      },
      {
        name: 'bench/',
        desc: 'Statistical benchmarking suite: paired-seed comparison with bootstrap confidence intervals and detection distance sweeps.',
        badge: 'Paired Benchmark',
      },
    ],
  },
  {
    name: 'pipeline/',
    desc: 'Big-data streaming engine: Apache Spark Structured Streaming, Kafka KRaft, and Parquet data lake.',
    badge: 'Big-Data Lake',
    children: [
      { name: 'spark/urbanflow_stream.py', desc: 'Production PySpark Structured Streaming job computing 10s rolling windows and Parquet lake output.' },
      { name: 'lite/urbanflow_lite.ts', desc: 'Zero-dependency TypeScript streaming window processor with online EWMA variance for local demos.' },
      { name: 'sql/', desc: 'SQL analytics views: windowed lane health, traffic anomalies, and saturation flow analysis.' },
      { name: 'docker/', desc: 'Docker Compose definitions for Kafka KRaft, Schema Registry, and Spark execution environments.' },
    ],
  },
  {
    name: 'db/',
    desc: 'Shared persistence package (ADR-0021): MongoDB client, collection schemas, and run repositories.',
    badge: 'MongoDB Store',
  },
  {
    name: 'docs/',
    desc: 'Comprehensive technical documentation: ARCHITECTURE.md, 21 Architecture Decision Records (ADRs), API specs, security guides.',
    badge: '21 ADRs & Specs',
  },
  {
    name: 'evals/',
    desc: 'Meta AI LLM evaluation harness: test fixtures, quality floor gates, and prompt regression testing.',
    badge: 'LLM Quality Floor',
  },
  {
    name: 'scripts/',
    desc: 'Engineering verification scripts: fitness.mjs (7 architecture gates), docs-check.mjs, and regression suites.',
    badge: '7 Fitness Gates',
  },
];

// --- Components and relationships ----------------------------------------------

export interface ComponentCard {
  id: string;
  pkg: 'core' | 'web' | 'edge' | 'pipeline' | 'db' | 'bench';
  title: string;
  role: string;
  invariants: string;
  filePath: string;
  dependsOn: readonly string[];
  usedBy: readonly string[];
}

export const COMPONENTS: readonly ComponentCard[] = [
  {
    id: 'contracts',
    pkg: 'core',
    title: 'core/contracts.ts',
    role: 'Single source of truth for every type on every wire: SignalState, Observation, EvpRequest, DomainEvent, SimConfig, timing constants.',
    invariants: 'Zero schema drift across web, worker, edge, and database.',
    filePath: 'packages/core/src/contracts.ts',
    dependsOn: ['zod'],
    usedBy: ['engine', 'kernel', 'evp', 'twin', 'protocol', 'edge', 'web', 'db', 'bench', 'pipeline'],
  },
  {
    id: 'engine',
    pkg: 'core',
    title: 'core/sim/engine.ts',
    role: 'Bit-deterministic microscopic traffic simulation: IDM car-following, independent PRNG streams, incident obstacles, full box traversal, conservation accounting.',
    invariants: 'totalArrivals = totalExited + inSystem + totalDenied holds across every tick.',
    filePath: 'packages/core/src/sim/engine.ts',
    dependsOn: ['contracts', 'lane', 'geometry', 'rng', 'hash'],
    usedBy: ['twin', 'whatif', 'bench'],
  },
  {
    id: 'lane',
    pkg: 'core',
    title: 'core/sim/lane.ts',
    role: 'Struct-of-Arrays (SoA) memory representation for lanes: Float64Array for positions and velocities, Uint8Array for flags, 100-bin ring buffers.',
    invariants: 'FIFO order maintenance; cache-locality without object allocation.',
    filePath: 'packages/core/src/sim/lane.ts',
    dependsOn: ['contracts'],
    usedBy: ['engine'],
  },
  {
    id: 'geometry',
    pkg: 'core',
    title: 'core/sim/geometry.ts',
    role: 'Pure world metres <-> canvas pixel coordinate mapping, stop line anchors, axis-aligned headings, point-in-polygon hit testing.',
    invariants: 'Round-trip exact; identical geometry in renderer and simulator.',
    filePath: 'packages/core/src/sim/geometry.ts',
    dependsOn: ['contracts'],
    usedBy: ['engine', 'canvas'],
  },
  {
    id: 'kernel',
    pkg: 'core',
    title: 'core/control/kernel.ts',
    role: 'Single authoritative writer of SignalState. Enforces safety invariants I1–I6, yellow/all-red clearances, anti-starvation clamps, and failSafe.',
    invariants: 'I1–I6 proven on every single output state; no simultaneous green on conflicting phases.',
    filePath: 'packages/core/src/control/kernel.ts',
    dependsOn: ['contracts'],
    usedBy: ['twin', 'evp', 'whatif', 'bench'],
  },
  {
    id: 'adaptive',
    pkg: 'core',
    title: 'core/control/adaptive.ts',
    role: 'Max-pressure phase selection with switching-cost guard (ADR-0005) and starvation monitoring; proposes phase changes to safety kernel.',
    invariants: 'Strict proposal only — cannot modify traffic signals directly.',
    filePath: 'packages/core/src/control/adaptive.ts',
    dependsOn: ['contracts', 'kernel'],
    usedBy: ['twin', 'bench'],
  },
  {
    id: 'fixed',
    pkg: 'core',
    title: 'core/control/fixed.ts',
    role: 'Fixed-time 90-second cycle controller representing legacy municipal infrastructure; acts as paired benchmark baseline and real-world fallback.',
    invariants: 'Deterministic timetable cycler.',
    filePath: 'packages/core/src/control/fixed.ts',
    dependsOn: ['contracts', 'kernel'],
    usedBy: ['twin', 'bench'],
  },
  {
    id: 'evp',
    pkg: 'core',
    title: 'core/control/evp.ts',
    role: 'Emergency Vehicle Preemption manager: single-use nonces, storm guard flooding defense, ETA calculations, 4-stage lifecycle (IDLE → PRECLEAR → EMS_GREEN → RECOVERY).',
    invariants: 'Zero yellow/all-red clearance compression during preemption.',
    filePath: 'packages/core/src/control/evp.ts',
    dependsOn: ['contracts', 'kernel'],
    usedBy: ['twin', 'edge'],
  },
  {
    id: 'watchdog',
    pkg: 'core',
    title: 'core/control/watchdog.ts',
    role: 'Autonomous hardware watchdog monitoring controller heartbeat; triggers failSafe() FLASH_RED isolation upon freeze or crash.',
    invariants: 'Heartbeat timeout triggers autonomous fallback in < 500ms.',
    filePath: 'packages/core/src/control/watchdog.ts',
    dependsOn: ['contracts', 'kernel'],
    usedBy: ['twin'],
  },
  {
    id: 'metrics',
    pkg: 'core',
    title: 'core/metrics/metrics.ts',
    role: 'Computes average delay, person-delay, throughput, max queue depths, Level of Service (LOS) bands, and idle fuel/emissions from drained domain events.',
    invariants: 'All metrics derived from drained domain events; zero estimation.',
    filePath: 'packages/core/src/metrics/metrics.ts',
    dependsOn: ['contracts'],
    usedBy: ['twin', 'web', 'bench'],
  },
  {
    id: 'twin',
    pkg: 'core',
    title: 'core/worker/twin.ts',
    role: 'TwinWorld dual-twin orchestrator: executes simFixed and simAdaptive concurrently under identical arrival seeds, logs inputs, hashes state.',
    invariants: 'Paired-seed bit-identical arrivals across both twins.',
    filePath: 'packages/core/src/worker/twin.ts',
    dependsOn: ['engine', 'kernel', 'adaptive', 'fixed', 'evp', 'watchdog', 'metrics', 'protocol'],
    usedBy: ['sim.worker', 'bench'],
  },
  {
    id: 'protocol',
    pkg: 'core',
    title: 'core/worker/protocol.ts',
    role: 'Worker thread boundary protocol: Zod-validated input commands, transferable Float32Array frame buffers, KPI telemetry envelopes.',
    invariants: 'Zod validation on all inbound messages at the thread boundary.',
    filePath: 'packages/core/src/worker/protocol.ts',
    dependsOn: ['contracts'],
    usedBy: ['sim.worker', 'client', 'edge'],
  },
  {
    id: 'sim.worker',
    pkg: 'web',
    title: 'web/worker/sim.worker.ts',
    role: 'Background execution shell: the only place a wall clock is read; advances whole ticks and transfers zero-copy Float32Array frame buffers.',
    invariants: 'UI main thread completely decoupled from simulation computation.',
    filePath: 'packages/web/src/worker/sim.worker.ts',
    dependsOn: ['twin', 'protocol'],
    usedBy: ['client'],
  },
  {
    id: 'client',
    pkg: 'web',
    title: 'web/worker/client.ts',
    role: 'Main-thread worker supervisor: worker spawning, transferable buffer recycling, heartbeat tracking, auto-restart and input-log replay.',
    invariants: 'Worker restarts replay input log to recover exact sim state.',
    filePath: 'packages/web/src/worker/client.ts',
    dependsOn: ['protocol'],
    usedBy: ['store'],
  },
  {
    id: 'store',
    pkg: 'web',
    title: 'web/state/store.ts',
    role: 'Reactive view model: measured telemetry in, operator intent out. Owns no simulation engine; cannot advance ticks directly.',
    invariants: 'Unidirectional data flow; single source of UI truth.',
    filePath: 'packages/web/src/state/store.ts',
    dependsOn: ['client', 'metrics'],
    usedBy: ['app', 'canvas'],
  },
  {
    id: 'canvas',
    pkg: 'web',
    title: 'web/render/canvas.ts',
    role: 'HiDPI 2D twin renderer: interpolates positions between frames, draws 14m dark asphalt, double amber centrelines, dashed dividers, headlights, and beacon pulses.',
    invariants: 'Zero garbage collection allocation in requestAnimationFrame loop.',
    filePath: 'packages/web/src/render/canvas.ts',
    dependsOn: ['store', 'geometry'],
    usedBy: ['app'],
  },
  {
    id: 'app',
    pkg: 'web',
    title: 'web/ui/app.ts',
    role: 'Main operator dashboard: view composition, header actions, judge tour button, KPI cards, lane table, EVP preemption lab, copilot panel.',
    invariants: 'WCAG 2.2 AA contrast compliance; keyboard accessible.',
    filePath: 'packages/web/src/ui/app.ts',
    dependsOn: ['store', 'canvas'],
    usedBy: [],
  },
  {
    id: 'edge',
    pkg: 'edge',
    title: 'edge/src/index.ts',
    role: 'Zero-trust edge gateway: route table, origin allow-list check, constant-time HMAC-SHA256 verification, timestamp skew window (±30s), Durable Object coordination.',
    invariants: 'Zero-trust request filter sequence; constant-time crypto.',
    filePath: 'packages/edge/src/index.ts',
    dependsOn: ['contracts', 'protocol', 'db'],
    usedBy: ['copilot', 'web'],
  },
  {
    id: 'copilot',
    pkg: 'edge',
    title: 'edge/copilot/index.ts',
    role: 'Meta AI Copilot: fallback ladder (Muse Spark → Meta Llama → Deterministic Template), circuit breaker, Provenance Verification Gate (verifySemanticNumbers).',
    invariants: 'All quoted metrics verified against sim engine; zero hallucination tolerance.',
    filePath: 'packages/edge/src/copilot/index.ts',
    dependsOn: ['edge'],
    usedBy: ['web'],
  },
  {
    id: 'durable_object',
    pkg: 'edge',
    title: 'edge/do/Room.ts',
    role: 'Cloudflare Durable Object: strongly consistent multi-operator dashboard state synchronization, atomic single-use nonce store, and IP rate-limiting ledgers.',
    invariants: 'Single-threaded strongly consistent state within each junction room.',
    filePath: 'packages/edge/src/do/Room.ts',
    dependsOn: ['edge'],
    usedBy: ['edge'],
  },
  {
    id: 'pipeline',
    pkg: 'pipeline',
    title: 'pipeline/spark & lite',
    role: 'Streaming data plane: Kafka ingest → 10s rolling window aggregations → online EWMA variance tracking → columnar Parquet data lake.',
    invariants: 'TS Lite engine produces bit-identical aggregates to Apache Spark.',
    filePath: 'pipeline/lite/urbanflow_lite.ts',
    dependsOn: ['contracts'],
    usedBy: ['db'],
  },
  {
    id: 'db',
    pkg: 'db',
    title: 'packages/edge/src/db/mongo.ts',
    role: 'Shared persistence store: MongoDB driver, collection provisioning (runs, replays, audits, incidents), compound indexing, and historical analytics querying.',
    invariants: 'Sub-2ms query latency; immutable preemption audit trail.',
    filePath: 'packages/edge/src/db/mongo.ts',
    dependsOn: ['contracts'],
    usedBy: ['edge'],
  },
  {
    id: 'bench',
    pkg: 'bench',
    title: 'packages/bench/src/bench.ts',
    role: 'Statistical validation engine: runs paired-seed fixed vs adaptive benchmark with 95% bootstrap confidence intervals and EMS detection-distance sweeps.',
    invariants: 'Paired seeds guarantee statistical honesty.',
    filePath: 'packages/bench/src/bench.ts',
    dependsOn: ['engine', 'kernel', 'adaptive', 'evp', 'metrics'],
    usedBy: [],
  },
];

// --- Workflows ------------------------------------------------------------------

export interface WorkflowStep {
  title: string;
  text: string;
  stageCode?: string;
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
    title: 'The 10 Hz Control Loop',
    summary:
      'One simulated tick, start to finish. Everything the operator sees is downstream of this loop and nothing reads a wall clock inside the core.',
    steps: [
      {
        title: 'Observe',
        stageCode: 'OBSERVE',
        text: 'TwinWorld builds an Observation: per-lane queue length, weighted wait, occupancy, nearest EMS distance — read directly from Struct-of-Arrays lanes.',
      },
      {
        title: 'Decide',
        stageCode: 'DECIDE',
        text: 'The adaptive controller scores lane pressure and proposes a phase action; the fixed-time cycler proposes its timetable. Both are strictly advisory proposals.',
      },
      {
        title: 'Preempt?',
        stageCode: 'PREEMPT',
        text: 'If an emergency vehicle is bound to an active EVP plan, the manager adds a preemption directive (PRECLEAR / EMS_GREEN) alongside the controller action.',
      },
      {
        title: 'Safety Kernel Gate',
        stageCode: 'KERNEL',
        text: 'SafetyKernel.step is the single writer: it validates the merged proposal against invariants I1–I6, then emits the only SignalState that exists. Refusals are recorded, never skipped.',
      },
      {
        title: 'IDM Physics Update',
        stageCode: 'PHYSICS',
        text: 'SimEngine.step advances IDM car-following for every vehicle, handles arrivals, incidents, emergency-vehicle shoulder filtering, box traversal, and queues domain events.',
      },
      {
        title: 'Zero-Copy Frame Transfer',
        stageCode: 'TRANSFER',
        text: 'packFrame writes one Float32Array (stride 6) plus signal heads; the buffer is transferred to the main thread with zero copy overhead, rendered at 60 FPS, transferred back and reused.',
      },
    ],
  },
  {
    id: 'evp',
    title: 'Emergency Vehicle Preemption, End to End',
    summary:
      'From the ambulance entering the approach lane to normal control resuming — with the safety guarantees that make it demo-ready.',
    steps: [
      {
        title: 'Vehicle Injection & Inbound V2X',
        stageCode: 'INJECT',
        text: 'spawnEms writes the ambulance into the lane at its real detection distance (e.g. 250m) doing 54 km/h (15 m/s); nudges into a collision-free gap without stacking.',
      },
      {
        title: 'Edge Authentication & Nonce Store',
        stageCode: 'AUTH',
        text: 'The EVP manager checks HMAC-SHA256 signature, 10s storm guard rate limiter, single-use nonce store, and physical plausibility bounds before any plan exists.',
      },
      {
        title: 'Dynamic ETA Lead Time Plan',
        stageCode: 'PLAN',
        text: 'Calculates vehicle ETA versus required lead time (clearance + preclear + queue flush). A TIGHT plan is accepted with shortfall recorded — yellow and all-red are never shortened.',
      },
      {
        title: 'PRECLEAR (Mandatory Clearance)',
        stageCode: 'PRECLEAR',
        text: 'The safety kernel switches cross-street signals through mandatory 3.5s yellow and 2.0s all-red clearance. Cross-street traffic safely clears the junction box.',
      },
      {
        title: 'EMS_GREEN (Dwell & Queue Flush)',
        stageCode: 'EMS_GREEN',
        text: 'Green light dwell holds while the ambulance approaches. Vehicles ahead accelerate aggressively (1.5x) to flush the queue; ambulance filters along the lane at cruise speed.',
      },
      {
        title: 'Smooth Box Traversal to Far Exit',
        stageCode: 'TRAVERSAL',
        text: 'The ambulance smoothly cruises across the entire intersection box from pos = 0 to -boxDistance, clearing the junction completely before exiting naturally. boxExited fires with transit delay.',
      },
      {
        title: 'RECOVERY (All-Red Exit)',
        stageCode: 'RECOVERY',
        text: 'RECOVERY phase exits through mandatory all-red buffer before returning to normal adaptive control; interrupted phases are given fair priority, preventing starvation.',
      },
    ],
  },
  {
    id: 'twins',
    title: 'Digital Twins, Replay & Share Links',
    summary:
      'Why the comparison is honest: identical arrivals, one difference, and a time machine that rebuilds the past bit-exactly.',
    steps: [
      {
        title: 'One Seed, Split Streams',
        stageCode: 'SEED',
        text: 'splitRng gives every lane and concern its own PRNG stream (ADR-0014): adding a lane cannot alter another lane’s arrivals, so both twins face identical traffic.',
      },
      {
        title: 'Two Engines in Lockstep',
        stageCode: 'TWINS',
        text: 'Fixed-time on the left, adaptive on the right. The only difference between the columns is the controller — which is what makes the KPI delta statistically valid.',
      },
      {
        title: 'Input Log Recording',
        stageCode: 'LOG',
        text: 'Every operator edit is recorded with its simulated tick: demand changes, injections, manual preemptions. The input log is the run’s complete DNA.',
      },
      {
        title: 'Deterministic Scrubbing',
        stageCode: 'SCRUB',
        text: 'restoreTo(t) rebuilds both engines from scratch and replays the log to tick t — scrubbing forward afterwards is bit-exact, reproducing the exact run.',
      },
      {
        title: 'FNV-1a State Hash Proof',
        stageCode: 'HASH',
        text: 'FNV-1a state hashes over canonical byte layouts prove two runs identical; the same seed on any machine produces the exact same state bit for bit.',
      },
      {
        title: 'Shareable URL Link',
        stageCode: 'SHARE',
        text: 'Scenario, seed and edits encode into the URL hash (ADR-0019): a judge opens the link and gets the exact same simulation run, frame for frame.',
      },
    ],
  },
  {
    id: 'data',
    title: 'From Events to Answers (Streaming Data Lake)',
    summary:
      'The big-data plane: observes the simulation and answers analytical questions — structurally barred from driving a signal.',
    steps: [
      {
        title: 'Domain Events Emitted',
        stageCode: 'EMIT',
        text: 'Domain events (vehicle exits, delay metrics, EMS milestones, incidents) leave the engine as typed, versioned JSON records.',
      },
      {
        title: 'Kafka KRaft Buffer',
        stageCode: 'KAFKA',
        text: 'Kafka in KRaft mode buffers the stream (ADR-0009); the Spark job validates each record against the shared schema before anything is ingested.',
      },
      {
        title: 'Rolling Window Aggregations',
        stageCode: 'AGGREGATE',
        text: 'Structured Streaming computes windowed per-lane health and anomaly roll-ups; the same aggregates run in a TypeScript lite path for machines without a JVM.',
      },
      {
        title: 'Columnar Parquet Lake',
        stageCode: 'PARQUET',
        text: 'Results land in Parquet (ADR-0008) — columnar, partitionable, and readable by both Spark and the downstream serving layer.',
      },
      {
        title: 'MongoDB Operational Store',
        stageCode: 'MONGO',
        text: 'The shared db package upserts runs and results into MongoDB; the edge gateway exposes them through the same Zod-typed API the dashboard consumes.',
      },
      {
        title: 'Meta AI Explanation & Provenance',
        stageCode: 'EXPLAIN',
        text: 'The Meta AI copilot answers questions over that evidence; numbers in its answers are checked against the input window before anything is shown.',
      },
    ],
  },
];

// --- Hackathon judging map & video guide -----------------------------------------

export interface RubricItem {
  id: string;
  criterion: string;
  /** Judge weight in percent — the bar width is drawn from this number. */
  weight: number;
  judgesLookFor: string;
  ourAnswer: string;
  /** Where in this explorer / the live app the judge sees it. */
  show: readonly { section: string; label: string }[];
}

export const RUBRIC: readonly RubricItem[] = [
  {
    id: 'impact',
    criterion: 'Real-World Impact & Problem Relevance',
    weight: 30,
    judgesLookFor:
      'Real-world problem relevance, potential user base, magnitude of value created, fit with the problem statement.',
    ourAnswer:
      'Every urban ambulance loses critical minutes behind red lights; major corridors waste throughput on static timetable cycles. UrbanFlow AI demonstrates the solution on one screen: parallel digital twins under identical arrivals, measuring delay and person-delay in seconds, Level of Service (LOS) bands, fuel and CO2 emissions. The delta is statistically proven with 95% bootstrap confidence intervals.',
    show: [
      { section: 'workflows', label: 'Emergency preemption, end to end' },
      { section: 'components', label: 'bench — paired seeds, bootstrap CIs' },
      { section: 'architecture', label: 'Dual-twin architecture' },
    ],
  },
  {
    id: 'meta',
    criterion: 'Use of Meta AI Tooling & Prompt Craft',
    weight: 25,
    judgesLookFor:
      'Depth of model integration beyond generic API calls; creativity; surfacing non-obvious model capabilities; safety guardrails.',
    ourAnswer:
      'Four distinct Muse prompt surfaces with specialized tasks: diagnose, explain, chat, and advisory reports. Backed by a fallback ladder: Muse Spark -> Meta Llama -> Deterministic Template with circuit breaker and caching. Integrated with SAM 3.1 street-level camera segmentation. Protected by our Provenance Verification Gate (verifySemanticNumbers) which checks every number quoted by the LLM against the physics engine.',
    show: [
      { section: 'architecture', label: 'Copilot chain & Provenance Gate' },
      { section: 'workflows', label: 'From events to answers' },
      { section: 'components', label: 'edge/copilot providers' },
    ],
  },
  {
    id: 'technical',
    criterion: 'Technical Depth, Architecture & Execution',
    weight: 20,
    judgesLookFor:
      'Architecture craftsmanship, code quality, stability, thoughtful engineering, production viability.',
    ourAnswer:
      'A bit-deterministic 10 Hz IDM simulation engine with conservation law verified by automated tests; single-writer safety kernel mathematically enforcing invariants I1–I6; zero-trust Edge Gateway with constant-time HMAC-SHA256 and single-use nonce stores; Kafka -> PySpark -> Parquet time-series lake with TypeScript lite fallback; 125 vitest tests, 7 architecture fitness gates, 100% strict TypeScript.',
    show: [
      { section: 'architecture', label: 'Single-writer safety kernel' },
      { section: 'structure', label: 'The monorepo structure' },
      { section: 'components', label: 'Component dependency graph' },
    ],
  },
  {
    id: 'demo',
    criterion: 'Working Demo, Completeness & Video Polish',
    weight: 25,
    judgesLookFor:
      'A functional live demo, robustness under live testing, clarity and polish of the video.',
    ourAnswer:
      'The platform runs live in browser: spawn an ambulance and watch the full PRECLEAR -> EMS_GREEN -> full box traversal lifecycle. A built-in 90-second judge tour runs unattended. This System Explorer page serves as the second camera for video recording: deep-links by hash, interactive data flow simulator, animated workflow diagrams, and automated tour mode.',
    show: [
      { section: 'architecture', label: 'Interactive data flow tracer' },
      { section: 'workflows', label: 'Auto-play workflow walk-throughs' },
      { section: 'judging', label: 'Video demonstration script' },
    ],
  },
];

export interface ThemeFit {
  name: string;
  verdict: string;
}

export const THEME_FIT: readonly ThemeFit[] = [
  {
    name: 'Push the Frontier',
    verdict:
      'AI inside a physical-system control loop: a microscopic traffic simulation whose signals are governed by an uncompromised safety kernel, paired with Meta AI advice that is structurally barred from writing to physical traffic signals.',
  },
  {
    name: 'Build for Your World',
    verdict:
      'Solves an urgent everyday urban crisis: emergency vehicles delayed at empty red lights. Turns complex control-room telemetry into plain-language actionable advice an operator can trust.',
  },
];

// --- 2.5-Minute Video Recording Outline for Hackathon -----------------------------

export interface DemoScriptScene {
  time: string;
  title: string;
  camera: string;
  speech: string;
  actions: readonly string[];
}

export const VIDEO_DEMO_SCRIPT: readonly DemoScriptScene[] = [
  {
    time: '0:00 – 0:35',
    title: 'The Urban Grid Crisis & Twin Comparison',
    camera: 'Live Dashboard (http://localhost:5173/)',
    speech:
      '"Every day, emergency responders lose critical minutes trapped at red lights while empty cross-streets get green time. This is UrbanFlow AI — an intelligent traffic platform that solves this with real-time digital twins. On the left, you see the legacy fixed-time signal running a 90-second cycle. On the right is our adaptive AI twin running under identical vehicle arrival seeds. Notice the KPI difference: over 35% lower delay and zero queue spillbacks."',
    actions: [
      'Show side-by-side twin intersection canvas',
      'Point out KPI delta bars (Average Delay, Person Delay, Throughput)',
      'Click a high-demand scenario button (e.g. Heavy North-South)',
    ],
  },
  {
    time: '0:35 – 1:10',
    title: 'Emergency Vehicle Preemption & Box Crossing',
    camera: 'Live Dashboard -> Preemption Panel',
    speech:
      '"Now let\'s test emergency response. When I inject an ambulance on Northbound Thru, notice the V2X beacon. The system immediately calculates the ETA, enters PRECLEAR through mandatory yellow and all-red buffers, and grants EMS_GREEN. Watch the cars ahead yield and clear the lane. The ambulance filters through and cruises smoothly across the intersection box without getting stuck."',
    actions: [
      'Click "Spawn Ambulance" on NB-TR',
      'Point out the EVP timeline banner (PRECLEAR -> EMS_GREEN -> boxExited)',
      'Highlight the flashing blue beacon and headlights driving across the intersection box',
    ],
  },
  {
    time: '1:10 – 1:45',
    title: 'Single-Writer Safety Kernel & Zero-Trust Security',
    camera: 'System Explorer -> Architecture (/system.html#architecture)',
    speech:
      '"Safety in municipal infrastructure cannot be an afterthought. In UrbanFlow, no AI model or external network can ever command a traffic light directly. Our Single-Writer Deterministic Safety Kernel mathematically enforces invariants I1 through I6 on every 0.1s tick — guaranteeing conflicting phases are never green. Inbound V2X radio requests must pass constant-time HMAC-SHA256 verification and single-use nonce stores at our edge gateway."',
    actions: [
      'Click "System" button to open System Explorer',
      'Select "Emergency Preemption (EVP)" flow tracer',
      'Highlight SafetyKernel and HMAC Gateway nodes',
    ],
  },
  {
    time: '1:45 – 2:15',
    title: 'Meta AI Copilot & Hallucination Provenance Gate',
    camera: 'Live Dashboard -> Copilot Panel & System Explorer',
    speech:
      '"We integrated Meta AI tooling through four specialized prompt surfaces powered by Meta Llama and Muse Spark. But crucially, to prevent LLM hallucinations, we engineered a Provenance Verification Gate. Every numerical metric in the AI output is cross-referenced in real time against the physics engine. If a hallucinated number is detected, the response safely falls back to our deterministic template."',
    actions: [
      'Click "Diagnose Bottleneck" in the Copilot panel',
      'Show the structured diagnosis and confidence badge',
      'Highlight the Provenance Gate verification check',
    ],
  },
  {
    time: '2:15 – 2:45',
    title: 'Big-Data Lake & Hackathon Rubric Alignment',
    camera: 'System Explorer -> Judging (/system.html#judging)',
    speech:
      '"Under the hood, all simulation telemetry streams to our Apache Spark and TypeScript lite pipeline, storing columnar Parquet records and indexing into MongoDB with sub-2 millisecond latency. With 125 automated tests, zero-framework vanilla TypeScript, and 7 architectural fitness gates, UrbanFlow AI bridges cutting-edge AI with uncompromised engineering safety."',
    actions: [
      'Switch to the "Hackathon pitch" rubric tab',
      'Show the 4 weighted evaluation categories and 100% test pass badge',
      'Conclude with the call-to-action summary',
    ],
  },
];

// --- About / overview -----------------------------------------------------------
// The briefing a judge needs before any section: the problem, the shape of the
// answer, what is genuinely new, and what has been measured rather than claimed.

export interface AboutBlock {
  heading: string;
  body: string;
}

export const ABOUT_BLOCKS: readonly AboutBlock[] = [
  {
    heading: 'The Problem',
    body: 'Urban signals are timed for one worst hour and left running the rest of the day: an ambulance sits at a red light over an empty cross-street, corridors burn throughput and fuel for the hours the plan was never built for, and cities cannot A/B test a control strategy on live traffic before deploying it. The cost is measured in minutes for the vehicle, seconds of life for its patient, and a city’s trust for everyone watching.',
  },
  {
    heading: 'The Answer, in One Paragraph',
    body: 'UrbanFlow AI runs two identical intersections from one seeded stream — one fixed-time, one adaptive — behind a single-writer safety kernel that nothing, including the AI, can bypass. An HMAC-signed edge gateway exposes the run, an advisory-only copilot with a deterministic fallback explains it, and a Kafka → PySpark → Parquet pipeline turns every tick into queryable evidence. Every number on the screen is measured from the simulation, and every measurement is reproducible to the tick.',
  },
  {
    heading: 'Meta Global AI Developer Hackathon Alignment',
    body: 'Directly addressing Theme 1 ("Build for Your World") and Theme 2 ("Push the Frontier"): UrbanFlow AI delivers tangible urban infrastructure resilience for real cities while advancing edge AI with dual Llama 3.3 70B & 8B model routing, multi-turn tool-calling loops, provenance gates, and circuit-breaker safety architecture. Every claim is substantiated by reproducible paired-seed benchmarks across 125 unit & integration tests.',
  },
  {
    heading: 'Clef Model Architectural Invariants (I1–I6)',
    body: 'The simulation engine and safety kernel enforce 6 non-negotiable formal mathematical invariants: (I1) Signal exclusivity — no conflicting green indications simultaneously; (I2) Minimum green (4.0s) & clearance guarantees (yellow 3.5s + all-red 2.0s); (I3) Single-writer kernel — only SafetyKernel mutates SignalState; (I4) Conservation law — totalArrivals = totalExited + inSystem + totalDenied; (I5) Nonce uniqueness & HMAC authentication on all edge preemption requests; (I6) LLM advisory boundary — AI proposals are strictly non-authoritative recommendations verified against simulation evidence.',
  },
];

export const ABOUT_INNOVATIONS: readonly { title: string; body: string }[] = [
  {
    title: 'Bit determinism as a product feature',
    body: 'A fixed 0.1 s step, per-lane split-RNG streams (ADR-0014) and struct-of-arrays lanes (ADR-0015): no wall clock inside the core, FNV-1a state hashes, and a share link that rebuilds a run frame for frame (ADR-0019). Determinism is what makes the twin comparison, the scrub and the benchmarks mean anything.',
  },
  {
    title: 'A safety kernel that cannot be talked around',
    body: 'Controllers and preemption only propose; the single writer validates every change against invariants I1–I6 (ADR-0003/0004). An unsafe action is not disallowed by policy — it is not expressible in the type the kernel accepts. Refusals are counted, never skipped.',
  },
  {
    title: 'Honest evaluation by construction',
    body: 'Twin intersections, paired seeds, bootstrap confidence intervals, tune/train seed separation (ADR-0016) and a saturation flow measured from the car-following model (≈1,259 veh/h, not an assumed constant). Held-out results and limitations are documented before the wins.',
  },
  {
    title: 'LLM advice with a hard leash',
    body: 'Muse Spark → Llama → deterministic template (ADR-0011) behind cache, breaker and budgets; semantic numbers in an answer are verified against the evidence window or the template rung answers instead. No copilot route can write a signal state (ADR-0012).',
  },
  {
    title: 'Preemption that respects physics',
    body: 'An ambulance is injected at its real detection distance into the nearest collision-free gap, its ETA is recomputed from the simulation every tick, and clearance intervals are never shortened to rescue a late request — a TIGHT plan is accepted with the shortfall recorded.',
  },
];

export const ABOUT_ACHIEVEMENTS: readonly { stat: string; label: string }[] = [
  { stat: '10 Hz', label: 'deterministic fixed-step kernel — 0.1 s tick, zero wall-clock reads in core' },
  { stat: '133', label: 'tests across core, edge and bench, one verify command, strict TypeScript' },
  { stat: '21', label: 'architecture decision records — every trade-off written down with rationale' },
  { stat: '2×', label: 'engines per run: identical arrivals, one difference — the controller' },
  { stat: '4', label: 'Muse prompt surfaces (diagnose · explain · chat · advisory) plus camera mode' },
  { stat: '5', label: 'deployment layers: browser · deterministic core · edge gateway · stream pipeline · serving store' },
];
