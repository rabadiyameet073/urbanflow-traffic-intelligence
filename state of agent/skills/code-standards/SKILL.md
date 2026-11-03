# Skill: code-standards

**Use when:** Writing or reviewing any TypeScript, JS, CSS or HTML.

**Read first:** `languages-and-tooling/50`, `languages-and-tooling/51`, `quality-and-audits/63`

## Rules

1. Follow module 50 type rules: no `any`, no unvalidated `as`, exhaustive switches, units in names.
2. Keep functions small and single-purpose; prefer pure functions.
3. Comments explain why and cite rule/ADR/invariant IDs.
4. Errors have codes; no swallowed exceptions.
5. Prettier and ESLint are authoritative; do not hand-format.

## Good / Bad

- ✅ `speedMps`, `assertNever(x)`
- ❌ `let s: any = JSON.parse(raw)`

## Landmines

- Hot-loop `!` on typed arrays is allowed only with the file-level justification comment.
