# Skill: observability

**Use when:** Adding logs, metrics, health or debug tooling.

**Read first:** `system-design/16`, Rule 10

## Rules

1. Structured JSON logs: `ts, level, code, requestId, component, msg`; no secrets or payload bodies.
2. Metrics: counters and histograms with bounded labels.
3. `/api/health` returns versions, dependency status and degradation level.
4. Debug bundle exports sim seed, config, last N decisions and recent errors for bug reports.
5. Sim decisions form an explainable ledger shown in the UI.
6. Log levels per module 16; no `console.log` in shipped code.

## Good / Bad

- ✅ `log.warn({code:'AI_FALLBACK', provider:'template'})`
- ❌ Logging request bodies.

## Landmines

- Unbounded label cardinality can exhaust free-tier metrics.
