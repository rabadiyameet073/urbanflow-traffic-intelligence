# ADR-018: Vitest + fast-check + Playwright + pytest
- Status: Accepted
- Date: 2026-10-31
- Deciders: UrbanFlow Architecture Team

## Context
Safety-critical simulation and control systems demand automated verification at multiple layers: invariant property checking, unit execution, browser UI rendering, and PySpark data streaming.

## Options
- (a) Vitest (ESM native) + fast-check (property testing) + Playwright (browser e2e) + pytest (PySpark streaming).
- (b) Jest + Selenium.

## Decision
Adopt option (a). Use fast native Vitest for TypeScript unit and integration testing, fast-check for invariant property sweeps over millions of ticks, Playwright for web E2E, and pytest for Python pipeline components.

## Consequences
- Positive: Sub-second test execution, native ESM and TypeScript support, cohesive developer experience.
- Negative: Dual-language test runner environment (Node + Python).

## Evidence
Test suites in `packages/*/test` and `pipeline/spark/tests`.

