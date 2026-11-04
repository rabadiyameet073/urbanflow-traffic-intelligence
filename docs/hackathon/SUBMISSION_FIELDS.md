# Hackathon Submission Checklist & Portal Fields

Every portal field below is a statement that will be read by a judge. Fields that
are not yet true are marked **PENDING** rather than filled with a target value.

- **Track:** Indie Developer Track
- **Project Title:** UrbanFlow AI
- **Tagline:** Adaptive traffic-signal intelligence with a formal safety kernel,
  emergency-vehicle preemption, and an advisory-only Meta AI copilot
- **Themes:** Build for Your World & Push the Frontier
- **Live Demo URL:** **PENDING** — no deployment has been performed. The intended
  Pages project name is `urbanflow-ai`. Do not paste a URL until
  `bash scripts/smoke-live.sh --url <url>` exits 0 and its output is filed in
  `docs/validation/AUDIT_LOG.md`.
- **Local preview:** `pnpm --filter @urbanflow/web dev` → `http://localhost:5173`
- **Video Link:** **PENDING** — script complete in
  [DEMO_SCRIPT.md](DEMO_SCRIPT.md); recording not done. Hard limit 3:00, captions
  on, must play logged out.
- **GitHub Repository:** **PENDING** — repository must be public, MIT licensed
  (see [../LICENSE](../../LICENSE)), and `gitleaks detect --log-opts=--all` clean
  before the history is published.
- **Git tag:** `submission-v1`, created by a human after the audit is complete.

## Meta AI Tools Utilized

| Tool | Role | Honest scope |
|---|---|---|
| Muse Spark (Model API) | Operational bottleneck diagnosis, phase explanation, advisory text | Runtime, optional — the copilot degrades to a deterministic template when it is unavailable |
| Llama via Workers AI | Fallback model tier | Runtime, optional |
| SAM 3.1 | Offline lane-polygon and stop-line masks | **Offline asset generation.** No detector was trained or evaluated; see [LIMITATIONS.md](../validation/LIMITATIONS.md) |
| Muse Image | Offline synthetic weather fixtures (rain, fog, low sun, snow) | **Offline.** No precision or recall figure is published, because none was measured |
| Muse Code | Development workflow (implementation, differential checks, review) | Development-time only; see [muse-prompts/06-codegen.md](../muse-prompts/06-codegen.md) |

## Numbers to Use

Use only the table in [RESULTS.md](../validation/RESULTS.md) §2 and §3. The supported summary
sentence is:

> On five held-out seeds, adaptive control was never significantly worse than
> fixed-time and was significantly better in 4 of 8 scenarios (95 % bootstrap
> CI excluding zero), while discharging more vehicles in 8 of 8.

Do not shorten this to a single percentage. Do not describe the simulation as
deployed, certified, or production-ready. <!-- AUDIT-OK(A12): names the claim to forbid it -->

## Pre-Submit Gate

```bash
pnpm verify
bash scripts/smoke-live.sh --url "$LIVE_URL"   # after deployment only
node scripts/docs-check.mjs
```

- [ ] 20-point checklist in [../specs/instruction/quality-and-audits/61_PREFLIGHT_AUDIT_CHECKLIST.md](../specs/instruction/quality-and-audits/61_PREFLIGHT_AUDIT_CHECKLIST.md) complete
- [ ] Every number in the README, video and form text appears in `results.json`
- [ ] Simulation-only disclaimer on the README, the UI footer, and the video
- [ ] Submitted at least 6 hours before the deadline (target 3 hours earlier again)
