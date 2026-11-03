# Skill: vision-sam

**Use when:** Working in vision/: SAM segmentation, Muse Image scenes, Camera Mode data.

**Read first:** `platform-specifications/04`, `languages-and-tooling/52`, Rule 11

## Rules

1. Offline pipeline on Colab: image → SAM masks → lane polygons → queue estimate → JSON committed; the web app reads precomputed files.
2. Record model name/version, prompt, seed, library versions and input hash in every output.
3. Evaluate against hand-labelled queues; report MAE and failure cases.
4. Use synthetic or licensed images only; no identifiable people or plates.
5. Fallback: newest accessible SAM, disclosed; CI tests geometry with stub masks.
6. Licence acceptance and tokens are human actions.

## Good / Bad

- ✅ JSON with `model:'sam-3.1'`, `seed`, `imageSha256`.
- ❌ Calling a GPU model live from the browser.

## Landmines

- Heavy ML deps must not enter CI or the web bundle.
