# ADR-017: pnpm workspaces monorepo with single verification workflow
- Status: Accepted
- Date: 2026-10-31
- Deciders: UrbanFlow Architecture Team

## Context
Multi-package repositories with disparate build scripts and partial test suites lead to broken cross-package contracts, configuration drift, and unverified CI merges.

## Options
- (a) pnpm workspaces monorepo with uniform type checking, linting, and testing orchestrated via root scripts.
- (b) Multiple independent git repositories.

## Decision
Adopt option (a). All packages (`@urbanflow/core`, `@urbanflow/edge`, `@urbanflow/web`, `@urbanflow/bench`, `pipeline`) reside in a unified pnpm workspace.

## Consequences
- Positive: Atomic cross-package refactoring, shared TypeScript configurations (`tsconfig.base.json`), single verification command (`pnpm test && pnpm typecheck`).
- Negative: Monorepo tooling setup required.

## Evidence
Root `pnpm-workspace.yaml` and unified Vitest execution across all packages.

