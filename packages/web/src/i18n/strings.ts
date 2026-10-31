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
  header: {
    spawnAmbulance: '🚑 Spawn ambulance',
    watchJudgeDemo: '▶ Watch 90-second demo',
    themeToggle: '◑ Theme',
    pauseLabel: 'Pause Simulation',
    resumeLabel: 'Resume Simulation',
    scenarioSelectLabel: 'Select Scenario',
    speedControlsLabel: 'Simulation speed controls',
    helpShortcuts: '? Shortcuts',
  },
  twins: {
    fixedTitle: 'Fixed-Time Baseline (90s Cycle)',
    adaptiveTitle: 'UrbanFlow Adaptive Controller',
    badgeAi: 'Muse Spark',
    canvasAriaLabel: 'Top-down view of a four-way intersection with eight approach lanes.',
    tableToggle: 'Toggle Lane Data Table',
  },
  kpis: {
    personDelay: 'Person-Delay',
    personDelayHelp: 'Weighted average delay per human passenger across all vehicle modes',
    avgDelay: 'Average Delay',
    throughput: 'Throughput',
    emsDelay: 'EMS Preemption Delay',
    lowerBetter: 'lower is better',
    higherBetter: 'higher is better',
    fixedPrefix: 'Fixed: ',
  },
  copilot: {
    title: 'Meta AI Copilot (Muse Spark)',
    placeholderPrompt: 'Ask the Copilot about bottleneck lanes, congestion causes, or preemption plans...',
    diagnoseBtn: 'Diagnose Bottlenecks',
    clearBtn: 'Clear',
    proposeBanner: 'Advisory Proposal (Requires Operator Approval & Kernel Pass)',
    approveBtn: 'Approve & Apply',
    rejectBtn: 'Reject',
    sourceMeta: 'Meta Muse Spark 1.3',
    sourceWorkersAi: 'Workers AI (Llama)',
    sourceTemplate: 'Template Fallback',
    advisoryNotice: 'AI advises, never controls. All recommendations require Safety Kernel dry-run and operator approval.',
  },
  safety: {
    conflictsTitle: 'Safety Invariants (I1-I6)',
    zeroConflicts: (ticks: number) => `● 0 conflicts in ${ticks} ticks`,
    failSafeWarning: 'FLASH_RED Fail-Safe Activated',
    recoveringNotice: 'Recovering through ALL_RED (2.0s)...',
  },
  keyboardModal: {
    title: 'Keyboard Shortcuts',
    closeBtn: 'Close (Esc)',
    shortcuts: [
      { key: 'Space', desc: 'Pause / Resume simulation' },
      { key: 'A', desc: 'Spawn ambulance on selected approach' },
      { key: 'I', desc: 'Open incident injection dialog' },
      { key: 'R', desc: 'Reset simulation to seed start' },
      { key: '1 – 4', desc: 'Select speed (0.5×, 1×, 5×, 20×)' },
      { key: '← / → / ↑ / ↓', desc: 'Select approach lane' },
      { key: '+ / −', desc: 'Adjust lane demand (Shift = ×4)' },
      { key: '?', desc: 'Show this shortcuts dialog' },
      { key: 'Esc', desc: 'Close dialogs, drawers or Judge Mode' },
    ],
  },
  a11y: {
    statusPrefix: 'Traffic Status: ',
    greenAnnouncement: (phase: string, s: number) => `Phase ${phase} green for ${s} seconds.`,
    emsAnnouncement: (lane: string) => `Emergency vehicle on ${lane}, preemption active.`,
    faultAnnouncement: 'Signal controller in fail-safe flash red mode.',
  },
} as const;
