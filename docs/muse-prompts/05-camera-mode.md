# Camera Mode — offline vision assets

**Not a runtime call.** Camera Mode is an offline asset-generation step. The
produced masks and images are committed, so the live judge environment needs no
GPU, no model download, and no network round trip during the demo.

## SAM 3.1 — lane geometry

**Purpose:** produce per-approach lane polygon masks for the camera overlay, so
the UI can show what a vision pipeline *would* feed the controller without
claiming a live detector.

**Prompt intent:**

> Segment the drivable lane polygons and stop-line bar for a four-way signalised
> intersection viewed from a fixed elevated pole camera. Return one mask per
> approach lane, plus one mask for each stop line. Exclude vehicles, shadows and
> road markings that are not lane boundaries.

**Output:** masks committed as assets and referenced by `core/vision/camera_mode.ts`.

## Muse Image — robustness fixtures

**Purpose:** synthetic weather variants to show where a vision pipeline would
degrade, and to give the UI a "the detector cannot see this" state instead of a
silent failure.

**Prompts (one per condition):**

| Condition | Prompt intent |
|---|---|
| Rain, night | Same intersection, heavy rain, wet specular reflections, no ambient light beyond signal heads and headlights |
| Fog | Same intersection, dense fog, visibility under 50 m, signal heads visible but lane markings lost |
| Low sun | Same intersection, direct low sun into the camera, heavy glare across the near approach |
| Snow | Same intersection, snow cover obscuring lane markings, signal heads clear |

## What Is Claimed, and What Is Not

**Claimed:** the assets exist, they are used by the UI to demonstrate detection
degradation, and the build does not require a model at runtime.

**Not claimed:** that a detector was trained, evaluated, or measured on these
fixtures. No precision/recall figure appears anywhere in this repository,
because none was measured. See [LIMITATIONS.md](../LIMITATIONS.md).
