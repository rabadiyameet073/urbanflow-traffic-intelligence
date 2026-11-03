# Module 40: Control-Room Design System

> A calm, dense, trustworthy operations-console look: dark by default, light supported, signal states never conveyed by colour alone. Every colour pair below is verified by `helpers/contrast.py` (all pairs PASS at the stated minimum).

---

## 1. Design Intent

| Principle | Meaning |
|---|---|
| **Instrument, not poster** | Clarity of data beats decoration; the canvas is the hero, panels recede |
| **Honest by construction** | Source badges (`LIVE-SIM`, `REPLAY`, `PRECOMPUTED`, AI source) are first-class UI |
| **Calm density** | Many numbers, little noise: hairlines, restrained accents, consistent rhythm |
| **Redundant encoding** | Colour + shape + text for every state |
| **Recording-friendly** | Legible at 1080p screen capture and on a 390 px phone |

Forbidden: gaudy gradients, fake urgency, fabricated metrics, decorative animation, more than two typefaces.

---

## 2. Tokens (CSS custom properties; Rule 19 — no raw hex in components)

Naming grammar: `--color-<role>[-<variant>]`, `--font-<role>`, `--radius-<role>`, `--space-<n>`, `--shadow-<role>`. **Role, not page.**

### 2.1 Colour — dark (default)

| Token | Value | Role |
|---|---|---|
| `--color-canvas` | `#0B0F14` | App background |
| `--color-surface` | `#121820` | Panels/cards |
| `--color-surface-elevated` | `#1A2330` | Dialogs, popovers, hover |
| `--color-hairline` | `rgba(255,255,255,0.10)` | Dividers (decorative) |
| `--color-border-strong` | `#66778C` | Control borders (≥ 3:1) |
| `--color-text` | `#E8EEF4` | Primary text |
| `--color-text-2` | `#A9B6C6` | Secondary text |
| `--color-text-3` | `#8594A8` | Captions/metadata |
| `--color-accent` | `#56B4E9` | Interactive accent, links, selection |
| `--color-go` | `#2FD4A0` | Green signal / positive delta |
| `--color-caution` | `#F0E442` | Yellow signal / warning |
| `--color-stop` | `#FF8A4C` | Red signal / negative delta |
| `--color-focus` | `#F0E442` | Focus ring |

### 2.2 Colour — light

| Token | Value |
|---|---|
| `--color-canvas` | `#F6F8FA` |
| `--color-surface` / `-elevated` | `#FFFFFF` |
| `--color-hairline` | `rgba(11,21,32,0.12)` |
| `--color-border-strong` | `#6B7A8C` |
| `--color-text` / `-2` / `-3` | `#0B1520` / `#3A4A5C` / `#566679` |
| `--color-accent` | `#005F96` |
| `--color-go` | `#00694D` |
| `--color-caution` | `#7A6A00` |
| `--color-stop` | `#B33C00` |
| `--color-focus` | `#005F96` |

Selection of theme: `prefers-color-scheme` default + manual toggle stored in `uf_v1_theme` (try/catch). Both themes share identical structure; only token values change (`:root[data-theme="light"]`).

### 2.3 Categorical (vehicle types, series) — Okabe-Ito

`BIKE #E69F00` · `CAR #56B4E9` · `BUS #009E73` · `TRUCK #CC79A7` · `AMBULANCE #FFFFFF` (+ red cross, light bar). Graphics against the road surface need ≥ 3:1; verify when the road colour changes. Shape/size carries identity too (module 31).

### 2.4 Signal semantics (never colour alone)

| State | Token | Glyph | Label |
|---|---|---|---|
| Green | `--color-go` | ● | GO |
| Yellow | `--color-caution` | ▲ | CLEAR |
| Red / all-red | `--color-stop` | ■ | STOP |
| Flash red (fault) | `--color-stop` + dashed outline | ◆ | FAULT |

### 2.5 Space, radius, elevation

- Space scale (px): 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 (`--space-1…8`). 4-pt rhythm; no ad-hoc values.
- Radius: `--radius-sm 4px`, `--radius-md 8px`, `--radius-lg 12px`, `--radius-pill 999px`.
- Elevation by **surface step + 1 px hairline**, not heavy shadows. One shadow token for dialogs (`0 8px 24px rgba(0,0,0,.35)` dark / `.15` light). Blur effects limited to active dialog overlay.

