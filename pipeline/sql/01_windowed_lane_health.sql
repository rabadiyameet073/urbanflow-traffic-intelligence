-- 01_windowed_lane_health.sql
-- Purpose: Windowed lane health comparison across fixed and adaptive controllers
-- Input: lane_metrics table partitioned by date and controller
-- Owner: Pipeline / Analytics

SELECT
  approach_lane,
  controller,
  AVG(max_queue_m) AS avg_max_queue_m,
  PERCENTILE_APPROX(pressure_index, 0.95) AS p95_pressure,
  SUM(vehicle_count) AS total_vehicles_observed,
  AVG(weighted_delay) AS avg_weighted_delay
FROM lane_metrics
WHERE date = CURRENT_DATE()
GROUP BY approach_lane, controller
ORDER BY approach_lane, controller;
