# ADR-019: Share state in URL hash as deterministic input log
- Status: Accepted
- Date: 2026-10-31
- Deciders: UrbanFlow Architecture Team

## Context
Judges need to easily share exact simulation scenarios, edge cases, and preemption tests via simple clickable URLs without relying on external database lookups.

## Options
- (a) Encode `{scenarioId, seed, overrides, detectionDistance, inputLog}` into a compressed URL hash via `CompressionStream` and base64url.
- (b) Server-side database lookup for share links (`/share/:id`).

## Decision
Adopt option (a). State and user actions are serialized as a deterministic input log in the URL fragment. The decoder is strictly fuzz-safe, silently falling back to defaults if input is malformed.

## Consequences
- Positive: Zero server dependency for scenario sharing; works offline; tamper-evident verification via FNV-1a state hash displayed in the UI footer.
- Negative: URL length increases with long manual override logs (mitigated by compression).

## Evidence
`packages/core/src/helpers/share-codec.ts` and fuzz-testing with 1000 malformed input strings.

