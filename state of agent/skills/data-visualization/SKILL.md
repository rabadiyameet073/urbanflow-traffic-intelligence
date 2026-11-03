# Skill: data-visualization

**Use when:** Creating or editing any chart, sparkline, heatmap or comparison view.

**Read first:** `design-and-motion/41`, Rule 00, Rule 13

## Rules

1. Use uPlot for time series; Canvas for the intersection; no chart framework.
2. Okabe-Ito palette plus marker/dash redundancy; direct labels beat legends.
3. Bars start at zero; line axes may truncate only when labelled; always show units.
4. Show uncertainty: 95 % CI bands or whiskers wherever a claim is made.
5. Provide a data table or text summary for every chart (accessibility).
6. Fixed vs Adaptive always use the same two colours and the same order across the app.

## Good / Bad

- ✅ Paired-difference chart with CI whiskers and a zero line.
- ❌ Dual-axis chart with truncated bars.

## Landmines

- Colour-only difference between series fails accessibility.
- uPlot needs explicit resize handling in the worker/main split.
- Do not smooth data in a way that hides spikes the Kernel reacted to.
