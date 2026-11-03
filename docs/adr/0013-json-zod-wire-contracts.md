# ADR-013: JSON + zod for wire contracts
- Status: Accepted
- Date: 2026-10-31
- Deciders: UrbanFlow Architecture Team

## Context
Data exchange between simulation, edge gateway, PySpark streaming, and UI needs precise schema enforcement and validation without brittle schema compiler overhead.

## Options
- (a) JSON payloads governed by Zod schemas in TypeScript, mirrored to PySpark `StructType`.
- (b) Apache Avro with Confluent Schema Registry.
- (c) Protocol Buffers (gRPC).

## Decision
Adopt option (a). All wire payloads use JSON validated through Zod v3 schemas in `@urbanflow/core/src/contracts.ts`, identically mirrored in PySpark schemas.

## Consequences
- Positive: Human-readable payloads in Kafka, instant serialization in browser Web Workers, zero external schema registry infrastructure required.
- Negative: Slightly larger wire payload size compared to binary encodings (irrelevant at ~100 msg/s).

## Evidence
`packages/core/src/contracts.ts` and `pipeline/spark/urbanflow/schemas.py`.

