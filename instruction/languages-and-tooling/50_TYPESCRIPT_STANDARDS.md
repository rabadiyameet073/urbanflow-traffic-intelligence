# Module 50: TypeScript Standards

> TypeScript is the primary language (`core`, `web`, `edge`, `bench`, `e2e`). The goal: make illegal states unrepresentable, keep the hot path allocation-free, and keep every file reviewable in minutes.

---

## 1. Compiler Configuration (`tsconfig.base.json`)

```jsonc
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noPropertyAccessFromIndexSignature": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "composite": true, "declaration": true, "sourceMap": true
  }
}
```

`core` additionally sets `"lib": ["ES2022"]` (**no DOM**) and `"types": []` so DOM/Node globals do not type-check — purity enforced by the compiler. `web` uses `["ES2022","DOM","DOM.Iterable","WebWorker"]` in separate tsconfigs for main thread vs worker. `edge` uses `@cloudflare/workers-types`.

---

## 2. Type Design Rules

| Rule | Example |
|---|---|
| **Unions over enums** | `type PhaseId = 'P1_NS_LEFT' \| …` derived from `as const` arrays |
| **Derive, don't duplicate** | `type LaneId = typeof LANES[number]`; `z.infer<typeof Schema>` |
| **Discriminated unions** for messages/results | `{ ok: true; value } \| { ok: false; code }` |
| **Branded types** for units that must not mix | `type Seconds = number & {__u:'s'}`; constructors validate |
| **`readonly` by default**; `as const` for tables | `Readonly<Record<LaneId, number>>` |
| **No `any`**; `unknown` + narrowing at boundaries | zod `.parse` at the edge |
| **No non-null `!`** except with a one-line justification comment | prefer a guard |
| **No type assertions (`as T`)** on external data | validate instead; assertions allowed for `as const` and test fixtures |
| **Exhaustive `switch`** with a `never` check | `assertNever(x)` |
| **Narrow public API** | Export the minimum; `index.ts` is the contract |
| **`satisfies`** to check literals without widening | `const T = {…} as const satisfies Record<…>` |
| **Result types for expected failures**, exceptions for bugs | parsing/IO return `Result`; invariant breaks throw `SafetyViolationError` |

```ts
export function assertNever(x: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(x)}`);
}
```

---

## 3. Purity & Determinism Rules (`core`)

- No `Math.random`, `Date`, `performance`, timers, DOM, `fetch`, `crypto`, Node APIs. (ESLint + tsconfig enforce.)
- No module-level mutable state; factories take their dependencies (`rng`, `config`).
- No `Math.pow/exp/log/sin/cos` in simulation paths (module 20); use `helpers/rng.ts` `detLn`.
- Iteration order explicit: indexed `for` loops over fixed arrays.
- Pure functions return new values; mutation allowed **only** inside designated hot-loop modules that document it.

---

## 4. Hot-Path Style (`sim/`, `metrics/` inner loops)

```ts
// ✅ allocation-free: typed arrays, indexed loops, locals hoisted
for (let i = 0; i < n; i++) {
  const gap = posAhead[i]! - pos[i]! - lenAhead[i]!;     // `!` justified: i < n invariant
  …
}
// ❌ forEach/map/reduce/spread/object literals/closures in the tick
```

Justified `!` on typed-array reads in hot loops is allowed when `i < n` is the loop bound (add a file-level comment once, not per line). Everywhere else follow the rules above.

---

## 5. Errors & Async

- Custom error classes extend `Error` with a `code` string; never throw strings.
- `async` functions: handle rejections (`@typescript-eslint/no-floating-promises`); every `await fetch` has an `AbortSignal` timeout.
- No `Promise` constructor anti-patterns; no `async` without `await`; no mixing callbacks and promises.
- Cancellation via `AbortController`; cleanup in `finally`.
- Worker messages: validate with zod in dev, discriminated-union `switch` with `assertNever`.

---

## 6. Modules & Imports

- ESM only. Named exports (default exports only for Worker entry and Vite config where required).
- Path aliases avoided inside a package (use relative); cross-package via workspace names (`@urbanflow/core`).
- Import order: node/web built-ins → external → workspace → relative (enforced by ESLint `import/order` or `simple-import-sort`).
- `import type` for type-only imports (`verbatimModuleSyntax`).
- No barrel files that re-export everything (cause cycles and bundle bloat); `index.ts` exports a deliberate public API only.

---

## 7. Naming & Style

| Thing | Convention |
|---|---|
| Files | `kebab-case.ts`; tests `*.test.ts`; types in `contracts.ts` or `types.ts` |
| Types/interfaces | `PascalCase`; no `I` prefix |
| Functions/variables | `camelCase`; verbs for functions (`computePressure`) |
| Constants | `UPPER_SNAKE_CASE` for true constants (`G_MIN_S`); units in names (`laneLengthM`, `yellowS`, `speedMps`) |
| Booleans | `is/has/can/should` prefix |
| Reason/error codes | `UPPER_SNAKE` string-literal unions |
| Private | `#private` fields or module scope; avoid `private` keyword for runtime privacy |

**Units in names** (`…S`, `…M`, `…Mps`, `…Vph`, `…MicroUsd`) are mandatory for numeric domain values — unit bugs are the most likely silent defect in this codebase.

Formatting is Prettier's job (single quotes, trailing commas, 100 cols); never debate it in review.

---

## 8. Comments & Docs

- JSDoc on every exported symbol: purpose, units, invariants, `@throws`.
- Comments explain **why**, not what. Reference ADR/rule numbers (`// Rule 06: only the kernel writes SignalState`).
- `TODO` forbidden without an issue/test marked `.todo`; `FIXME` forbidden on main.

---

## 9. Testing Conventions (see module 60)

- Colocate unit tests (`foo.test.ts`); property tests use `fast-check` with explicit seeds logged on failure.
- Test names state behaviour: `it('never grants conflicting greens under random requests')`.
- No `any` in tests; fixtures typed via `satisfies`.
- Snapshot tests only for contracts, templates and wire formats — never for floating-point simulation output.

---

## 10. Dependency Policy (TS side)

Approved runtime deps (extend only via PR + ADR if > 5 KB gz): `zod`, `uPlot`, `kafkajs` (bench/producer only), `@cloudflare/workers-types` (dev). Dev: `typescript`, `vitest`, `fast-check`, `@playwright/test`, `@axe-core/playwright`, `eslint`, `typescript-eslint`, `prettier`, `size-limit`, `dependency-cruiser`, `wrangler`, `vite`. Anything else: justify size, maintenance, licence, install scripts.

---

## 11. Anti-Patterns

| ❌ | ✅ |
|---|---|
| `enum Phase {…}` | string-literal union from a const array |
| `const x = JSON.parse(s) as Config` | `ConfigSchema.parse(JSON.parse(s))` |
| `let speed: number` (what unit?) | `speedMps` / branded type |
| `catch (e) { /* ignore */ }` | handle, log with code, or rethrow |
| `Object.keys(map).forEach` in logic | explicit ordered arrays |
| Exporting everything "just in case" | minimal public API |
| `// @ts-ignore` | `// @ts-expect-error <reason>` only in tests |
