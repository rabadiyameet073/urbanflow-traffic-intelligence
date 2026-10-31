# UrbanFlow Streaming Pipeline

This directory contains the real-time Big Data streaming infrastructure for UrbanFlow AI:
- **Kafka**: Ingests high-frequency telemetry from the intersection (`lane-telemetry`, `signal-state`, `emergency-events`).
- **Apache Spark Streaming**: Computes sliding 10-second window aggregations, tracks online EWMA variance, detects anomalies (`BLOCKAGE`, `DEMAND_SURGE`, `SIGNAL_STUCK`, `EMS_DELAYED`), and stores Parquet partitions.
- **UrbanFlow Lite (`lite/`)**: Zero-dependency Node.js implementation for running and testing the streaming engine locally without Docker.

## Quickstart (Docker Mode)

```bash
cd pipeline
make up    # Spin up Kafka and Spark
make test  # Run pipeline tests
make down  # Stop services
```

## Running Lite Mode (No Docker)

Lite mode uses `@urbanflow/core` and runs directly in Node:

```bash
pnpm --filter @urbanflow/bench run start
```
