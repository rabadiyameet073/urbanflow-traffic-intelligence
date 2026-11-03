# ADR-002: Signals are decided in the browser/Worker thread; edge is a gateway
- Status: Accepted
- Date: 2026-10-31
- Deciders: UrbanFlow Architecture Team

## Context
Judges evaluate UrbanFlow by loading a web application. Legacy architectures route control decisions through remote brokers (Kafka -> Spark -> Edge -> Signal), incurring multi-second network latencies and failure points.

## Options
- (a) Localized in-browser Web Worker control loop with edge as advisory/coordination gateway.
- (b) Server-side closed loop requiring persistent low-latency WebSockets for simulation actuation.

## Decision
Adopt option (a). Controller and SafetyKernel execute in `@urbanflow/core` in the client Web Worker isolate. The Cloudflare Edge Worker provides signed EVP authentication, multi-client rooms, copilot LLM routing, and persistent replay storage only.

## Consequences
- Positive: Zero network latency in the primary control loop; demo functions completely offline; resilient against cloud provider disruptions.
- Negative: Cannot claim distributed physical intersection clustering across network partitions.

## Evidence
Cold-open browser demo functions without active edge network connectivity.

