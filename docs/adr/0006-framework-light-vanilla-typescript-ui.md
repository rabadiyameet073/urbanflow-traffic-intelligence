# ADR-006: Framework-light UI (vanilla TypeScript + tiny reactive store)
- Status: Accepted
- Date: 2026-10-31
- Deciders: UrbanFlow Architecture Team

## Context
Standard UI frameworks (React 19, Angular, Vue) introduce substantial bundle overhead (150-300 KB), virtual DOM reconciliation cycles that contend with 60 FPS Canvas rendering, and complex build tooling.

## Options
- (a) Vanilla TypeScript components with a minimal signals/observable store (< 100 LOC).
- (b) Preact (3 KB).
- (c) React 19.

## Decision
Adopt option (a). Vanilla TypeScript factory functions returning DOM elements and cleanup handles, bound to a lean observable store. Preact is designated as an escape hatch only if component complexity demands it.

## Consequences
- Positive: Tiny client bundle (under 350 KB compressed budget); zero VDOM frame drops alongside canvas operations; easily inspectable codebase.
- Negative: Manual DOM element assembly and explicit accessibility (ARIA) attributes required.

## Evidence
`packages/web` bundle builds under 120 KB gzip, sustaining 60 FPS local frame rate.

