# Rule 15 — Feature Freeze and Cut Line (inviolable)

The deadline is fixed (Wed 2026-11-04, 21:00 ET; target submission ≤ 15:00 ET). Scope bends; quality and honesty do not.

## Protocol

1. **Feature freeze: Mon 2026-11-02, night.** After it: bug fixes, tests, docs, video and submission only. No new features, no dependency bumps except security fixes. Each post-freeze commit references a task explaining why.
2. **Never cut:** T1–T8, T11, T16, T17, T18 (core sim, Kernel, EVP, benchmark, UI, Copilot, QA, deploy, submission).
3. **Cut order when time runs short** (stop at the first that restores a safe schedule):
   1. T19 stretch goals
   2. T13 Muse Image lab
   3. HDFS/MinIO profiles
   4. Live parts of T12 (keep precomputed Camera Mode)
   5. T10 → Lite mode only
   6. T9 reduced to HMAC + health + copilot proxy
   7. T14 mutation testing (keep property + BFS + differential)
4. A cut task gets status `cut`, a reason, and a LIMITATIONS entry; README and video never claim cut features.
5. Decide cuts by **Sun Nov 1 evening** if D6 proofs are not met; never in the last 24 h.
6. If something is half-built, it is hidden or removed, not shipped broken.
7. Submission buffer: finish video and text by Tue Nov 3; submit ≥ 6 h early.

## Good / Bad

| ✅ | ❌ |
|---|---|
| "T13 cut: documented in LIMITATIONS; video omits it" | Demoing a half-working lab |
| Fix a failing QA row at 11 pm Monday | Adding a new scenario Tuesday |

## Enforcement

`tasks.json` `cut_tier`/status, freeze check in CI after the date (allow-list of branch prefixes), claims audit, review checklist.
