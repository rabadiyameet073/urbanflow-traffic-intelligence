# Muse / Meta AI Prompt Assets

The prompts below are the ones the running system actually sends. They are
versioned (`*.v1`) and defined in
[`packages/edge/src/copilot/prompts.ts`](../../packages/edge/src/copilot/prompts.ts);
this directory documents them so a reviewer can read the contract without
reading TypeScript.

Outputs are validated against zod schemas in
[`schemas.ts`](../../packages/edge/src/copilot/schemas.ts). A response that fails
schema validation, or that cites a number absent from the input window, is
discarded and the request falls through to the next provider in the chain
(`Muse Spark → Workers AI → deterministic template`).

| File | Purpose | Used by |
|---|---|---|
| [`01-diagnose.v1.md`](01-diagnose.v1.md) | Bottleneck / anomaly diagnosis from a 60 s metrics window | `POST /api/copilot/diagnose` |
| [`02-explain.v1.md`](02-explain.v1.md) | Plain-English explanation of a control decision | `POST /api/copilot/explain` |
| [`03-chat.v1.md`](03-chat.v1.md) | Operator Q&A with refusal behaviour | `POST /api/copilot/chat` |
| [`04-advisory.v1.md`](04-advisory.v1.md) | Dispatch advisory and VMS text | `POST /api/copilot/advisory` |
| [`05-camera-mode.md`](05-camera-mode.md) | SAM 3.1 / Muse Image offline asset prompt | offline, not a runtime call |
| [`06-codegen.md`](06-codegen.md) | Muse Code usage note | development-time only |

## Design Rules These Prompts Follow

1. **The model is never given authority.** Every prompt states, in its own
   words, that the output is advisory and that the assistant cannot change a
   signal.
2. **Numbers must be grounded.** `diagnose.v1` requires that every cited number
   appears in the input; `explain.v1` restricts citations to the decision log.
   The check is mechanical (`verifySemanticNumbers`), not a matter of trusting
   the model.
3. **Refusal is an expected output.** `chat.v1` names the refusal case
   explicitly, and the deterministic fallback implements the same refusal with
   regexes rather than relying on the model to comply.
4. **Length and format are bounded** so a prompt-injected payload cannot turn an
   advisory into a wall of text or a multi-line sign message.
5. **Untrusted data is data.** `chat.v1` rule 3 exists because metrics windows
   contain free-form lane labels; an instruction embedded there must not be
   executed.

## What Is Not Automated

`docs:check` does not verify these prompt files against `prompts.ts`. If you edit
one, edit the other — the TypeScript constant is the source of truth and the
markdown is a reading copy.
