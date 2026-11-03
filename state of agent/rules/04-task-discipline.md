# Rule 04 — Task Discipline (inviolable)

`tasks.json` is the source of truth. Work that is not tracked is lost at the next context reset.

## Protocol

1. Start every session from `tasks.json` (`session.next_up`, `pending_verifications`), not from memory or chat.
2. **One `in_progress` task at a time.** Set it before coding; set `done` only when every acceptance criterion has recorded evidence.
3. Update `tasks.json` in the **same commit** as the work: status, `evidence`, `summary` counts, `session.*`.
4. New scope → new task (next free ID). Never hide scope in `notes` or in code comments.
5. Blocked ≥ 2 attempts → status `blocked` with what/why/since; move to the next dependency-free task.
6. Respect `depends_on` and `cut_tier` (Rule 15). Do not start P2 work while any P0 is not `done`.
7. At session end write the hand-off block (branch, tip, unpushed, next_up, pending_verifications, last_updated, updated_by).
8. Never edit another session's evidence entries; append corrections.

## Good / Bad

| ✅ | ❌ |
|---|---|
| `"evidence": ["pnpm verify green @a1b2c3d (214 tests)"]` | `"done"` with no evidence |
| T3 `done` → pick T4 (deps met) | Starting T11 because it looks fun |

## Enforcement

`validate-pack.mjs` (counts, ID uniqueness, dependency cycles, status values); CI check; review checklist item "tasks.json updated".
