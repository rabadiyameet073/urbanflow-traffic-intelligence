/**
 * Module 32 §7: Centralized Internationalisation & User-Facing Strings
 *
 * All user-visible strings are declared here as typed constants to prevent
 * string sprawl, ensure consistent copywriting, and facilitate localization.
 */

export const STRINGS = {
  brand: {
    title: 'UrbanFlow AI',
    subtitle: 'Adaptive Traffic-Signal Intelligence with Safety Kernel & AI Copilot',
    simulationOnly: 'SIMULATION ONLY',
    identicalArrivals: (seed: number) => `Identical arrivals (seed ${seed})`,
    stateHashLabel: (hash: string) => `State Hash: ${hash}`,
  },
  boot: {
    // Module 30 §6: an unsupported browser gets an explanation, never a blank
    // page. The recorded demo is the honest fallback path.
    unsupportedTitle: 'UrbanFlow AI needs a modern browser',
    unsupportedBody: 'This simulator runs the physics engine in a background Web Worker, which your browser does not support. Nothing has failed — the app is simply unable to start here.',
    unsupportedNote: 'The recorded 90-second demo plays in any browser and shows the same measured results.',
    // Module 30 §7: global errors are surfaced, never swallowed. The message is
    // sanitised (code + short text); no stack or user input is shown.
    errorPrefix: 'Unexpected error',
    noticeAriaLabel: 'Application notices',
  },
  header: {
    // Emojis replaced by inline SVG icons (`ui/icons.ts`); these are the visible
    // text labels and the accessible names, never a pictograph.
    spawnAmbulance: 'Spawn ambulance',
    watchJudgeDemo: 'Watch 90-second demo',
    themeToggle: 'Toggle light or dark theme',
    pauseLabel: 'Pause Simulation',
    resumeLabel: 'Resume Simulation',
    scenarioSelectLabel: 'Select Scenario',
    speedControlsLabel: 'Simulation speed controls',
    helpButton: 'Help',
    themeToggleVisible: 'Theme',
    helpShortcuts: 'Keyboard shortcuts',
    // Module 42 §2: an in-app control that forces reduced motion on/off independent of the OS.
    reduceMotion: 'Reduce motion',
    reduceMotionOn: 'Motion reduced',
    reduceMotionHelp: 'Force-override motion regardless of the system setting',
  },
  twins: {
    fixedTitle: 'Fixed-Time Baseline (90s Cycle)',
    adaptiveTitle: 'UrbanFlow Adaptive Controller',
    badgeAi: 'Muse Spark',
    canvasAriaLabel: 'Top-down view of a four-way intersection with eight approach lanes.',
    tableToggle: 'Toggle Lane Data Table',
    ribbonFixed: 'Fixed phase timeline',
    ribbonAdaptive: 'Adaptive phase timeline',
  },
  laneTable: {
    // Module 32 §2.3: the canvas data-table alternative — the accessible layer
    // for the otherwise-opaque canvas. These headers are the only text a screen
    // reader has for the twin view, so they are copy, not throwaway literals.
    approachLane: 'Approach Lane',
    signalIndication: 'Signal Indication',
    queueMeters: 'Queue (m)',
    vehiclesWaiting: 'Vehicles Waiting',
    initialIndication: 'STOP (Red)',
    tableLabel: 'Current lane queue and signal states',
  },
  judge: {
    badge: '90s Demo',
    openingCaption: 'Same cars, same seed. Two controllers.',
    stop: 'Stop (Esc)',
  },
  live: {
    ready: 'Traffic simulation ready.',
  },
  phases: {
    P1_NS_LEFT: 'P1 · NS Left',
    P2_NS_THRU: 'P2 · NS Thru',
    P3_EW_LEFT: 'P3 · EW Left',
    P4_EW_THRU: 'P4 · EW Thru',
  } as const,
  kpis: {
    personDelay: 'Person-Delay',
    personDelayHelp: 'Weighted average delay per human passenger across all vehicle modes',
    avgDelay: 'Average Delay',
    throughput: 'Throughput',
    emsDelay: 'EMS Preemption Delay',
    // Module 41 §2: bus and bike delay are the equity metrics, shown as tiles.
    busDelay: 'Bus Delay',
    bikeDelay: 'Bike Delay',
    maxQueue: 'Max Queue Length',
    fuel: 'Idle Fuel / CO₂',
    stopsPerVeh: 'Stops per Vehicle',
    denied: 'Denied Entries',
    // Module 20 §5: > 0.5 % denied makes the delay numbers optimistic — say so.
    deniedWarning: 'Denied arrivals exceed 0.5%: reported delays look better than reality because overflow never entered.',
    lowerBetter: 'lower is better',
    higherBetter: 'higher is better',
    fixedPrefix: 'Fixed: ',
    comparisonNote: 'Live comparison of two identical-arrival simulations (same seed).',
    // Module 41 §1.2: single-run figures are never presented as a statistical
    // claim. The seeded live twin is one run, so it is labelled as such and the
    // CI-bearing claims are deferred to the Results view.
    singleRunNote: 'Single run (one seed) — not a statistical claim. Seeded 95% CI results live in the Results view.',
    missingReason: 'No value yet — this metric needs a completed run window.',
    noData: '— not enough data yet',
    parity: 'no difference',
    missing: '—',
    losLabel: (grade: string | null) => (grade === null ? 'LOS —' : `LOS ${grade}`),
    assumptionsTitle: 'Assumptions',
    assumptionsFuel: 'Idle fuel = Σ(idle seconds × per-class L/h ÷ 3600): car 0.6, bus 2.0, truck 1.8, ambulance 0.9, bike 0.',
    assumptionsCo2: 'CO₂ = fuel × factor: gasoline 2.31 kg/L, diesel 2.68 kg/L. Factors are assumptions, not measurements.',
  },
  copilot: {
    title: 'Meta AI Copilot (Muse Spark)',
    placeholderPrompt: 'Ask the Copilot about bottleneck lanes, congestion causes, or preemption plans...',
    diagnoseBtn: 'Diagnose Bottlenecks',
    clearBtn: 'Clear',
    proposeBanner: 'Advisory Proposal (Requires Operator Approval & Kernel Pass)',
    approveBtn: 'Approve & Apply',
    rejectBtn: 'Reject',
    tryUnsafeBtn: 'Try an unsafe proposal',
    verifying: 'Verifying on the digital twin — 5 simulated minutes, current vs proposed…',
    unsafeApproved: (pct: number) =>
      `UNEXPECTED: approved with ${pct}% improvement. The kernel should have refused this — treat it as a regression.`,
    sourceMeta: 'Meta Muse Spark 1.3',
    sourceWorkersAi: 'Workers AI (Llama)',
    sourceTemplate: 'Template Fallback',
    advisoryNotice: 'AI advises, never controls. All recommendations require Safety Kernel dry-run and operator approval.',
    idleHint: 'No diagnosis yet. Run one to see measured evidence.',
    severityLabel: 'Severity',
    confidenceLabel: 'heuristic score',
    // Module 01 §4: the core demo must keep running when the edge is down, and
    // say so in exactly these words.
    offlineHint: 'Edge offline — core demo unaffected.',
  },
  panel: {
    explainTitle: 'Why this phase?',
    evpTitle: 'Emergency Vehicle Preemption (EVP)',
    auditTitle: 'Run audit',
    pressureLabel: (phase: string) => `Pressure ${phase}`,
    waitingForData: 'Waiting for the first planning window…',
    conservationLabel: 'Conservation law: arrivals = exited + in system + denied',
    conservationOk: 'balanced',
    conservationBroken: 'mismatch',
    modeLiveSim: 'LIVE-SIM',
    // Module 10 §7 / 31 §7: the recovery notice shown after an auto-restart.
    workerRestarted: (tSimS: number) =>
      `Simulation worker restarted and restored to ${tSimS.toFixed(1)} s from the input log.`,
    // Module 01 §4: data-source badges everywhere numbers appear.
    modeReplay: 'REPLAY',
    modePrecomputed: 'PRECOMPUTED',
    cancelEvp: 'Cancel preemption',
    evpIdle: 'READY',
    evpSteps: {
      request: 'Inbound EVP request validated',
      lead: 'Pre-clearance window and queue flush computed',
      green: 'Preempted green granted on the priority phase',
      transit: 'Vehicle confirmed through the intersection box',
      recovery: 'Interrupted phases recover (60 s guarantee)',
    },
  },
  explain: {
    TRANSITION_HOLD: 'Holding through yellow / all-red clearance.',
    HOLD_SAFETY: 'Minimum green not yet served (7 s safety floor).',
    REST_NO_COMPETING_DEMAND: 'No competing phase has demand; resting on the current green.',
    MAX_GREEN: 'Maximum green reached; serving the highest-pressure phase next.',
    HOLD_EFFICIENCY: 'Within the switching-cost window; staying green avoids lost time.',
    GAP_OUT: 'Current phase empty for the gap threshold; gap-out to the next phase.',
    RATIO: 'Competing pressure exceeds RATIO x current + FLOOR; switching pays off.',
    EVP: 'Emergency preemption is in force; the kernel holds the priority phase.',
    HOLD_NORMAL: 'Current phase retains the right of way.',
    UNKNOWN: 'Decision rule reported by the controller.',
  } as Readonly<Record<string, string>>,
  safety: {
    conflictsTitle: 'Safety Invariants (I1-I6)',
    zeroConflicts: (ticks: number) => `0 conflicts in ${ticks} ticks`,
    statusCounters: (conflicts: number, ticks: number, prevented: number) =>
      `${conflicts} conflicts in ${ticks} ticks (${prevented} violations prevented)`,
    failSafeWarning: 'FLASH_RED Fail-Safe Activated',
    recoveringNotice: 'Recovering through ALL_RED (2.0s)...',
  },
  keyboardModal: {
    title: 'Keyboard Shortcuts',
    closeBtn: 'Close (Esc)',
    shortcuts: [
      {
        key: 'Space',
        desc: 'Pause / Resume simulation',
      },
      {
        key: 'A',
        desc: 'Ambulance with preemption on the selected approach',
      },
      {
        key: 'I',
        desc: 'Blocked-lane incident on the selected approach',
      },
      {
        key: '↑ ↓ ← →',
        desc: 'Select which approach the keys and the Lab act on',
      },
      {
        key: '+ / -',
        desc: 'Raise / lower that approach by 50 veh/h (Shift: 200)',
      },
      {
        key: 'R',
        desc: 'Reset simulation to seed start',
      },
      {
        key: '1 – 4',
        desc: 'Select speed (0.5×, 1×, 5×, 20×)',
      },
      {
        key: '?',
        desc: 'Show this shortcuts dialog',
      },
      {
        key: 'Esc',
        desc: 'Stop Judge Mode / close dialogs',
      },
    ],
  },
  /** Module 31 §4: the Intersection Lab sandbox panel. */
  lab: {
    title: 'Intersection Lab',
    subtitle: 'Pick an approach, then inject traffic, incidents and emergency vehicles. Both twins get every edit at the same tick.',
    laneLabel: 'Approach:',
    laneAriaLabel: 'Target approach',
    vehicleLabel: 'Vehicle class:',
    vehicleAriaLabel: 'Vehicle class to inject',
    countLabel: 'How many:',
    countAriaLabel: 'Number of vehicles to inject',
    countOption: (n: number) => `${n} vehicle${n === 1 ? '' : 's'}`,
    actionsLabel: 'Injections and preemption',
    injectBtn: 'Inject at entry',
    midBtn: 'Place 120 m upstream',
    preemptionBtn: 'Request preemption',
    cancelPreemptionBtn: 'Cancel preemption',
    demandLabel: 'Demand on the selected approach:',
    demandAriaLabel: 'Demand in vehicles per hour',
    demandSteps: 'Steps:',
    demandDecAriaLabel: 'Lower demand by 50 vehicles per hour',
    demandIncAriaLabel: 'Raise demand by 50 vehicles per hour',
    demandInc200AriaLabel: 'Raise demand by 200 vehicles per hour',
    demandPresets: 'Presets (veh/h):',
    demandValue: (vph: number) => `${vph} veh/h`,
    incidentLabel: 'Incident:',
    incidentAriaLabel: 'Incident kind',
    incidentBtn: 'Inject incident',
    clearIncidentBtn: 'Clear incident',
    detectLabel: 'EMS detection range:',
    feedbackIdle: 'Choose an approach, or click one on the map.',
    feedbackAmbulance: (lane: string) => `Ambulance dispatched on ${lane}; preemption requested.`,
    feedbackEntry: (lane: string, n: number, type: string) => `Injected ${n} × ${type} at the ${lane} entry gate.`,
    feedbackMid: (lane: string, n: number, type: string) => `Placed ${n} × ${type} 120 m upstream on ${lane}, with no preemption.`,
    feedbackPreset: (lane: string, vph: number) => `${lane} demand set to ${vph} veh/h.`,
    feedbackCancel: 'Preemption cancelled; normal control resumed.',
    feedbackIncident: (kind: string, lane: string) => `${kind} incident injected 40 m upstream on ${lane}.`,
    feedbackIncidentCleared: (lane: string) => `Incidents cleared on ${lane}.`,
    feedbackDetect: (distanceM: number) => `EMS detection range now ${distanceM} m.`,
  },
  a11y: {
    statusPrefix: 'Traffic Status: ',
    greenAnnouncement: (phase: string, s: number) => `Phase ${phase} green for ${s} seconds.`,
    emsAnnouncement: (lane: string) => `Emergency vehicle on ${lane}, preemption active.`,
    faultAnnouncement: 'Signal controller in fail-safe flash red mode.',
    unknownPhase: 'unknown',
    // Module 32 §1/§2.2: the throttled status-region sentence. Values arrive
    // already formatted from `fmt`, so the copy stays here and the numbers come
    // from the measured store (Rule 00).
    liveStatus: (phase: string, adaptiveDelay: string, fixedDelay: string, conflicts: number, ticks: number) =>
      `Phase ${phase} active. Adaptive person-delay ${adaptiveDelay}s versus fixed ${fixedDelay}s. ${conflicts} conflicts in ${ticks} ticks.`,
  },
} as const;

