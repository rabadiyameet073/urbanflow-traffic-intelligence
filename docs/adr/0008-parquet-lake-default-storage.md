# ADR-008: Parquet lake is default storage; HDFS/MinIO optional
- Status: Accepted
- Date: 2026-10-31
- Deciders: UrbanFlow Architecture Team

## Context
Big Data analytics architectures frequently mandate HDFS or distributed object storage (S3/MinIO). However, running a multi-node Hadoop cluster locally consumes > 8 GB RAM and complicates evaluation for hackathon judges.

## Options
- (a) Local Parquet lake on Docker volume partitioned by date and controller; optional S3/HDFS compose profiles.
- (b) Mandatory HDFS cluster container setup.

## Decision
Adopt option (a). Default to Snappy-compressed Parquet lake on standard filesystem volume (`/data/lake/lane_metrics`). HDFS and MinIO profiles are optional for advanced multi-node setups.

## Consequences
- Positive: Runs reliably in 4 GB RAM on developer laptops without memory exhaustion; standard pyarrow and DuckDB/Presto compatibility.
- Negative: Does not demonstrate live multi-rack HDFS replication in default demo mode.

## Evidence
`pipeline/docker-compose.yml` runs Spark + Kafka within standard memory limits.

