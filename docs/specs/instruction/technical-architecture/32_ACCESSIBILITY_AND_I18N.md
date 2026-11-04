# Module 32: Accessibility & Internationalisation

> Target: **WCAG 2.2 AA**, keyboard-complete, colour-blind-safe, reduced-motion-respectful. A dense control-room UI is where accessibility usually dies; here it is a gate (Rule 13).

---

## 1. Requirements Matrix

| Area | Requirement | Verification |
|---|---|---|
| Contrast | Text ≥ 4.5:1 (large text ≥ 3:1); non-text UI/graphics ≥ 3:1 | Token validator script + axe |
| Focus | Visible focus ring on every interactive element; never `outline: none` without replacement; not obscured by sticky UI | Playwright keyboard run + visual |
| Keyboard | Everything operable without a pointer; logical order; no traps; `Esc` closes dialogs/drawers/tours | Playwright |
| Target size | ≥ 44×44 CSS px on touch layouts (WCAG 2.2 minimum is 24 px; we exceed it) | Layout test |
| Motion | `prefers-reduced-motion` ⇒ no flashing/pulsing/parallax; transitions ≈ instant | Emulation test |
| Colour independence | Meaning never by colour alone: shape/glyph/text accompany | Manual + review |
| Names/roles | Every control has an accessible name; correct roles; icon-only buttons have `aria-label`; decorative icons `aria-hidden="true"` | axe + lint rule |
| Live updates | `aria-live="polite"`, throttled to 1 per 5 s; no per-frame announcements | Playwright |
| Forms | Labels, error messages associated (`aria-describedby`), no placeholder-only labels | axe |
| Zoom/reflow | Usable at 200 % zoom and 320 px width; no horizontal scroll | Manual + e2e at 375 px |
| Forced colours | Works in `forced-colors: active` (system colours; borders retained) | Emulation screenshot |
| Time limits | No auto-expiring UI; Judge Mode is interruptible and pausable | e2e |

---

## 2. The Canvas Problem (text alternative)

A canvas is opaque to assistive tech. Provide three layers:

1. `role="img"` + `aria-label` on the canvas with a **short static description** ("Top-down view of a four-way intersection with eight approach lanes.").
2. A visually-hidden **status region** updated at most every 5 s: "Phase P2 North–South through, green for 12 s. Longest queue: NB-TR 34 m. Ambulance on EB-L, preemption in progress."
3. A **data table alternative** (toggle "Show lane table"): 8 rows × (lane, signal, queue m, vehicles, wait s) updated at ≤ 1 Hz with `aria-live="off"` (read on demand).

Keyboard: arrows select a lane (selection ring + announced name); `+`/`−` adjust demand; shortcuts listed in a `?` dialog.

---

## 3. Colour & Contrast Design

- **Categorical palette:** Okabe-Ito (colour-blind-safe): `#E69F00 #56B4E9 #009E73 #F0E442 #0072B2 #D55E00 #CC79A7 #000000`.
- **Signal semantics (redundant coding):**

| State | Colour token | Glyph | Text |
|---|---|---|---|
| Green | bluish-green `#009E73` family | ● filled circle | "GO" |
| Yellow | yellow `#F0E442` family | ▲ triangle | "CLEAR" |
| All-red / Red | vermillion `#D55E00` family | ■ square | "STOP" |
| Flash red | vermillion + dashed outline | ◆ diamond | "FAULT" |

- LOS A–F badges: colour **and** letter **and** outline pattern.
- Delta chips: ▲/▼ arrows + sign + colour.
- Every token pair used for text is verified by `helpers/contrast.py` (module 40 lists the pairs). **Do not assume**; run the script.

---

## 4. Keyboard Map

| Key | Action |
|---|---|
| `Tab` / `Shift+Tab` | Move focus through controls in visual order |
| `Space` | Pause / play (when canvas focused) |
| `A` | Spawn ambulance on selected lane |
| `I` | Open incident dialog |
| `R` | Reset (confirm if state is dirty) |
| `1`–`4` | Speed 0.5× / 1× / 5× / 20× |
| `←/→/↑/↓` | Select lane geometrically |
| `+` / `−` | Adjust selected lane demand (Shift = ×4) |
| `?` | Shortcut help |
| `Esc` | Close dialog/drawer; interrupt Judge Mode |

Shortcuts are **not** active while typing in inputs; they never override browser/AT shortcuts; they can be disabled (settings) to satisfy WCAG 2.1.4.

---

## 5. Dialogs, Drawers, Tours

- Focus moves into the dialog on open, is **trapped**, and returns to the trigger on close.
- Background content `inert`; `aria-modal="true"`; labelled by title.
- Judge Mode overlay: captions are real text (not canvas), pausable, skippable, keyboard operable, respects reduced motion; ending returns the user to an interactive state.

---

## 6. Testing Plan

| Layer | Tool | Gate |
|---|---|---|
| Automated | axe-core in Playwright on every main view + dialogs | 0 serious/critical |
| Keyboard | Playwright: Tab through to "Spawn Ambulance" and activate with Enter/Space | pass |
| Emulation | `prefers-reduced-motion: reduce`, `forced-colors: active`, 200 % zoom | no flashing; usable |
| Contrast | `helpers/contrast.py` against token table | all pairs ≥ target |
| Screen reader smoke | NVDA (Windows, free) or VoiceOver (macOS) on one flow | status region reads sensibly |
| Colour-blind simulation | Browser devtools vision deficiency emulation screenshots | states distinguishable |

---

## 7. Internationalisation (readiness, English first)

| Rule | Detail |
|---|---|
| Strings | All user-visible text in `i18n/strings.ts` (typed keys). No literal UI text in components except test ids |
| Numbers/dates | `Intl.NumberFormat` / `Intl.DateTimeFormat`; never manual formatting |
| Units | Metric internally; display metric by default (m, km/h, s); unit helper makes a mph/ft toggle possible later |
| Plurals | `Intl.PluralRules`; no `n + " vehicle(s)"` |
| Layout | Logical CSS properties (`margin-inline-start`) so RTL is possible; no fixed-width text containers |
| Locale | `lang` attribute set on `<html>`; locale from `navigator.language` with explicit fallback `en` |
| AI text | Advisory text is English; labelled as such |
| Text expansion | UI tolerates +30 % string length |

---

## 8. Common Failures (and the fix)

| ❌ | ✅ |
|---|---|
| Red/green only to show signal state | Colour + glyph + text |
| Canvas with no alternative | Role, status region, lane table |
| Announcing every phase change instantly | Throttle to 1 per 5 s; batch |
| Custom slider without ARIA | Native `<input type="range">` styled via CSS |
| Focus ring removed for aesthetics | Tokenised high-contrast ring |
| Tooltips only on hover | Also on focus; dismissible; hoverable |
| Modal that loses focus on close | Return focus to trigger |
| Flashing ambulance light under reduced motion | Static marker + label |
