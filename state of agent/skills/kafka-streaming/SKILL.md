# Skill: kafka-streaming

**Use when:** Producing to or consuming from Kafka topics.

**Read first:** `backend-engineering/23`, `system-design/12`

## Rules

1. Topics: lane-telemetry, signal-state, emergency-events, lane-metrics, anomaly-events, dlq.
2. Keys: `intersectionId` (ordering per intersection); JSON with `schemaVersion`; event time in payload.
3. KRaft single broker, pinned image, `mem_limit`; healthcheck before producers start.
4. Producer: idempotent, bounded batching, graceful shutdown; poison messages go to `dlq` with reason.
5. Replay is deterministic from recorded runs; the producer takes a seed.
6. Lite mode bypasses Kafka with the same record schema.

## Good / Bad

- ✅ Produce `lane-telemetry` with `acks=all`, key = intersectionId.
- ❌ Auto-creating topics with default partitions in production-like demos.

## Landmines

- Time skew between producer and Spark breaks watermarks; use event time.
