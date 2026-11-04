# Module 43: Demo, Judge Mode & Video Presentation Design

> 25 % of the score is "working demo & video quality". Judges spend minutes, not hours. This module designs the first 5 seconds, the 90-second Judge Mode tour, and the 3-minute video.

---

## 1. First Five Seconds (cold open of the live URL)

Must be visible without scrolling at 1440×900 and 390×844:

1. Twin intersections **already moving** (default scenario `ns-heavy-tide`, seed 42, speed 5×) — no blank state, no login.
2. Persistent `SIMULATION ONLY` badge and `Identical arrivals (seed 42)` badge.
3. A prominent **"Watch 90-second demo"** button (also `?judge=1`) and a **"Spawn ambulance"** button.
4. Two live KPI deltas (person-delay, EMS delay) with their source badges.
5. No modal blocking the view; first-visit hints are small, dismissible, and not on top of the canvas.

---

## 2. Judge Mode (90 seconds, self-playing, interruptible)

It drives the **real app**, not a video. Controls: pause/resume, skip, `Esc` to stop, keyboard operable; ends in a fully interactive state.

| Time | Action | Caption (≤ 12 words) |
|---|---|---|
| 0–10 s | Highlight twin view and identical-arrivals badge | "Same cars, same seed. Two controllers." |
| 10–25 s | Load `ns-heavy-tide` at 20×; KPIs diverge | "Uneven demand: adaptive clears queues faster." |
| 25–45 s | Spawn ambulance on a conflicting phase at 300 m; highlight EVP timeline | "Preemption needs ~13 s to clear safely." |
| 45–60 s | Inject blocked lane; Copilot card (live or `PRECOMPUTED`) | "Muse Spark diagnoses. It can only propose." |
| 60–75 s | Show an unsafe proposal rejected (Fail-safe/chaos button if implemented) | "Safety Kernel rejects unsafe changes." |
| 75–90 s | Results table with CIs and the parity row | "Measured, with confidence intervals. Ties shown." |

Rules: captions are real text (not canvas), ≤ 2 lines; numbers in captions are **read from `results.json`**; the tour never fakes a state (if the edge is offline it says "PRECOMPUTED"); reduced motion ⇒ instant cuts.

---

## 3. Three-Minute Video Script (adapt after Task 5 — measured numbers only)

| Time | Screen | Narration (plain, confident) |
|---|---|---|
| 0:00–0:15 | Split screen: fixed-time ambulance waits; UrbanFlow clears | "Every minute an ambulance loses can matter. Most signals can't see it coming. This one prepares." |
| 0:15–0:35 | Twin view, identical-arrivals badge, lane steppers | "Same cars, same seed, two controllers. Change any lane and both worlds change together, so the comparison is fair." |
| 0:35–1:05 | `stadium-dump` at 20×; KPIs and phase timeline diverge | "When demand is uneven, adaptive control cuts person-delay by **[X]%** (95% CI [a, b], 50 seeds). When it's balanced, we tie — and we show that too." |
| 1:05–1:35 | Ambulance at 300 m; EVP timeline; TIGHT banner at 150 m | "Safe preemption needs about 13 seconds. At 150 metres there isn't enough time. At 300, delay drops **[Y]%**." |
| 1:35–2:05 | Blocked lane; Copilot diagnosis (source badge); proposal → what-if → Approve; unsafe proposal rejected | "Muse Spark diagnoses from telemetry and a camera frame. It proposes; a Safety Kernel and a digital-twin test decide." |
| 2:05–2:25 | Camera Mode: Muse Image scene → SAM 3.1 masks → sim lanes; robustness grid | "SAM 3.1 turns a frame into lanes and queues. Muse Image stress-tests rain, fog and night." |
| 2:25–2:45 | Chaos panel: kill AI → template; kernel fault → FLASH_RED → recover; terminal `make demo` | "Pull the plug and it degrades safely. Behind it, Kafka and Spark stream to a data lake." |
| 2:45–3:00 | Results table, repo + live URL, limitations line | "Every number reproduces with one command. Simulation today; real roads need certified hardware. Try it live." |

**Placeholders `[X]`, `[Y]` must be replaced from `results.json` before recording.** A script containing a literal placeholder or an unmeasured number is not ready.

---

## 4. Recording Standards

| Item | Standard |
|---|---|
| Capture | OBS Studio, 1920×1080, 30 or 60 fps, CRF-based H.264 (`-preset veryfast` unless best quality needed) |
| Audio | Quiet room, external or headset mic, −16 LUFS integrated target, no music louder than −30 LUFS under voice |
| Cursor | Visible, slightly enlarged; clicks highlighted |
| Zoom | Browser zoom 125 % for legibility of KPIs; hide bookmarks/extensions/notifications |
| Browser | Clean profile; no personal tabs; **no secrets visible** (env files, terminals with keys, Meta console) |
| Captions | Burned-in or SRT; must match narration |
| Length | ≤ the portal's limit; target 2:50–3:00 |
| Thumbnail | Twin view with readable title text |
| Pacing | One idea per 20–30 s; no dead air; show the product within the first 5 s |
| Accessibility | Captions on; critical info not only in audio |
| Hosting | Upload where the portal allows; verify it plays **logged-out** in a private window |

Record in **segments** (one per script row), assemble in DaVinci Resolve/CapCut; keep raw clips until after judging.

---

## 5. Pre-Record Checklist

- [ ] `pnpm bench` results final; script numbers filled from `results.json`.
- [ ] App on the production build/live URL; state seeded; no console errors.
- [ ] Edge healthy (or script uses `PRECOMPUTED` honestly).
- [ ] Notifications off; window sized; secrets hidden; cursor visible.
- [ ] One dry run end-to-end under 3:00.
- [ ] Limitations line included.

## 6. Post-Record Checklist

- [ ] Captions proofread; numbers match `RESULTS.md`.
- [ ] Plays in a private window; thumbnail set.
- [ ] Video link tested from the submission form preview.
- [ ] Raw footage and project file backed up.

---

## 7. Narrative Discipline

1. Lead with the human problem (ambulance), then the proof (fair A/B), then depth (safety, AI, pipeline).
2. Show **a loss or tie** on purpose — it is the strongest credibility signal.
3. Say "simulation" at least once, early.
4. Name Meta tools precisely and only where actually used.
5. Never read numbers that are not on screen; never show a number that is not in `results.json`.
