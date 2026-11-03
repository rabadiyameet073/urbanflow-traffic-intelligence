# Skill: folder-structure

**Use when:** Creating files or deciding where code lives.

**Read first:** `technical-architecture/34`, `system-design/10`, Rule 12

## Rules

1. Monorepo packages: `core` (pure), `web`, `edge`, `bench`, `e2e`; plus `pipeline/`, `vision/`, `docs/`, `scripts/`.
2. Dependency direction: `web`, `edge`, `bench` → `core`; `core` depends on nothing platform-specific. Enforced by dependency-cruiser.
3. Co-locate tests; name files kebab-case; `index.ts` is the package's public API.
4. No circular imports; no deep imports across packages.
5. Generated files live in `generated/` and are marked.

## Good / Bad

- ✅ `packages/core/src/control/kernel/kernel.ts` + `kernel.test.ts`
- ❌ `utils.ts` dumping ground.

## Landmines

- A helper needed by both web and edge belongs in `core` only if it is pure; otherwise duplicate minimally or create a `shared` package via ADR.
