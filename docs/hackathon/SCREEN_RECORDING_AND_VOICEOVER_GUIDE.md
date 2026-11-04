# UrbanFlow AI — Screen Recording & Voiceover Production Guide

> **Project:** UrbanFlow AI — Adaptive Traffic Intelligence & Emergency Preemption Platform  
> **Event:** Meta Global AI Developer Hackathon (Indie Developer Track)  
> **Created Using:** Meta Muse • Powered by Meta Llama 3.3  
> **Target Video Length:** 2 Minutes 30 Seconds (150 Seconds)  
> **Local Web Preview:** `http://localhost:5173/`  
> **Edge Gateway:** `http://localhost:8787/`  

---

## Table of Contents
1. [Master Video Timeline & Sync Sheet](#1-master-video-timeline--sync-sheet)
2. [Exact Screen Actions (What to Click & Show)](#2-exact-screen-actions-what-to-click--show)
3. [Studio Voiceover Script (Word-for-Word with Pacing Cues)](#3-studio-voiceover-script-word-for-word-with-pacing-cues)
4. [Ready-to-Paste Prompt for AI Voice Generators (ElevenLabs / OpenAI TTS)](#4-ready-to-paste-prompt-for-ai-voice-generators-elevenlabs--openai-tts)
5. [Pre-Recording Checklist](#5-pre-recording-checklist)

---

## 1. Master Video Timeline & Sync Sheet

| Time Window | Section | Screen Display | Narration Core Message |
| :--- | :--- | :--- | :--- |
| **0:00 – 0:30** | **Act 1: Problem Statement** | Motion Graphics Video (Dark city satellite grid, trapped ambulance, red heat map, survival timer) | Urban gridlock costs \$88B annually. Every 60-second delay in emergency response lowers cardiac survival by 7–10%. Legacy fixed-time signals cannot adapt. |
| **0:30 – 1:05** | **Act 2: Live Dual Twin & Solution** | Switch to Browser: `http://localhost:5173/` (Side-by-side Fixed-Time vs UrbanFlow Adaptive) | Introducing UrbanFlow AI, built with Meta Muse. Dual digital twin running identical vehicle seeds in real time. Notice queue clearance on Adaptive twin. |
| **1:05 – 1:35** | **Act 3: Emergency Preemption & Kinematics** | Browser: `http://localhost:5173/` Click **`[Trigger Ambulance]`** button | Watch our dynamic V2X ambulance insertion. Yellow clearance, green wave opening, queue yielding, and smooth exit without stalls or phantom delays. |
| **1:35 – 2:05** | **Act 4: Architecture & Single-Writer Safety** | Switch to: `http://localhost:5173/architecture.html` & `http://localhost:5173/components.html` | 4-layer architecture with single-writer safety kernel. Conflicting greens are mathematically impossible. Live Cloudflare Worker edge gateway at 7.2ms latency. |
| **2:05 – 2:30** | **Act 5: Meta AI Copilot & Benchmarks** | Switch to: `http://localhost:5173/presentation.html` Click **`[▶ Run Live Benchmark]`** | Meta Llama 3.3 copilot guarded by semantic provenance check. Up to 24% delay reduction across 8 scenarios with zero safety violations. |

---

## 2. Exact Screen Actions (What to Click & Show)

### Segment 1: Motion Video Problem Statement (0:00 – 0:30)
- **What is on screen:** The animated motion graphics video (rendered from Claude 3.5 Sonnet / Remotion prompt).
- **Key Visuals:** 
  1. High-contrast satellite city map highlighting clogged red intersections.
  2. Urgent telemetry readout: **"$88 Billion Lost Annually in Urban Gridlock"**.
  3. Close-up on an ambulance waiting at an empty intersection with a red signal.
  4. Heartbeat pulse with timer: **"Every 60s delay reduces cardiac arrest survival by 7–10%"**.
  5. Title Reveal: **"UrbanFlow AI — Real-Time Adaptive Traffic Intelligence"** with footer banner: **"Curated with Meta Muse • Powered by Meta Llama 3.3"**.

---

### Segment 2: Switch to Home Page & Dual Twin Demo (0:30 – 1:05)
- **Action 1 (0:30):** Smooth cut from motion video into your browser running at `http://localhost:5173/`.
- **Action 2 (0:32):** Hover mouse briefly over the left side (**Fixed-Time Baseline**) showing red signals and growing traffic queues.
- **Action 3 (0:42):** Move cursor to the right side (**UrbanFlow Adaptive Twin**) showing green-wave cycle transitions and fluid vehicle motion.
- **Action 4 (0:52):** Point cursor at the live telemetry cards on top:
  - Average Delay (Adaptive showing significant drop compared to Baseline).
  - Throughput (Vehicles/hr).
  - Approach Rejection: **0.0%**.

---

### Segment 3: Trigger Live Ambulance Preemption (1:05 – 1:35)
- **Action 1 (1:05):** Click the **`[Trigger Ambulance]`** button (or click EB approach lane).
- **Action 2 (1:10):** Watch the red ambulance with emergency beacon spawn into the queue.
- **Action 3 (1:15):** Highlight the signal transition:
  - Conflicting North-South lane safely enters Yellow (3.5s) and All-Red (2.0s) clearance.
  - Eastbound approach receives Green.
- **Action 4 (1:22):** Observe lead vehicles accelerating smoothly with boosted IDM headway.
- **Action 5 (1:28):** The ambulance glides across the intersection stop line and exits the junction box cleanly (`boxExited` event registered).
- **Action 6 (1:33):** Point to the green status banner: **"EVP Complete: Transit Time 14.2s (Zero Stall)"**.

---

### Segment 4: System Architecture & Clef Components (1:35 – 2:05)
- **Action 1 (1:35):** In the top navigation bar, click **"Architecture"** (`http://localhost:5173/architecture.html`).
- **Action 2 (1:40):** Scroll slightly to show the **4-Layer SVG Architecture Diagram**:
  - UI Canvas & Worker Layer
  - Deterministic Simulation Engine & Kinematics
  - Single-Writer Safety Kernel & HMAC EVP Authenticator
  - Cloudflare Edge Gateway & MongoDB Atlas Telemetry Sink
- **Action 3 (1:48):** Scroll down to the **Live Edge Gateway Console** and click **`[Test Health Check]`** or **`[Mint EVP Token]`**. Show the real-time sub-10ms response from Cloudflare Worker and live MongoDB connection.
- **Action 4 (1:55):** Click **"Components"** (`http://localhost:5173/components.html`). Type `safety` into the search box.
- **Action 5 (2:00):** Click on the `safety-kernel` card to showcase bidirectional dependency highlighting (`dependsOn` and `usedBy`).

---

### Segment 5: Presentation, Meta AI Copilot & Live Benchmark (2:05 – 2:30)
- **Action 1 (2:05):** In the top navigation bar, click **"Presentation"** (`http://localhost:5173/presentation.html`).
- **Action 2 (2:08):** Scroll to the **"Meta Hackathon Rubric Alignment"** grid (Social Impact, Meta AI Tooling, Technical Depth, Execution).
- **Action 3 (2:14):** Point to the **Semantic Provenance Gate** diagram showing `verifySemanticNumbers` ensuring zero LLM hallucination.
- **Action 4 (2:18):** Click the blue button: **`[▶ Run Live Benchmark]`**.
- **Action 5 (2:22):** Watch the 8-scenario benchmark execute in real time across held-out seeds.
- **Action 6 (2:26):** Show the final summary table: **24.8% Delay Reduction, 0 Safety Violations, 95% Confidence Intervals**.
- **Action 7 (2:30):** End screen showing project repository: `github.com/rabadiyameet073/urbanflow-traffic-intelligence` and **"Created using Meta Muse"**.

---

## 3. Studio Voiceover Script (Word-for-Word with Pacing Cues)

> **Voice Persona:** Confident, articulate, modern tech founder / engineering lead.  
> **Total Word Count:** 335 words ($\approx 135$ words per minute, ideal for 2.5 minutes with screen transitions).

```text
[0:00 - Act 1: Problem Statement]
Every year, urban traffic congestion costs the global economy over eighty-eight billion dollars.
[pause 0.4s]
Even more critically, emergency vehicles lose precious minutes trapped at red lights on empty cross-streets.
In cardiac arrest and stroke emergencies, every sixty seconds of delay reduces survival rates by seven to ten percent.
[pause 0.5s]
Legacy fixed-time traffic controllers, designed in the nineteen-seventies, are blind to real-time road conditions.
[glitch sound cue]
Our cities urgently need verifiable, safety-critical intelligence.

[0:30 - Act 2: Introduction & Dual Digital Twin]
Welcome to UrbanFlow AI, an adaptive municipal traffic intelligence platform built with the creative direction of Meta Muse.
[pause 0.3s]
Here on our live control center, we are running synchronized dual digital twins under identical vehicle demand seeds.
On the left, the legacy fixed-time controller accumulates long queues and phantom delays.
On the right, UrbanFlow’s adaptive engine dynamically responds to queue pressure, synchronizing green clearance waves to keep intersections moving.

[1:05 - Act 3: Dynamic Ambulance Preemption]
Now, let’s inject an emergency ambulance into the eastbound lane.
[mouse click sound cue]
Notice the instant V2X preemption hand-off.
The system securely authenticates the cryptographic token, clears conflicting north-south phases with proper yellow and all-red intervals, and gives our emergency vehicle an unimpeded green corridor.
Thanks to our assertive car-following kinematics and FIFO departure logic, vehicles yield smoothly and the ambulance clears the intersection box with zero stalls.

[1:35 - Act 4: Architecture & Single-Writer Safety]
Behind this interface is a high-assurance four-layer architecture.
To guarantee mathematical safety, we enforce a single-writer safety kernel.
AI proposals and operator overrides are strictly advisory—conflicting green signals are mathematically impossible.
Our edge gateway deploys globally on Cloudflare Workers with seven-millisecond round-trip telemetry synced directly to MongoDB Atlas.

[2:05 - Act 5: Meta AI Copilot & Benchmark Results]
For intelligent operational oversight, we integrate Meta Llama 3.3 through the Meta Model API.
To prevent hallucinations, our semantic provenance gate verifies every model-generated metric against raw sensor telemetry before operator delivery.
As demonstrated by our live benchmark across eight held-out scenarios, UrbanFlow AI delivers up to twenty-four percent delay reductions and near-zero approach denials, with zero safety violations.

[2:25 - Closing]
UrbanFlow AI proves that edge intelligence and provable safety can save lives and transform municipal mobility.
Thank you!
```

---

## 4. Ready-to-Paste Prompt for AI Voice Generators (ElevenLabs / OpenAI TTS)

If you are generating the voiceover using **ElevenLabs**, **OpenAI TTS**, or another voice synthesis tool, use the following configuration and script:

### Recommended Voice Settings (ElevenLabs):
- **Voice:** *Adam*, *Brian*, or *Daniel* (Deep, authoritative, natural tech narrator)
- **Model:** *Eleven Multilingual v2* or *Eleven Turbo v2.5*
- **Stability:** `0.55` (Natural variation without becoming erratic)
- **Clarity / Similarity:** `0.80` (Crisp studio presence)
- **Style Exaggeration:** `0.05`
- **Speaker Boost:** `Enabled`

### Exact Text to Paste into Voice Generator:

```text
Every year, urban traffic congestion costs the global economy over eighty-eight billion dollars. Even more critically, emergency vehicles lose precious minutes trapped at red lights on empty cross-streets. In cardiac arrest and stroke emergencies, every sixty seconds of delay reduces survival rates by seven to ten percent. Legacy fixed-time traffic controllers, designed in the nineteen-seventies, are blind to real-time road conditions. Our cities urgently need verifiable, safety-critical intelligence.

Welcome to UrbanFlow AI, an adaptive municipal traffic intelligence platform built with the creative direction of Meta Muse. Here on our live control center, we are running synchronized dual digital twins under identical vehicle demand seeds. On the left, the legacy fixed-time controller accumulates long queues and phantom delays. On the right, UrbanFlow’s adaptive engine dynamically responds to queue pressure, synchronizing green clearance waves to keep intersections moving.

Now, let’s inject an emergency ambulance into the eastbound lane. Notice the instant V2X preemption hand-off. The system securely authenticates the cryptographic token, clears conflicting north-south phases with proper yellow and all-red intervals, and gives our emergency vehicle an unimpeded green corridor. Thanks to our assertive car-following kinematics and FIFO departure logic, vehicles ahead yield smoothly and the ambulance clears the intersection box with zero stalls.

Behind this interface is a high-assurance four-layer architecture. To guarantee municipal safety, we enforce a single-writer safety kernel. AI proposals and operator overrides are strictly advisory—conflicting green signals are mathematically impossible. Our edge gateway deploys globally on Cloudflare Workers with seven-millisecond round-trip telemetry synced directly to MongoDB Atlas.

For intelligent operational oversight, we integrate Meta Llama 3.3 through the Meta Model API. To prevent hallucinations, our semantic provenance gate verifies every model-generated metric against raw sensor telemetry before operator delivery. As demonstrated by our live benchmark across eight held-out scenarios, UrbanFlow AI delivers up to twenty-four percent delay reductions and near-zero approach denials, with zero safety violations.

UrbanFlow AI proves that edge intelligence and provable safety can save lives and transform municipal mobility. Thank you!
```

---

## 5. Pre-Recording Checklist

Before you hit record, make sure these steps are checked:
- [ ] Browser resolution set to **1920x1080 (1080p)** or **2560x1440 (1440p)**.
- [ ] Dev servers running:
  - `http://localhost:5173/` (Web UI)
  - `http://localhost:8787/` (Cloudflare Worker API)
- [ ] Browser bookmarks bar hidden (`Ctrl + Shift + B` in Chrome) for clean screen look.
- [ ] Pre-load tabs in order:
  1. Tab 1: `http://localhost:5173/` (Twin Simulation)
  2. Tab 2: `http://localhost:5173/architecture.html` (Architecture & Live API Console)
  3. Tab 3: `http://localhost:5173/components.html` (Clef Components)
  4. Tab 4: `http://localhost:5173/presentation.html` (Rubric & Live Benchmark)
- [ ] Test the **`[Trigger Ambulance]`** button once to ensure vehicle movement is smooth.
- [ ] Video editing software ready (CapCut, Premiere, DaVinci Resolve, or Loom) to stitch the 30-second motion graphic intro with your 2-minute live screen walkthrough.
