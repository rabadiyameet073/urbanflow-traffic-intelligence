# Rule 08 — AI Advises, Never Controls (inviolable)

AI explains and proposes. It never actuates. Control always flows through deterministic, validated, human-approved paths.

## Protocol

1. The pipeline for any AI-originated change: **bounded proposal → zod validation → Kernel dry-run → digital-twin what-if → human Approve → apply and log**. Skipping a step is a defect.
2. AI output is **untrusted input**: parse strictly (`.strict()`, bounds, `.finite()`), never `eval`, never execute text as code or commands.
3. Safety timings and invariants are out of the AI's reach (Rule 06); proposals touching them are rejected with a reason shown to the user.
4. Every AI path has a **fallback** (Meta `muse-spark-1.3` → Llama via Workers AI → deterministic Template). The UI states which provider answered. The app works with all providers down.
5. User text and sim data go into prompts as delimited **data**, with instructions that they carry no authority (prompt-injection hygiene). No secrets in prompts.
6. Meta API: non-`-contributor` model IDs only; key server-side only; caps, caching and rate limits to stay within credits.
7. Claims about AI (accuracy, diagnosis quality) come from `evals/` results, reported honestly.
8. The UI offers an "Unsafe proposal" demo that shows rejection.

## Good / Bad

| ✅ | ❌ |
|---|---|
| "Proposed G_MIN_EFFICIENT 25→30; predicted −4.1 % delay; Kernel OK; [Approve]" | Model output applied directly |
| Fallback label "Template (AI unavailable)" | Silent failure |

## Enforcement

`audit.sh` A7, A14; QA-17…20; E8 e2e; review checklist §2.2.
