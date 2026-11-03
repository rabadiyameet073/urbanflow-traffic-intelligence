# Rule 13 — Accessibility Floor (inviolable)

WCAG 2.2 AA is the minimum, not a stretch goal. A control-room UI that only works with a mouse and good colour vision fails the rubric and real users.

## Protocol

1. Every interactive element is a native control (or has full ARIA semantics), keyboard operable, with a visible focus ring (`--color-focus`, ≥ 3:1).
2. Text contrast ≥ 4.5:1 (large ≥ 3:1); non-text UI ≥ 3:1 in **both** themes; verified by `helpers/contrast.py`.
3. **Never colour alone:** signal and status use colour + shape/letter (● ▲ ■ ◆) + text; charts use the Okabe-Ito palette plus markers/dashes.
4. `prefers-reduced-motion` removes non-essential motion; essential motion ≤ 300 ms, transform/opacity only. `forced-colors` and 200 % zoom/320 px reflow work.
5. Live regions announce Kernel decisions, EVP state and AI results politely (`aria-live="polite"`; assertive only for FLASH_RED).
6. Canvas content has a text alternative: a live textual summary and a data table of the same values.
7. Touch targets ≥ 24×24 CSS px (prefer 44).
8. Language, headings, landmarks, skip link, labels and error associations are correct (module 51 §2).
9. A manual keyboard + screen-reader pass is recorded before submission.

## Good / Bad

| ✅ | ❌ |
|---|---|
| Signal chip "● GO — P2 NS through, 12 s" | A green dot with no text |
| `<button type="button">Inject ambulance</button>` | `<div onclick>` |

## Enforcement

axe in E2E (0 serious/critical), QA-26…29, `audit.sh` A9, review checklist §2.5.
