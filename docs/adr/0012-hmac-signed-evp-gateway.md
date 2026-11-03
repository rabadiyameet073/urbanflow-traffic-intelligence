# ADR-012: HMAC-signed EVP requests at the gateway
- Status: Accepted
- Date: 2026-10-31
- Deciders: UrbanFlow Architecture Team

## Context
Emergency Vehicle Preemption (EVP) alters traffic signal safety plans. Unauthorized actors could forge preemption requests, create denial-of-service signal storms, or replay old preemption triggers.

## Options
- (a) HMAC-SHA256 over canonical JSON with timestamp window, atomic nonces, and storm guards.
- (b) Unauthenticated open REST endpoint.
- (c) mTLS with client certificates.

## Decision
Adopt option (a). All incoming EVP requests require HMAC-SHA256 signatures over canonical RFC-8785 JSON; enforce +/- 30s timestamp freshness; check atomic nonce deduplication in Durable Objects; enforce IP/source rate limits.

## Consequences
- Positive: Demonstrable defense against forged, tampered, or replayed preemption attacks; lightweight verification using Web Crypto API.
- Negative: Requires secret key distribution (mitigated for demo by `/api/evp/demo-token`).

## Evidence
`packages/edge/test/edge.test.ts` rejects forged signatures, replayed nonces, and expired timestamps.

