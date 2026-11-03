/**
 * Module 25 §6: held-out regression gate.
 *
 * Adaptive must not be more than 5 % worse than fixed on person-delay (point
 * estimate) in any scenario on a fixed small seed set — 10 seeds × 20 simulated
 * minutes, the CI-sized variant the module prescribes. The full 50-seed
 * held-out run stays a release step.
 *
 * It is opt-in (`pnpm test:regression` or URBANFLOW_REGRESSION=1) because the
 * 8 × 10 × 2 controller-minute sweep takes minutes, not seconds — the default
 * vitest run must stay fast. A failure here is the gate doing its job: fix the
 * controller or disclose the loss in `docs/LIMITATIONS.md`, never the threshold.
 *
 * `stadium-dump` carries the pre-existing disclosed 12.3 % loss (LIMITATIONS
 * §11); the gate pins that known loss and fails only on *new* degradation
 * beyond it — hiding the exception would be cherry-picking in reverse.
 */
import { describe, expect, it } from 'vitest';
import { SCENARIO_LIBRARY } from '@urbanflow/core';
import { runPairedScenario } from '../src/runner.js';

const GATE_SEEDS = Array.from({ length: 10 }, (_, i) => 5001 + i);
const GATE_DURATION_S = 1200; // 20 simulated minutes
const WORSE_LIMIT_PCT = 5;

// Measured and disclosed in docs/LIMITATIONS.md item 11; pinned, not forgiven.
const KNOWN_LOSSES: Record<string, number> = {
  'stadium-dump': 12.3,
};

const suite = process.env.URBANFLOW_REGRESSION === '1' ? describe : describe.skip;

suite('Module 25 §6 — regression gate (10 seeds × 20 sim-min)', () => {
  for (const scenario of SCENARIO_LIBRARY) {
    it(`${scenario.id}: adaptive not > ${WORSE_LIMIT_PCT}% worse than fixed`, () => {
      const res = runPairedScenario(scenario, GATE_SEEDS, GATE_DURATION_S);
      const rel = res.metrics.personDelayS.relPct; // positive = adaptive faster
      const allowedWorse = Math.max(WORSE_LIMIT_PCT, KNOWN_LOSSES[scenario.id] ?? 0);
      expect(rel, `${scenario.id} person-delay relative % (negative = adaptive loses)`).toBeGreaterThanOrEqual(
        -allowedWorse,
      );
      // Integrity is never optional: conflicts must stay at zero, conservation must hold.
      expect(res.integrity.kernelConflicts).toBe(0);
      expect(res.integrity.conservationOk).toBe(true);
    });
  }
});
