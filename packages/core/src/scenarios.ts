/**
 * Module 25: Reference Scenario Library
 * 8 standard evaluation scenarios for paired-seed benchmarking.
 */
import { SimConfig, DEFAULT_SIM_CONFIG, LaneId } from './contracts.js';

export interface BenchmarkScenario {
  id: string;
  name: string;
  story: string;
  expectation: 'parity' | 'adaptive-wins' | 'adaptive-gte-parity';
  buildConfig: (seed: number) => Partial<SimConfig>;
  setupIncidents?: (simTimeS: number) => Array<{
    lane: LaneId;
    kind: 'BLOCKED' | 'CAPACITY_DROP' | 'DOUBLE_PARKED';
    positionM: number;
    triggerS: number;
    durationS?: number;
  }>;
}

export const SCENARIO_LIBRARY: readonly BenchmarkScenario[] = [
  {
    id: 'balanced-parity',
    name: 'Balanced Parity',
    story: 'Steady balanced flow across all approaches (TR 450 / L 150 veh/h)',
    expectation: 'parity',
    buildConfig: (seed) => ({
      seed,
      durationS: 3600,
      laneDemandVph: {
        'NB-TR': 450, 'NB-L': 150,
        'SB-TR': 450, 'SB-L': 150,
        'EB-TR': 450, 'EB-L': 150,
        'WB-TR': 450, 'WB-L': 150,
      },
    }),
  },
  {
    id: 'balanced-high',
    name: 'Balanced High Traffic',
    story: 'Heavy balanced peak flow across all approaches (TR 700 / L 200 veh/h)',
    expectation: 'parity',
    buildConfig: (seed) => ({
      seed,
      durationS: 3600,
      laneDemandVph: {
        'NB-TR': 700, 'NB-L': 200,
        'SB-TR': 700, 'SB-L': 200,
        'EB-TR': 700, 'EB-L': 200,
        'WB-TR': 700, 'WB-L': 200,
      },
    }),
  },
  {
    id: 'near-saturation',
    name: 'Near Saturation',
    story: 'Peak demand near theoretical capacity limit (TR 1000 / L 300 veh/h)',
    expectation: 'adaptive-gte-parity',
    buildConfig: (seed) => ({
      seed,
      durationS: 3600,
      laneDemandVph: {
        'NB-TR': 1000, 'NB-L': 300,
        'SB-TR': 1000, 'SB-L': 300,
        'EB-TR': 1000, 'EB-L': 300,
        'WB-TR': 1000, 'WB-L': 300,
      },
    }),
  },
  {
    id: 'light-night',
    name: 'Light Night Traffic',
    story: 'Sparse night flows where fixed cycle wastes green on empty lanes (TR 200 / L 60)',
    expectation: 'adaptive-wins',
    buildConfig: (seed) => ({
      seed,
      durationS: 3600,
      laneDemandVph: {
        'NB-TR': 200, 'NB-L': 60,
        'SB-TR': 200, 'SB-L': 60,
        'EB-TR': 200, 'EB-L': 60,
        'WB-TR': 200, 'WB-L': 60,
      },
    }),
  },
  {
    id: 'ns-heavy-tide',
    name: 'North-South Heavy Tide',
    story: 'Severe directional imbalance representing morning arterial commute (NS 800 / EW 150)',
    expectation: 'adaptive-wins',
    buildConfig: (seed) => ({
      seed,
      durationS: 3600,
      laneDemandVph: {
        'NB-TR': 800, 'NB-L': 250,
        'SB-TR': 800, 'SB-L': 250,
        'EB-TR': 150, 'EB-L': 50,
        'WB-TR': 150, 'WB-L': 50,
      },
    }),
  },
  {
    id: 'stadium-dump',
    name: 'Stadium Surge Dump',
    story: 'Surge outflow on Eastbound approach from sports event (EB 1500 veh/h)',
    expectation: 'adaptive-wins',
    buildConfig: (seed) => ({
      seed,
      durationS: 3600,
      laneDemandVph: {
        'NB-TR': 300, 'NB-L': 100,
        'SB-TR': 300, 'SB-L': 100,
        'EB-TR': 1500, 'EB-L': 400,
        'WB-TR': 300, 'WB-L': 100,
      },
    }),
  },
  {
    id: 'mixed-uneven',
    name: 'Mixed Uneven',
    story: 'Asymmetric demand across all four quadrants',
    expectation: 'adaptive-wins',
    buildConfig: (seed) => ({
      seed,
      durationS: 3600,
      laneDemandVph: {
        'NB-TR': 650, 'NB-L': 200,
        'SB-TR': 350, 'SB-L': 100,
        'EB-TR': 750, 'EB-L': 250,
        'WB-TR': 200, 'WB-L': 50,
      },
    }),
  },
  {
    id: 'blocked-lane-incident',
    name: 'Blocked Lane Incident',
    story: 'Lane blockage incident on NB-TR causing acute local queue buildup',
    expectation: 'adaptive-gte-parity',
    buildConfig: (seed) => ({
      seed,
      durationS: 3600,
      laneDemandVph: {
        'NB-TR': 500, 'NB-L': 150,
        'SB-TR': 500, 'SB-L': 150,
        'EB-TR': 500, 'EB-L': 150,
        'WB-TR': 500, 'WB-L': 150,
      },
    }),
    setupIncidents: () => [
      {
        lane: 'NB-TR',
        kind: 'BLOCKED',
        positionM: 50.0,
        triggerS: 600.0, // starts at t = 10 min
        durationS: 600.0, // lasts 10 min
      },
    ],
  },
];

