# ADR-009: Kafka (KRaft) + PySpark with Lite mode fallback
- Status: Accepted
- Date: 2026-10-31
- Deciders: UrbanFlow Architecture Team

## Context
Telemetry pipelines must demonstrate production-grade Big Data capabilities (Kafka KRaft, PySpark Structured Streaming, 10s watermarks, sliding windows, EWMA anomaly alerts). However, judges on constrained machines need a zero-Docker fallback.

## Options
- (a) Dual-pipeline: Full PySpark Structured Streaming with KRaft Kafka, paired with a TypeScript Lite mode (`urbanflow_lite.ts`) running identical logic.
- (b) PySpark only.
- (c) TypeScript streaming only.

## Decision
Adopt option (a). Maintain full PySpark stream with pinned Spark 3.5.x connectors, and build an in-memory Node.js Lite stream sharing the identical mathematical definitions and schema outputs.

## Consequences
- Positive: Real Big Data credentials for production evaluation, while guaranteeing instant zero-install evaluation on any machine.
- Negative: Requires maintaining parity tests between PySpark and TypeScript Lite implementations.

## Evidence
`pipeline/spark/tests/test_anomalies.py` and `packages/core/test/system_design.test.ts` verify matching anomaly detections.

