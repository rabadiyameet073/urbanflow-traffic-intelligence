# Rule 01 — Git Hygiene (inviolable)

History is evidence (judges and future sessions read it). Keep it precise, small and attributable.

## Protocol

1. **Stage explicit paths only:** `git add path/a path/b`. Never `git add .`, `-A`, or `-a` commits.
2. Before every commit: `git status` and `git diff --staged`; no strays, no generated junk, no secrets.
3. **Conventional commits:** `type(scope): summary` (types: `feat fix docs test refactor perf build ci chore`), imperative, ≤ 72 chars, body explains *why* and how it was verified.
4. One logical change per commit; the tree is green after each (`pnpm verify`) or the commit says why not.
5. **Attribution lines** (when the session provides them) end every commit message and PR description exactly as given by the environment reminder, e.g.:
   ```
   Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
   Claude-Session: <session-url>
   ```
   Do not invent attribution lines; do not add ones the reminder omits.
6. Never rewrite published history (`push --force`, `reset --hard` on shared branches). Local, unpushed fixups are fine.
7. Never commit: `.env*` (except `.env.example`), keys, tokens, model weights, large binaries, `node_modules`, Docker volumes, `data/lake` contents.
8. Developer identity in commits uses the human's configured git identity — agents never edit `git config` (Rule 09).
9. Tags and releases are created by the human (Rule 03).

## Good / Bad

| ✅ | ❌ |
|---|---|
| `git add packages/core/src/control/kernel/*.ts packages/core/test/kernel.prop.test.ts` | `git add .` |
| `feat(kernel): enforce all-red clearance on EVP preemption` | `update stuff` |
| Commit contains code + test + doc + tasks.json together | Docs "later" |

## Enforcement

`gitleaks` pre-commit/CI; commitlint in CI; review checklist; `audit.sh` A6; CODEOWNERS for sensitive paths.
