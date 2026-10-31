# ADR-011: LLM provider adapter with an ordered fallback chain
- Status: Accepted
- Date: 2026-10-31
- Deciders: UrbanFlow Architecture Team

## Context
AI Copilot responses must remain available even if the Meta Model API experiences rate limits, network outages, or format invalidities during judge reviews.

## Options
- (a) Ordered provider fallback chain: `MetaProvider` -> `WorkersAIProvider` -> `TemplateProvider`.
- (b) Hard dependency on Meta Model API alone.

## Decision
Adopt option (a). All Copilot calls go through `CopilotRouter`. Failures, budget exhaustion, or 5xx errors automatically degrade to the next provider, clearly indicating provider source via badge in the response envelope.

## Consequences
- Positive: Zero demo downtime due to external AI provider outages; honest provenance badges; budget protection via Circuit Breaker.
- Negative: Template fallbacks provide rule-based explanations rather than generative nuances.

## Evidence
`packages/edge/src/copilot/router.ts` fallback chain tests.
