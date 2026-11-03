# Skill: technical-writing

**Use when:** Writing or editing any documentation.

**Read first:** `languages-and-tooling/56`, Rule 16

## Rules

1. Name the reader and goal in the first paragraph.
2. Show runnable commands with expected output.
3. Link to the enforcing code/test; generate numbers.
4. Active voice, short sentences, defined terms, no superlatives.
5. Update docs in the same commit as behaviour.

## Good / Bad

- ✅ 'Run `pnpm verify`; expect exit 0.'
- ❌ 'Blazing fast, production-ready.'

## Landmines

- Docs that cannot be run from a clean clone are bugs.
