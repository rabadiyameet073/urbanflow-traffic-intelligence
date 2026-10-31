-- 02_anomalies_summary.sql
-- Purpose: Aggregated breakdown of detected anomalies by type, lane, and severity
-- Input: anomalies table partitioned by date
-- Owner: Pipeline / Analytics

SELECT
  type,
  lane,
  severity,
  COUNT(1) AS occurrence_count,
  MIN(window_start) AS first_detected_at,
  MAX(window_end) AS last_detected_at
FROM anomalies
WHERE date = CURRENT_DATE()
GROUP BY type, lane, severity
ORDER BY occurrence_count DESC, type, lane;
