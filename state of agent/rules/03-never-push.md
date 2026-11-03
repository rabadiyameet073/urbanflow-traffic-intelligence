# Rule 03 — Never Push, Deploy or Tag (inviolable)

Agents prepare; **humans publish**. Anything that leaves the workspace or changes the outside world is a human action.

## Protocol

1. Agents never run `git push`, `git tag`, `gh release`, `gh pr create/merge`, `wrangler deploy`, `wrangler secret put`, `npm publish`, or any command that writes to a remote or production service.
2. Agents never submit Devpost forms, post to Discord/Slack, send email, or spend money/credits beyond local dry runs.
3. At task end, print the **exact commands** for the human, one per line, with the branch and expected result:
   ```bash
   git push -u origin build/urbanflow      # human runs
   wrangler deploy --env production        # human runs
   ```
4. Record `session.unpushed` (count of local commits) in `tasks.json` so the human sees what is waiting.
5. Live-service calls from agents are limited to read-only checks the task explicitly requires (e.g. `curl` health of a URL the human provided).
6. The Meta API key and any token are used by the human or by deployed secrets; agents do not request, store or print them.

## Good / Bad

| ✅ | ❌ |
|---|---|
| "Ready. Run: `git push -u origin build/urbanflow`" | Pushing "to save progress" |
| Dry-run: `wrangler deploy --dry-run` | Deploying to check it works |

## Enforcement

Agent tool permissions deny these commands; branch protection on `main`; review of hand-off messages. A push by an agent is an incident to log in `docs/AUDIT_LOG.md`.
