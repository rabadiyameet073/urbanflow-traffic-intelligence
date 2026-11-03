# Demo Video Script — 3:00

**Target length:** 2:50 (10 s of slack). Captions on, burned in. Must play logged out.

**Hard rule:** every number spoken or shown on screen comes from
[`packages/bench/out/results.json`](../packages/bench/out/results.json) or
[`ems-sweep.json`](../packages/bench/out/ems-sweep.json). If a number is added to this
script, add it to the docs and run `pnpm docs:check`. No round-up, no "up to", no
superlatives.

**Opening card (0:00, 3 s, silent):**

> UrbanFlow AI
> A traffic simulator with a formal safety kernel.
> Simulation only — not connected to real signal hardware.

---

## First Five Seconds — cold open of the live URL (module 43 §1)

Everything below is visible **without scrolling** at both 1440×900 and 390×844.
It is the real app's default state, not a staged screen — no login, no blank
canvas, no modal.

1. The twin intersections are **already moving**: default scenario
   `ns-heavy-tide`, seed `42`, speed `5×` (the defaults in `state/store.ts`).
2. The persistent `SIMULATION ONLY` badge (header) and the
   `Identical arrivals (seed 42)` badge are both on screen.
3. A prominent **“▶ Watch 90-second demo”** button (also reachable via
   `?judge=1`) and a **“🚑 Spawn ambulance”** button sit in the header.
4. Two live KPI deltas are legible in the grid — **person-delay** and **EMS
   preemption delay** — each with its `LIVE-SIM` source and a single-run
   disclaimer above the row.
5. No modal blocks the view; the only first-visit affordance is the dismissible
   notices region (`main.ts`), never overlaid on the canvas.

---

## Judge Mode — the 90-second self-playing tour (module 43 §2)

It drives the **real app** (`ui/judge/tour.ts`), not a video. It is interruptible
(`Esc` stops it), keyboard-operable, and ends in a fully interactive state. The
captions are real DOM text (not canvas), each ≤ 12 words, and every number in a
caption is a measured value — the `~13 s` preemption clearance comes from the
EMS benchmark, never from an invented figure (Rule 00).

| Time | Action the tour performs | Caption |
|---|---|---|
| 0–10 s | Reset to `ns-heavy-tide` seed 42 at 5×; twin view + identical-arrivals badge | “Same cars, same seed. Two controllers.” |
| 10–25 s | Load `ns-heavy-tide` at 20×; KPIs diverge | “Uneven demand: adaptive clears queues faster.” |
| 25–45 s | Spawn ambulance on a conflicting phase; highlight the EVP panel | “Preemption needs ~13 s to clear safely.” |
| 45–60 s | Inject a blocked lane; Copilot card (live, or `PRECOMPUTED` when the edge is down) | “Muse Spark diagnoses. It can only propose.” |
| 60–75 s | The Safety Kernel’s own `violationsPrevented` counter — no faked state | “Safety Kernel rejects unsafe changes.” |
| 75–90 s | Slow to 5× toward the results context; parity rows are shown, not hidden | “Measured, with confidence intervals. Ties shown.” |

Reduced motion (OS setting **or** the in-app **✳ Reduce motion** toggle) makes
every caption cut instant rather than fade (module 42 §2). If the tour ever
reaches a stage it cannot perform live it says `PRECOMPUTED` — it never fakes a
state (see [LIMITATIONS.md](LIMITATIONS.md) item 29 for the two §2 clauses still
open: pause/skip scrubbing and dynamic caption numbers).

---

## Beat 1 — 0:00–0:25 — The claim, stated narrowly

**Screen:** the dashboard at rest; the four approaches visible; the safety panel bottom-right.

**Voiceover:**
> "This is UrbanFlow AI. It simulates a four-way intersection and compares two
> controllers: fixed-time cycling, and an adaptive controller that scores each
> approach by queue length, weighted waiting time, and lane occupancy.
>
> I'm going to show you the safety kernel first, because that's the part that
> matters, and then the numbers — including the ones that don't flatter it."

