# Meta Model API Integration Notes

- **Portal:** `dev.meta.ai` (Meta Model API)
- **Base URL:** `https://api.dev.meta.ai/v1` (OpenAI-compatible)
- **Model Selected:** `muse-spark-1.3` (Latest high-capacity multimodal reasoning model)
- **Non-Contributor Policy:** Always use `muse-spark-1.3` (never `-contributor` suffixes).
- **Free Credits:** $150 promotional credits active.
- **Estimated Costs:** ~$1.25 / 1M input tokens, ~$4.25 / 1M output tokens.
- **Safety Fallback:** Automatic degradation to `TemplateProvider` when offline, ensuring 100% demo uptime.
