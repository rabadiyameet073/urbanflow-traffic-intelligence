# Skill: degradation-seams

**Use when:** Adding any feature that depends on an optional service (Edge, AI, pipeline, vision).

**Read first:** `system-design/13`, `system-design/10`, Rule 15

## Rules

1. Every optional capability sits behind an interface with a null/template implementation.
2. The UI shows the current mode and why (e.g. 'AI: template fallback').
3. Core mode must run fully offline; tests cover each rung.
4. A cut feature (Rule 15) leaves the seam in place and the doc honest.
5. Feature flags are build-time constants plus a runtime health check.

## Good / Bad

- ✅ `copilot = health.ai ? metaCopilot : templateCopilot`
- ❌ Throwing when the Worker is unreachable.

## Landmines

- Seams rot unless a test exercises the fallback every CI run.
