# Module 04: AI Copilot & Vision Specification

> What each Meta tool does in UrbanFlow, the exact contract of every AI feature, and the guardrails around it. Engineering detail (adapters, retries, evals) is in `backend-engineering/24_LLM_INTEGRATION_ENGINEERING.md`.

---

## 1. Meta Tool Map (the rubric's 25 % "Use of Meta AI Tooling")

| Tool | Role in UrbanFlow | Where it runs | In the live demo? |
|---|---|---|---|
| **Muse Code** | Builds the project; prompt log in `docs/muse-prompts/` is evidence; also synthesises the *independent reference model* for differential safety testing | Dev time | n/a (evidence) |
| **Muse Spark** (Model API) | Diagnosis (structured outputs), explanation, operator chat (function calling), advisory text, multimodal frame input | Cloudflare Worker (server-side key) | Yes, via Edge mode; falls back visibly |
| **SAM 3.1** | Zero-shot lane/vehicle segmentation of a camera frame → lane polygons → simulator config + queue estimate | Colab / Modal offline | Precomputed results committed |
| **Muse Image** | Synthetic intersection scenes under rain / fog / night / glare for the robustness lab and Camera Mode inputs | Offline | Precomputed grid |
| **Open-weights Llama** | Free fallback provider (Workers AI) | Edge | Yes, as fallback badge |

**Closed loop:** Muse Image scene → SAM 3.1 masks → lane polygons + queue estimate → simulator config → telemetry → Muse Spark diagnosis (text + annotated frame) → bounded proposal → Kernel + twin verification → human approval. If SAM 3.1 weights are inaccessible, use the newest SAM available and **say so**.

---

## 2. Absolute Boundaries (Rule 08)

1. AI **never** writes `SignalState`, never calls Kernel mutation methods, never receives a tool that changes the simulator.
2. AI inputs are **numbers and enums only**, except operator chat (length-limited, wrapped, untrusted).
3. AI outputs are **validated by zod**; invalid ⇒ one repair retry ⇒ fallback. Output is rendered with `textContent`, never `innerHTML`.
4. Yellow, all-red, `G_MIN_S`, `G_MAX_S`, `MAX_RED_WAIT_S`, conflict rules are **not tunable**; any proposal naming them is rejected with reason *"not configurable"*.
5. Every number in an AI answer must appear in its input ("*Every number in your answer must appear in the input.*").
6. A visible badge states which engine answered: `muse-spark | llama-fallback | template`.

---

## 3. Features and Contracts

### 3.1 `diagnose(window)` → `DiagnosisV1`

Input: compact JSON — last 60 s per lane at 10 s resolution (queue, wait, arrivals, discharge), signal history, baseline stats, active EVP, pipeline anomaly-events; **no free text**. Optional: annotated canvas PNG (image input) if the provider supports vision.

```ts
DiagnosisV1 = {
  severity: 'info'|'warning'|'critical',
  rootCauseHypotheses: {               // max 3, sorted by confidence desc
    cause: 'BLOCKED_LANE'|'CAPACITY_DROP'|'DEMAND_SURGE'|'SIGNAL_FAULT'|'BUS_BUNCHING'|'EMS_OBSTRUCTED'|'NORMAL_VARIATION',
    confidence: number /* 0..1 */, evidence: string[] /* ≤ 4, each cites lane+metric+value+window */
  }[],
  spillbackRisk: { upstream: boolean, minutesToSpillback: number | null },
  recommendedActions: { type: 'ADJUST_PARAMS'|'ADVISE_DIVERSION'|'DISPATCH_CREW'|'MONITOR',
                        params?: Partial<AdaptiveParams>, rationale: string }[],
  advisoryText: string /* ≤ 280 chars */,
  signMessage: string[] /* ≤ 2 lines × 24 chars, uppercase */
}
```

If evidence is insufficient the model must return `NORMAL_VARIATION` with low confidence.

### 3.2 `explainDecision(decisionLog)`

2–3 plain sentences explaining the last adaptive switch from the pressure map and the rule that fired. `reasoning_effort` low; cache by input hash (5 min).

### 3.3 `chat(question)` — function calling, read-only

Tools: `getLaneMetrics(lane)`, `getSignalHistory(n)`, `getEvpTimeline()`, `getScenarioResults(id)`, `getAnomalies()`. Max 3 tool rounds. Answers only from tool results; otherwise "I don't know". Asked to change signals ⇒ explains it can only *propose*. User text is untrusted; tool outputs are data, not instructions.

### 3.4 `proposeParams(diagnosis)` — verify-before-apply

```
zod bounds  →  Kernel dry-run  →  digital-twin what-if (5 sim-min, same arrivals, current vs proposed)
            →  improvement > 3 % AND kernel passes  →  show Approve
            →  Approve: apply + log   |   Reject: show reason ("Rejected by Safety Kernel: yellow interval is not configurable")
```

A demo button **"Try an unsafe proposal"** deliberately exercises the rejection path.

### 3.5 `advisory(diagnosis)`

Dispatcher advisory + LED-style sign text (2 × 24 chars).

---

## 4. Providers and Fallback

`Meta (muse-spark-1.3) → Workers AI (Llama) → Template`. Timeout 6 s; retry once on 5xx; circuit breaker opens 60 s after 3 failures. Template provider is deterministic and **always succeeds**. Details: module 24.

---

## 5. Vision: Camera Mode

Pipeline (offline, then committed):

1. Muse Image generates a top/oblique intersection scene (prompt + seed stored).
2. SAM 3.1 produces masks for asphalt lanes and vehicles.
3. Geometry code converts masks → lane polygons → stop-line estimate → 8-lane mapping → `SimConfig` overlay.
4. Queue estimate = count/length of vehicle masks contiguous from the stop line.
5. Evaluate against **hand labels** (MAE reported honestly, including failures).

The web app loads `vision/out/*.json` and PNG overlays; **no GPU needed live**. Perception-noise control test (Task 13): inject count noise into the controller and show degradation curves — this is robustness evidence, not decoration.

---

## 6. Acceptance Evidence

| Evidence | Source |
|---|---|
| Copilot accuracy table vs heuristic baseline vs Llama | `evals/out/report.md` (generated, no hand-typed numbers) |
| Router/fuzz/injection/budget tests | `pnpm --filter edge test copilot` |
| Live smoke (5 real calls, accuracy + cost) | `pnpm eval:live` |
| Camera Mode MAE | `python vision/eval.py` |
| Prompt build log | `docs/muse-prompts/` |
