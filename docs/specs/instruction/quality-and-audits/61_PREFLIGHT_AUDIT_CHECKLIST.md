# Module 61: Pre-Flight Audit Checklist

> Run before every merge to `main` (Section 1), before every deploy (Section 2), and before submission (Section 3). Every box is checkable by a command or an observation; "I think so" is a fail.

---

## 1. Per-Commit / Per-PR Gate

```bash
pnpm verify          # typecheck + lint + unit + property + BFS + differential + docs:check + size
bash helpers/audit.sh   # grep audits (module 62)
```

- [ ] `pnpm verify` exits 0.
- [ ] `audit.sh` exits 0 (no forbidden patterns).
- [ ] New/changed behaviour has tests (bug fix has a regression test).
- [ ] Docs updated in the **same commit** where behaviour/contract changed (Rule 16).
- [ ] `tasks.json` updated (status, session block) (Rule 04).
- [ ] Only explicit paths staged; `git status` clean of strays (Rule 01).
- [ ] Commit message conventional; attribution lines present.
- [ ] No secrets, tokens, personal data in diff (`gitleaks` clean).
- [ ] Contracts untouched, or the change followed the module 02 procedure.
- [ ] Bundle budget respected (`pnpm size`).

## 2. Per-Deploy Gate

```bash
pnpm build && pnpm e2e && pnpm perf
bash scripts/smoke-live.sh --url "$LIVE_URL"
```

- [ ] E2E (E1–E10) green; visual diffs reviewed by a human.
- [ ] axe: zero serious/critical; keyboard pass done.
- [ ] Lighthouse ≥ 85 performance / ≥ 95 a11y / ≥ 95 best-practices (mobile profile) on the **deployed** URL.
- [ ] Security headers present (CSP, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) — verified with `curl -I`.
- [ ] `/api/health` reports expected versions; `degraded` states explained.
- [ ] Secrets set via `wrangler secret`, not in repo/vars.
- [ ] Rollback command known and tested once.
- [ ] Meta API spend within cap; Cloudflare usage within free limits 🔎.

## 3. Pre-Submission Gate (Nov 3–4)

### 3.1 The 20-Point Submission Checklist

| # | Check | Evidence |
|---|---|---|
| 1 | Project registered on Devpost under the correct track (Indie) | Screenshot/URL |
| 2 | Public GitHub repo, MIT licence, README complete | URL |
| 3 | Live URL loads from a clean browser profile and a phone | Smoke log |
| 4 | Demo video ≤ 3 min, public/unlisted link works logged-out | URL |
| 5 | Video contains **only measured** numbers (match `results.json`) | Diff check |
| 6 | `results.json` + `docs/RESULTS.md` generated from the tagged commit | Hashes |
| 7 | `pnpm fresh-clone` passes (clone → install → verify → build) | Log |
| 8 | Safety case and test report current | Dates/commit |
| 9 | LIMITATIONS lists every simulated/assumed/unmeasured item | File |
| 10 | Meta tools evidence: Muse prompt log (`docs/muse-prompts/`), screenshots, honest failures | Files |
| 11 | Meta API usage documented, within credits | `META_API_NOTES.md` |
| 12 | Vision outputs include model/version/prompt/seed; licences credited | Files |
| 13 | CREDITS.md complete (deps, fonts, datasets, models) | File |
| 14 | No secrets in repo history (`gitleaks detect --log-opts=--all`) | Report |
| 15 | Accessibility statement + evidence | Docs |
| 16 | Pipeline: `make demo` works in Lite mode on a clean machine | Log |
| 17 | Rubric mapping table in README (criterion → evidence) | README |
| 18 | `submission-v1` git tag created by a human | Tag |
| 19 | Submitted **≥ 6 hours before** the deadline (Nov 4, 9 PM ET) → target Nov 4 3 PM ET | Timestamp |
| 20 | Second person (or a fresh session) performed the Judge Q&A dry run | Notes |

### 3.2 Claims Audit

- [ ] Every number in README/video/Devpost text appears in `results.json` or a stated assumption.
- [ ] No sentence says "production-ready", "deployed to real intersections", "guaranteed safe".
- [ ] Simulation-only disclaimer present on README, UI footer and video.
- [ ] Comparison baselines described honestly (what Fixed and Adaptive actually are).
- [ ] Held-out seeds used for all headline numbers; train seeds disclosed.

### 3.3 Freeze Discipline (after Mon Nov 2 night)

- [ ] Only bug fixes, docs, video, submission materials.
- [ ] No dependency bumps except security.
- [ ] Every post-freeze commit has a task entry explaining why.

---

## 4. Audit Evidence Log

Keep `docs/AUDIT_LOG.md` (generated/appended): date, gate, commit, result, auditor (human/agent), notes. A failed gate gets a row too.

---

## 5. Anti-Patterns

| ❌ | ✅ |
|---|---|
| "I ran it earlier" | Re-run on the tagged commit |
| Checking the box without evidence | Link/command output |
| Submitting in the last hour | Target T-6h; use remaining time for buffer |
| Fixing a failed gate by skipping it | Fix the cause or record the exception |
