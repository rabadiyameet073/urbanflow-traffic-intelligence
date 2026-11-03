-- 01_windowed_lane_health.sql
-- Purpose: Windowed lane health comparison across fixed and adaptive controllers
-- Input: lane_metrics table partitioned by date and controller
-- Grain: one row per (approach_lane, controller) within the current UTC day
-- Owner: Pipeline / Analytics

SELECT
  approach_lane,
  controller,
  AVG(max_queue_m) AS avg_max_queue_m,
  PERCENTILE_APPROX(pressure_index, 0.95) AS p95_pressure,
  SUM(vehicle_count) AS total_vehicles_observed,
  AVG(weighted_delay) AS avg_weighted_delay
FROM lane_metrics
-- Module 53 §1/§6: half-open [start, end) range on the raw column, never an
-- equality on a derived `date` — a function-wrapped predicate kills parquet
-- partition pruning and the equality form hides the timezone assumption.
-- Boundaries are UTC, matching `spark.sql.session.timeZone=UTC` (Module 53 §2).
WHERE window_start >= TIMESTAMP(CURRENT_DATE())
  AND window_start < TIMESTAMP(CURRENT_DATE() + INTERVAL 1 DAY)
GROUP BY approach_lane, controller
ORDER BY approach_lane, controller;

