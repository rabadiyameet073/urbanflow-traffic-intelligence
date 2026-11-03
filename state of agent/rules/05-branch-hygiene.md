# Rule 05 — Branch Hygiene (inviolable)

`main` is always demo-able. Work happens on short-lived branches.

## Protocol

1. Never commit directly to `main`. Work on `build/urbanflow` (integration) or `task/Tn-slug` branches off it.
2. Branch from an up-to-date base; rebase/merge locally as needed before the human merges.
3. Names: `task/T3-safety-kernel`, `fix/evp-eta-rounding`, `docs/safety-case`. Lowercase, kebab-case, task ID first.
4. One task per branch where practical; keep branches < 3 days old.
5. Before handing off: `git fetch`, check divergence, report `session.tip` and `session.unpushed`.
6. Do not delete branches you did not create. Do not switch branches with uncommitted changes (commit or stash with a note).
7. After the feature freeze, only `fix/*`, `docs/*`, `submission/*` branches are allowed (Rule 15).
8. `submission-v1` tag points to a commit reachable from `main` and is created by the human.

## Good / Bad

| ✅ | ❌ |
|---|---|
| `task/T4-evp` with 6 small commits | `work` branch with 80 mixed commits |
| Report "branch build/urbanflow, tip a1b2c3d, 4 unpushed" | Unknown state at hand-off |

## Enforcement

Branch protection on `main`; naming check in CI; hand-off block validated by `validate-pack.mjs`.
