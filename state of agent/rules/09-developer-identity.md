# Rule 09 — Developer Identity (inviolable)

Public repositories, docs and commits must not leak personal data, and agents must not invent or alter identity.

## Protocol

1. Identity in the repo uses **placeholders** until the human fills them: `<DEVELOPER_NAME>`, `<DEVELOPER_EMAIL>`, `<GITHUB_HANDLE>`. Agents never guess them.
2. Personal email addresses or account identifiers known to an agent (from session context) are used only to identify the user, never written into committed files, docs, prompts, headers or logs.
3. Agents never run `git config user.*` or change global git identity; commits use whatever the human configured.
4. `CODEOWNERS`, `SECURITY.md`, LICENSE and package metadata use the human's chosen public handle once provided.
5. Do not include real names, faces, phone numbers or addresses of third parties in docs, datasets or screenshots. Camera/vision samples are synthetic or properly licensed; no identifiable people or licence plates.
6. Credits in `docs/CREDITS.md` name tools/models/datasets, not private individuals, unless they asked to be credited.

## Good / Bad

| ✅ | ❌ |
|---|---|
| `Maintainer: <GITHUB_HANDLE>` | Embedding a personal gmail in SECURITY.md |
| Synthetic scenes, generated plates blurred | Real street photos with people |

## Enforcement

`audit.sh` A6 (extend with the human's email once known), gitleaks, review checklist; human fills placeholders before submission (`pending-component-work.md`).
