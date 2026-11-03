# Skill: state-store

**Use when:** Adding UI state, derived values, or subscriptions.

**Read first:** `technical-architecture/30`, `languages-and-tooling/50`

## Rules

1. A tiny signals store: `signal`, `computed`, `effect`; single store per concern.
2. Sim state is not in the store; the store holds the latest *view* (frame summary, KPIs, UI toggles).
3. Derived values are computed lazily and memoised; effects clean up listeners.
4. State changes are explicit functions (`actions.ts`), not scattered assignments.
5. Persisted state (theme, last scenario) is whitelisted and versioned.
6. Share-link state is a serialisable subset with a schema.

## Good / Bad

- ✅ `const kpi = computed(() => summarise(frame.value))`
- ❌ Global mutable objects mutated from event handlers.

## Landmines

- Effects that write signals can loop; guard with equality checks.
- Never store non-serialisable objects in persisted state.
