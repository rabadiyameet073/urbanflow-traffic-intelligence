# Runbook 05: Pipeline & Spark Streaming Startup Failure

## Trigger
- `make up` or `make demo` fails to start Docker containers.
- PySpark fails with class-loading or Kafka connector incompatibility.

## Immediate Actions
1. **Memory & Port Verification:**
   - Verify Docker host has at least 4 GB available RAM allocated.
   - Check if port 9092 (Kafka) or 8080 is already bound by existing local processes:
     `netstat -ano | findstr 9092`
2. **Switch to Lite Mode Fallback:**
   - Immediately switch to zero-dependency TypeScript Lite streaming:
     `pnpm pipeline:lite`
   - Lite mode executes identical sliding windows and EWMA anomaly rules without Java/Docker.
3. **Verify Spark Version Matching:**
   - Confirm PySpark version matches Kafka connector Scala suffix in `pipeline/spark/urbanflow_stream.py`:
     `org.apache.spark:spark-sql-kafka-0-10_2.12:3.5.0`
4. **Clean Stale Checkpoints:**
   - Corrupt state directories can block streaming startup. Remove stale test checkpoints:
     `make clean`

