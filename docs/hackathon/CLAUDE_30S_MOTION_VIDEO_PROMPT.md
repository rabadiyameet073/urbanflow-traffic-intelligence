# 30-Second Motion Graphics Video & Audio Prompt Pack

> **Purpose:** Generate the 30-second cinematic problem statement intro video and synchronized voiceover for **UrbanFlow AI** (Meta Global AI Developer Hackathon).
> **Target Video Length:** Exactly 30.0 seconds (900 frames @ 30 FPS / 1800 frames @ 60 FPS).
> **Audio Length:** Exactly 30.0 seconds (68 words @ ~136 WPM).

---

## 1. Prompt for Claude 3.5 Sonnet (Motion Video Generation)

Copy and paste the exact block below into **Claude 3.5 Sonnet**:

```markdown
You are an elite motion graphics director specializing in high-impact luxury tech animations using Remotion, React Motion, HTML5 Canvas, and modern WebGL.

Create a standalone, cinematic, 30.0-second (exact 900 frames at 30 FPS / 1800 frames at 60 FPS) motion graphics animation script and component for the Problem Statement intro of "UrbanFlow AI", submitted to the Meta Global AI Developer Hackathon.

### Visual Aesthetic & Design Tokens:
- Background: Obsidian Slate (#0B0F14, #111827) with a faint 24px isometric grid.
- Hazard / Crisis Colors: Emergency Siren Red (#EF4444), Warning Amber (#F59E0B), Pulse Orange (#FF8A4C).
- Hero Accent Colors: Luminous Cyber Cyan (#38BDF8) and Electric Emerald (#2FD4A0).
- Typography: Bold editorial sans-serif display paired with JetBrains Mono monospace telemetry numbers.
- Spring Physics: Stiffness 260, damping 20 (fluid, weighted, cinematic).
- Attribution Banner: Persistent subtle footer pill: "Curated with Meta Muse • Powered by Meta Llama 3.3".

### Exact 30-Second Timeline Breakdown:

#### Act 1: The Global Congestion Crisis (0:00 – 0:08 | Frames 0 – 240)
- 0:00 – 0:03: Dark satellite grid of an urban metropolis fades in. Pulsing red arterial lines spread across roads representing choked traffic corridors.
- 0:03 – 0:08: A large digital counter rapidly accelerates upward with a red chromatic glitch effect:
  Headline: "$88,000,000,000"
  Subtitle: "ANNUAL GLOBAL ECONOMIC LOSS TO URBAN CONGESTION"

#### Act 2: The Emergency Response Crisis (0:08 – 0:18 | Frames 240 – 540)
- 0:08 – 0:11: Camera zooms into a stylized 2D intersection. An ambulance glyph with a pulsing red/amber beacon aura is trapped behind stationary cars at a solid RED traffic light. The cross-street is completely empty.
- 0:11 – 0:18: An EKG cardiac heartbeat monitor waveform pulses horizontally across the screen with a ticking countdown clock:
  Stat Callout: "CRITICAL RESPONSE WINDOW"
  Supporting: "Every 60s Delay = 7% – 10% Drop in Cardiac Survival"
  The heartbeat waveform spikes and flashes hazard amber as the timer counts down.

#### Act 3: Legacy Failure & Title Reveal (0:18 – 0:30 | Frames 540 – 900)
- 0:18 – 0:21: Glitch shatter effect sweeps the screen with a bold typography slam:
  "LEGACY 1970s PRE-TIMED SIGNALS ARE FAILING OUR CITIES."
- 0:21 – 0:25: Transition into a calm, focused command-center interface.
- 0:25 – 0:30: Sleek title lockup reveal:
  Title: "UrbanFlow AI" (Luminous cyan vector glow)
  Tagline: "Adaptive Traffic Intelligence with a Single-Writer Safety Kernel"
  Footer Tag: "Curated with Meta Muse • Powered by Meta Llama 3.3"

### Deliverable:
Provide a self-contained, production-ready React / Remotion component (or single-file standalone HTML5 Canvas animation) running at 60 FPS that precisely matches these second markers.
```

---

## 2. Audio Voiceover Script (ElevenLabs / TTS Prompt)

Paste the following text into **ElevenLabs** (recommended voice: *Adam*, *Brian*, or *Daniel*) or your chosen TTS engine:

```text
Every year, urban traffic congestion costs the global economy over eighty-eight billion dollars. Even more critically, emergency vehicles lose precious minutes trapped at red lights on empty cross-streets. In cardiac arrest and stroke emergencies, every sixty seconds of delay reduces patient survival rates by seven to ten percent. Legacy fixed-time traffic controllers, designed in the nineteen-seventies, are failing our cities. We need verifiable, safety-critical intelligence.
```

---

## 3. Second-by-Second Synchronization Matrix

| Time Window | Voiceover Audio Track | Screen Motion Graphic Beat |
| :--- | :--- | :--- |
| **0:00 – 0:04** | *"Every year, urban traffic congestion costs the global economy..."* | Satellite city map fades in; red traffic gridlines pulse and spread. |
| **0:04 – 0:08** | *"...over eighty-eight billion dollars."* | Large digital counter rapidly counts up to **$88,000,000,000**. |
| **0:08 – 0:12** | *"Even more critically, emergency vehicles lose precious minutes trapped at red lights on empty cross-streets."* | Camera zooms to intersection; ambulance is trapped at red light while cross-street is empty. |
| **0:12 – 0:18** | *"In cardiac arrest and stroke emergencies, every sixty seconds of delay reduces patient survival rates by seven to ten percent."* | EKG heartbeat line pulses; countdown timer reveals cardiac survival drop. |
| **0:18 – 0:24** | *"Legacy fixed-time traffic controllers, designed in the nineteen-seventies, are failing our cities."* | Glitch transition: *"LEGACY 1970s PRE-TIMED SIGNALS ARE FAILING OUR CITIES"* slams on screen. |
| **0:24 – 0:30** | *"We need verifiable, safety-critical intelligence."* | Title reveal: **UrbanFlow AI** + *"Curated with Meta Muse • Powered by Meta Llama 3.3"*. |
| **0:31** | *(Audio & Video Transition Point)* | **Cut to `clip1_scene1_digital_twin.mp4` / live browser screen demo.** |
