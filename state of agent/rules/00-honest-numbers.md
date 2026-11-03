# Rule 00 — Honest Numbers (inviolable)

Every number shown to a judge, user or reader is **measured, generated, or labelled as an assumption**. A made-up or rounded-up number is the single fastest way to lose a hackathon of engineers.

## Protocol

1. Public metrics come **only** from `results.json` (module 25), produced by `pnpm bench` on held-out seeds with paired seeds and bootstrap 95 % CI.
2. README, `docs/RESULTS.md`, UI KPI text, video script and Devpost text are **generated or diffed** against `results.json`; never typed from memory.
3. Show uncertainty: report the CI, the scenario, the seed set and the baseline definition beside every headline.
4. Report parity and losses too. If Adaptive is not better in a scenario, the table says so.
5. Assumptions (vehicle mix, demand, EMS speed, provider limits) are labelled `assumption` with the source or `🔎 verify`.
6. Tuning uses train seeds 1–100; claims use held-out seeds 1001–1050. Never tune on held-out seeds.
7. Placeholders in templates (`<measured>`) must be replaced by generated values before submission; leftover placeholders fail the claims audit.
8. Simulation only: never imply real-world deployment, real traffic data, or safety certification.

## Good / Bad

| ✅ Good | ❌ Bad |
|---|---|
| "Adaptive: −X.X % person-delay (95 % CI a…b), ns-heavy-tide, 50 held-out seeds" generated from `results.json` | "Reduces congestion by up to 40 %" |
| "No significant difference in balanced-light" | Omitting the scenario where it ties |
| "Assumption: ambulance 18 m/s 🔎" | Silent constants |

## Enforcement

`helpers/audit.sh` A12 (superlatives), claims audit (module 61 §3.2), QA-32/33, review checklist. A number with no source is a **blocker**.
