# Skill: llm-copilot

**Use when:** Building or changing the AI Copilot, diagnosis, chat tools or proposals.

**Read first:** `platform-specifications/04`, `backend-engineering/24`, Rule 08

## Rules

1. Adapter interface with provider-specific code isolated; router chooses Meta → Llama → Template.
2. DiagnosisV1 and tool outputs are zod schemas; invalid output triggers one repair attempt, then the template.
3. Tools are read-only except `proposeParams`, which only creates a proposal.
4. Cache by input hash; cap tokens and calls; record latency and cost.
5. Always show provider, model, time and a disclaimer; never claim certainty.
6. Evaluate on labelled situations; track regression.

## Good / Bad

- ✅ `const d = DiagnosisV1.safeParse(json); if(!d.success) return template(frame)`
- ❌ Rendering model Markdown as HTML.

## Landmines

- Model IDs and capabilities change: 🔎 verify in the Meta console.
- Do not send secrets or raw user identifiers.
