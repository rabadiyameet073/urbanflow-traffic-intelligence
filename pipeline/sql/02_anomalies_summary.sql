-- 02_anomalies_summary.sql
-- Purpose: Aggregated breakdown of detected anomalies by type, lane, and severity
-- Input: anomalies table partitioned by date
-- Grain: one row per (type, lane, severity) within the current UTC day
-- Owner: Pipeline / Analytics

SELECT
  type,
  lane,
  severity,
  COUNT(1) AS occurrence_count,
  MIN(window_start) AS first_detected_at,
  MAX(window_end) AS last_detected_at
FROM anomalies
-- Module 53 §1/§6: half-open [start, end) UTC range on the raw event-time
-- column; same pruning and timezone-explicitness reasoning as query 01.
WHERE window_start >= TIMESTAMP(CURRENT_DATE())
  AND window_start < TIMESTAMP(CURRENT_DATE() + INTERVAL 1 DAY)
GROUP BY type, lane, severity
-- Module 53 §1: ORDER BY carries a unique tie-breaker across every GROUP BY key
-- so an asserted result is deterministic even when counts tie.
ORDER BY occurrence_count DESC, type, lane, severity;

