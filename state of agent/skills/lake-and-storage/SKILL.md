# Skill: lake-and-storage

**Use when:** Designing Parquet layout, retention or local object storage.

**Read first:** `backend-engineering/26`, `system-design/12`

## Rules

1. Partition by date and intersection; keep files ≥ ~1 MB where possible (compaction script).
2. Parquet with snappy; schema evolution by adding nullable columns only.
3. Capacity ≈ 2.6 GB/day at full rate; retention policy documented.
4. MinIO/HDFS are optional profiles, off by default.
5. DuckDB reads Parquet for ad-hoc analysis; published numbers come from stored scripts.
6. Never commit lake data.

## Good / Bad

- ✅ `data/lake/lane_metrics/date=2026-11-01/…parquet`
- ❌ Thousands of tiny files per hour.

## Landmines

- Small-file problem hurts both Spark and DuckDB.
