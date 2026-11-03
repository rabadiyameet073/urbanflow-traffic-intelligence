# Skill: ci-cd-deployment

**Use when:** Editing CI workflows, build scripts or deployment steps.

**Read first:** `technical-architecture/34`, `quality-and-audits/61`, Rule 03

## Rules

1. CI jobs: verify, e2e, perf, docs, security (gitleaks, audit, licences), pipeline-lite.
2. Pin actions; cache pnpm store; fail fast; upload artefacts (reports, traces).
3. Deploy steps are human-run commands in `docs/DEPLOY.md`; agents prepare and dry-run only.
4. Smoke test the deployed URL; keep a rollback command.
5. Backup hosting on GitHub Pages; recorded offline demo video as insurance.

## Good / Bad

- ✅ `pnpm install --frozen-lockfile`
- ❌ Auto-deploy from agent sessions.

## Landmines

- Preview deployments can leak work in progress; keep the repo public only when ready 🔎.
