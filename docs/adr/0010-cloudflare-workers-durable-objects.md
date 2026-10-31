# ADR-010: Cloudflare Workers + one SQLite-backed Durable Object class
- Status: Accepted
- Date: 2026-10-31
- Deciders: UrbanFlow Architecture Team

## Context
The system requires real-time multi-viewer room broadcasting, atomic nonce storage for EVP replay defense, rate limiting, and persistent replay storage without recurring database infrastructure costs.

## Options
- (a) Cloudflare Workers + 1 SQLite-backed Durable Object class with WebSocket Hibernation API.
- (b) External managed Redis + PostgreSQL backend.

## Decision
Adopt option (a). Use a single Durable Object class (`Room`) holding an embedded SQLite table for nonces, rate buckets, and replay JSON blobs.

## Consequences
- Positive: Runs completely within the Cloudflare Workers Free Tier ($0 operational cost); global edge distribution; transactional SQLite consistency per room.
- Negative: Single Durable Object throughput limit per room (~50 concurrent WebSocket viewers per room).

## Evidence
`packages/edge/src/do/Room.ts` stores nonces and replays with instant lookup and expiration.
