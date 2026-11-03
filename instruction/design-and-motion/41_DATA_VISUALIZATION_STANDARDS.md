# Module 41: Data Visualisation Standards

> KPI cards, charts, timelines and deltas. The audience is a judge with 2–3 minutes and an engineer with a skeptical eye: show the truth, show the uncertainty, never decorate.

---

## 1. Rules of Honest Display

1. **Every number has a source badge** (`LIVE-SIM` / `REPLAY` / `PRECOMPUTED`) and a unit.
2. **Single-run numbers are labelled** "single run — not a statistical claim"; statistical claims show a **95 % CI and n** and come from `results.json`.
3. **Zero-based axes** for bar charts; line charts may truncate but must label the axis range.
4. **No dual axes**, no 3-D, no pie charts, no smoothing that hides data.
5. **Deltas use sign + arrow + colour** (▲/▼), with the *direction meaning* explicit ("lower is better").
6. **Missing data shows "—"** with a reason tooltip; never `0`, never `NaN`.
7. **Parity is displayed as parity** (neutral colour, "no significant difference") when the CI includes 0.
8. Assumption-driven figures (fuel, CO₂) carry an "assumptions" popover listing factors.

---

## 2. KPI Cards (twin view)

Per twin plus delta:

| KPI | Unit | Better | Tooltip essentials |
|---|---|---|---|
| Avg delay | s/veh | lower | definition, LOS badge |
| Person-delay | s/person | lower | pax-weighted; bus = 45 |
| Bus delay / Bike delay | s | lower | equity metrics |
| Throughput | veh/h | higher | exited per hour |
| Max queue | m | lower | across lanes/time |
| Stops per vehicle | count | lower | |
| EMS transit delay | s | lower | vs free-flow |
| Idle fuel / CO₂ | L / kg | lower | factors in popover |
| Denied entries | count / % | lower | **warn > 0.5 %** |

Anatomy: label (text-2) · value (mono, large, tabular) · unit · delta chip · source badge · info button. States: loading skeleton, valid, stale (>3 s without update: dimmed + "stale"), error.

**LOS badge:** letter A–F + colour + outline pattern (A solid … F hatched). Scale: A ≤10, B ≤20, C ≤35, D ≤55, E ≤80, F >80 s.

---

## 3. Charts (uPlot, tiny)

| Chart | X | Y | Series | Notes |
|---|---|---|---|---|
| Queue length per lane | sim time | m | selected lane, both twins | lane selector |
| Rolling avg delay | sim time | s/veh | fixed vs adaptive | 60-s rolling |
| Throughput | sim time | veh/h | both twins | |
| Pressure bars | — | pressure | 4 phases | bar, current decision |
| Results CI plot | scenario | rel. improvement % | point + 95 % CI whisker | zero line emphasised |
| Pipeline latency | window | ms | p50/p95 | log-scale optional, labelled |

Standards:
- Fixed-size **ring buffers** (e.g. 600 points); no unbounded arrays.
- Synchronised cursor across linked charts; tooltip shows exact value + time.
- Series colours from Okabe-Ito tokens; Fixed = neutral grey-blue, Adaptive = accent; line **dash style differs** (solid vs dashed) for redundancy.
- Gridlines hairline; axis labels ≥ 12 px; units in axis titles.
- Render at ≤ 10 Hz; pause updates while the tab is hidden.
- Provide a data-table toggle and **Export PNG/CSV** (PNG includes timestamp, seed, scenario in the footer).
- Reduced motion: no animated transitions on data changes.

---

## 4. Phase Timeline (Gantt ribbon)

Last 5 minutes per controller. Segments: phase green (colour + glyph label `P2`), yellow, all-red, FLASH_RED, **EVP segments outlined and labelled**. Hover/focus shows start, duration, reason code. Two ribbons stacked (Fixed above Adaptive) on the same time axis.

---

## 5. Explainability Panel ("Why this phase?")

- Four horizontal bars (phase pressures), winner highlighted with ✓ glyph.
- Rule line: e.g. `RATIO rule: 3.4× > 3×8` (formatted from machine-readable `rule` + numbers).
- Time-in-phase progress (with G_MIN_S and G_MIN_EFFICIENT_S markers and G_MAX_S end).
- Plain-English line from `explainDecision` (AI source badge) or the template fallback.
- "Copy decision log" (JSON).

---

## 6. Safety Panel

Large badge `0 conflicts in N ticks` (go colour + ● + text). Counters: violations prevented by type; min/max green seen; yellow/all-red compliance %. If conflicts > 0: banner "SAFETY VIOLATION — stop" in stop colour with ◆ glyph (should be impossible; present for honesty).

---

## 7. EVP Timeline Panel

Vertical stepper: requested → accepted/rejected(reason) → pre-clear → green → exit → recovery, each with sim-time. **TIGHT** plan shows a banner with `shortfallS` and the sentence "Yellow and all-red are never shortened."

---

## 8. Results View

Table: scenario · fixed · adaptive · Δ% · 95 % CI · verdict chip (`Adaptive wins` / `Parity` / `Adaptive loses`) · n seeds. Sort stable; the parity rows are **not hidden**. A "Method" disclosure explains seeds, warm-up, bootstrap B, train/held-out split and the reproduction command.

---

## 9. Empty / Loading / Error States

| State | Pattern |
|---|---|
| Loading | Skeleton with fixed dimensions (no CLS) |
| Empty (no run yet) | "Press Play or choose a scenario" |
| Error | Inline card with plain reason + retry; never a blank panel |
| Offline (edge) | Banner "Edge offline — core demo unaffected" |
| Not benchmarked | Tag "not benchmarked" (never invent an expectation) |

---

## 10. Review Checklist

- [ ] Units, source badge, and direction ("lower is better") present.
- [ ] Colour is never the only encoding; patterns/glyphs/text present.
- [ ] Contrast verified (non-text ≥ 3:1).
- [ ] CI and n shown for statistical claims; single-run labelled.
- [ ] Ring buffers; updates throttled; no per-frame DOM writes.
- [ ] Export works and includes seed/scenario/timestamp.
- [ ] Works at 390 px and at 200 % zoom.
