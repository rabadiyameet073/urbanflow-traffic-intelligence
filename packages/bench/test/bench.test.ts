import { describe, it, expect } from 'vitest';
import { runPairedScenario } from '../src/runner.js';
import { SCENARIO_LIBRARY } from '@urbanflow/core';

describe('Benchmarking & Paired Statistics (Module 25)', () => {
  it('runs paired-seed comparison with reproducible bootstrap confidence intervals', () => {
    const scenario = SCENARIO_LIBRARY.find((s) => s.id === 'ns-heavy-tide')!;
    const res = runPairedScenario(scenario, [1001, 1002], 300); // 5 sim-minutes

    expect(res.id).toBe('ns-heavy-tide');
    expect(res.integrity.conservationOk).toBe(true);
    expect(res.integrity.kernelConflicts).toBe(0);
    expect(Number.isFinite(res.metrics.personDelayS.fixed)).toBe(true);
    expect(Number.isFinite(res.metrics.personDelayS.adaptive)).toBe(true);
    expect(res.metrics.personDelayS.diffCI95[0]).toBeLessThanOrEqual(res.metrics.personDelayS.diffCI95[1]);
  });
});