---

## 3. Typography

| Role | Font | Use | Notes |
|---|---|---|---|
| UI & reading | **Inter** (variable, self-hosted subset) | Body, labels | `font-feature-settings: "tnum" 1, "cv11" 1` on numeric UI |
| Data & code | **JetBrains Mono** (self-hosted subset) | Numbers in KPI cards, timestamps, hashes, seeds | `tabular-nums` so values don't jitter |

Scale (rem, 1rem = 16px, ratio ≈ 1.2): `12 / 14 / 16 / 18 / 20 / 24 / 32 / 40`. Line-height 1.5 body, 1.2 headings. Headings 600 weight, tracking `-0.01em`. Captions/metadata 12–13 px uppercase tracking `+0.04em` only where short (badges).

Rules: `font-display: swap` + size-adjusted fallback (no CLS); preload the two critical weights; never rely on font loading for layout; minimum 12 px text, 14 px for dense tables on mobile.

---

## 4. Layout

| Breakpoint | Width | Layout |
|---|---|---|
| Mobile | 360–767 | Single column; controls in bottom drawer (≈ 92 % height, drag-to-dismiss); tabs for twin A/B |
| Tablet | 768–1023 | Two-up twin if space; side drawer |
| Desktop | 1024–1439 | 2-column: canvases + panels; right-hand dock for copilot |
| Wide | ≥ 1440 | Max content width ~ 1600 px, centred; balanced gutters |

Grid: 12-col CSS grid, 16/24 px gutters; panels are cards on `--color-surface` with 1 px hairline and `--radius-md`. Canvas keeps its aspect ratio; never stretch.

---

## 5. Component Inventory (build in this order)

`Button` (primary/secondary/ghost/danger) · `IconButton` (aria-label required) · `Stepper` · `Slider` (native range, styled) · `Segmented` (speed, view) · `Tabs` · `Badge` (source/LOS/status) · `Chip` (EVP status, delta) · `Tooltip` (hover + focus) · `Dialog` · `Drawer` · `Toast` · `Card` · `StatTile` (KPI) · `Table` · `Popover` (assumptions) · `Banner` (offline, TIGHT shortfall) · `Skeleton` · `EmptyState`.

Every component documents: states (default, hover, active, focus-visible, disabled, loading, error), keyboard behaviour, ARIA, and responsive behaviour. Build order and status live in `state of agent/pending-component-work.md`.

### 5.1 Interaction states (all required)

| State | Treatment |
|---|---|
| Hover | Surface step up (`surface-elevated`) + border tint; **no displacement** |
| Active/pressed | Immediate: `transform: scale(0.98)` (150 ms or less) |
| Focus-visible | 2 px `--color-focus` ring + 2 px offset; never removed |
| Disabled | Reduced contrast but still ≥ 3:1 for the label; `aria-disabled`; tooltip explains why when non-obvious |
| Loading | Skeleton/spinner with `aria-busy`; never layout shift |

---

## 6. Badges that must exist

| Badge | Values |
|---|---|
| Data source | `LIVE-SIM`, `REPLAY (recorded <date>)`, `PRECOMPUTED` |
| AI source | `Muse Spark`, `Llama fallback`, `Template` |
| Run identity | `Identical arrivals (seed N)`, `state hash ab12…` |
| Mode | `SIMULATION ONLY` (persistent, in header) |
| Safety | `0 conflicts in N ticks` |

---

## 7. Verification

```bash
python3 -I helpers/contrast.py          # all token pairs; exit 1 on failure
```

Changing any colour token requires: update this table, update `contrast.py` palettes, re-run, commit together (Rule 19). Visual regression baselines (Playwright `toHaveScreenshot`) at 1440×900 and 390×844 for both themes, fixed seed, paused at t = 60 s.

---

## 8. Anti-Patterns

| ❌ | ✅ |
|---|---|
| `color: #56B4E9` in a component | `color: var(--color-accent)` |
| Red text on dark for "bad" | Warm orange `--color-stop` + ■ glyph + word |
| Hover lift (`translateY`) on cards | Border/surface change only |
| Four typefaces | Inter + JetBrains Mono |
| Contrast "by eye" | `contrast.py` |
| Hard-coded dark theme assumptions in canvas code | Palette read from CSS variables per theme |