**On-screen text:** `Simulation only · safety kernel owns every signal state`

---

## Beat 2 — 0:25–1:00 — The kernel refuses

**Screen:** engine running. Trigger the EVP panel; submit a preemption request
with an implausible speed of 45 m/s. Then submit a correctly signed request at
150 m detection distance.

**Voiceover:**
> "Controllers don't write signals in this system. They emit requests, and only
> the kernel writes state. Here I'm sending an emergency preemption request at
> 45 metres per second — rejected, implausible speed, and the signal never moved.
>
> Now a valid request at 150 metres. The ambulance needs 19.5 seconds of lead
> time: 3.5 seconds of yellow, 2 seconds of all-red, 8 seconds of preclearance,
> and 6 seconds of queue flush and start-up loss. At 15 metres per second the
> ETA is 10 seconds. So the plan is classed TIGHT with a measured shortfall of
> 9.5 seconds — and the kernel still refuses to shorten yellow. It records the
> shortfall instead."

**On-screen text:**
```
45 m/s  → 422 IMPLAUSIBLE_SPEED     signal unchanged
150 m   → plan TIGHT, shortfall 9.50 s
Required lead 19.5 s = 3.5 + 2.0 + 8.0 + 6.0
```

---

## Beat 3 — 1:00–1:30 — What the AI actually does

**Screen:** the copilot panel. Ask it to "set the northbound light green right now".
Then ask "why is the northbound queue growing?"

**Voiceover:**
> "The AI copilot is advisory. It has no route that can write a signal state.
> When I ask it to force a green, it refuses — and unlike a naive wrapper, it
> doesn't repeat my instruction back to me.
>
> When I ask a real question, it produces a diagnosis from the live window, and
> every number in that diagnosis is checked against the input. If the model
> invents a figure, the check fails and the response falls back to a deterministic
> template rather than being displayed."

**On-screen text:** `Advisory only · no write path · numeric provenance checked`

---

## Beat 4 — 1:30–2:10 — The honest results table

**Screen:** full-frame the table from `docs/RESULTS.md` §2. Slow pan, 2 rows per second.

**Voiceover:**
> "Eight scenarios, five held-out seeds, paired runs, 95 % bootstrap intervals
> over the per-seed difference.
>
> Adaptive is significantly better in four: light night traffic at 24.8 %,
> north–south heavy tide at 24.8 %, blocked lane incident at 20.7 %, and balanced
> high traffic at 9 % — that last one with an interval that just clears zero.
>
> Two scenarios have point estimates that favour fixed-time: near saturation at
> −4.8 %, and the stadium surge dump at −12.3 %. Neither interval excludes zero,
> so neither is evidence that fixed-time is better — but I'm not going to hide
> them behind a single headline.
>
> The truthful summary is: never significantly worse, significantly better in
> four of eight."

**On-screen text:**
```
sig. better  4 / 8      light-night  +24.8 %  CI [ +4.2, +48.9]
                        ns-heavy-tide +24.8 % CI [+18.0, +31.6]
                        incident      +20.7 % CI [ +2.0, +39.3]
                        balanced-high  +9.0 % CI [ +0.4, +17.7]
unresolved   4 / 8
kernel conflicts 0 · conservation true in every run
```

---

## Beat 5 — 2:10–2:40 — The number that actually matters

**Screen:** switch to the throughput and denial table. Highlight the denial column.

**Voiceover:**
> "Person-delay is the headline metric, but it's computed over vehicles that got
> through. A controller that turns cars away can look good on it. So here is the
> column that doesn't flatter anyone: denied entries.
>
> At near saturation, fixed-time denies 43.9 % of arrivals at the approach.
> Adaptive denies 29.4 %. On balanced parity it goes from 11.6 % to 0.05 %.
> Adaptive discharged more vehicles in all eight scenarios.
>
> That's the operational claim I'd actually defend."

**On-screen text:**
```
denied @ approach    fixed → adaptive
near-saturation      43.94 % → 29.43 %
balanced-parity      11.64 % →  0.05 %
blocked-lane         14.66 % →  0.77 %
throughput higher in 8 / 8
```

---

## Beat 6 — 2:40–2:50 — What it is not

**Screen:** the limitations page, top five items.

**Voiceover:**
> "Three things this is not. It's a simulation — no signal cabinet, no
> certification, no NTCIP compliance. Preemption in this model does not reduce
> ambulance delay: all three paired intervals in the detection sweep include zero.
> And with five held-out seeds, four scenarios are simply unresolved.
>
> Both JSON artefacts and the command that regenerates them are in the repo."

**Closing card (2:50–3:00):**
> UrbanFlow AI · MIT · simulation only
> `pnpm bench` regenerates every number in this video.

---

## Production Checklist

- [ ] Captions burned in and reviewed for the numbers in Beats 2, 4 and 5
- [ ] Every on-screen number re-derived from `results.json` immediately before render
- [ ] `pnpm docs:check` green on the commit the video was recorded from
- [ ] Simulation-only disclaimer visible in the first and last 5 seconds
- [ ] Video plays logged out in a private window
- [ ] Thumbnail set: dashboard + the refusal line `422 IMPLAUSIBLE_SPEED`
- [ ] Duration ≤ 3:00 (hard limit)
- [ ] No sentence claims production readiness, real deployment, or guaranteed safety <!-- AUDIT-OK(A12): names the claim to forbid it -->

---

## Recording Standards (module 43 §4)

| Item | Standard |
|---|---|
| Capture | OBS Studio, 1920×1080, 30 or 60 fps, CRF-based H.264 (`-preset veryfast` unless best quality is needed) |
| Audio | Quiet room, external or headset mic, −16 LUFS integrated; no music louder than −30 LUFS under voice |
| Cursor | Visible, slightly enlarged; clicks highlighted |
| Zoom | Browser zoom 125 % so KPIs are legible; hide bookmarks, extensions and notifications |
| Browser | Clean profile, no personal tabs, **no secrets visible** (env files, terminals with keys, Meta console) |
| Captions | Burned-in or SRT; must match the narration exactly |
| Length | ≤ the portal’s limit; target 2:50–3:00 |
| Thumbnail | Twin view with a readable title line |
| Pacing | One idea per 20–30 s; no dead air; the product is on screen within 5 s |
| Accessibility | Captions on; no critical information carried by audio alone |
| Hosting | Uploaded where the portal allows; verified to play **logged-out** in a private window |

Record in **segments** (one per beat above), assemble in DaVinci Resolve or
CapCut, and keep the raw clips until after judging.

---

## Pre-Record Checklist (module 43 §5)

- [ ] `pnpm bench` results final; every script number filled from `results.json`
- [ ] App on the production build / live URL; state seeded; no console errors
- [ ] Edge healthy — or the script uses `PRECOMPUTED` honestly
- [ ] Notifications off; window sized; secrets hidden; cursor visible
- [ ] One dry run end-to-end under 3:00
- [ ] Limitations line included (Beat 6)

## Post-Record Checklist (module 43 §6)

- [ ] Captions proofread; numbers match `RESULTS.md`
- [ ] Plays in a private window; thumbnail set
- [ ] Video link tested from the submission-form preview
- [ ] Raw footage and project file backed up

---

## Narrative Discipline (module 43 §7)

1. Lead with the human problem (the ambulance), then the proof (the fair A/B),
   then the depth (safety, AI, pipeline).
2. Show **a loss or a tie on purpose** — it is the strongest credibility signal
   (Beat 4 keeps the two unresolved scenarios visible rather than hiding them).
3. Say “simulation” at least once, early (the opening card and Beat 1 do).
4. Name Meta tools precisely and only where they are actually used.
5. Never read a number that is not on screen; never show a number that is not in
   `results.json`.
