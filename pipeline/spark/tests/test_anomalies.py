"""
Unit tests for Pure EWMA and Anomaly Detection Rules (Module 23).
"""
import unittest
from urbanflow.anomalies import Ewma, ewma_update, zscore, detect_anomalies

class TestAnomalyDetection(unittest.TestCase):
    def test_ewma_update_and_zscore(self):
        s = Ewma(mean=10.0, var=4.0, n=12) # std = 2.0
        # Normal value
        z_normal = zscore(s, 11.0)
        self.assertAlmostEqual(z_normal, 0.5, places=2)

        # Extreme surge
        z_surge = zscore(s, 18.0)
        self.assertGreater(z_surge, 2.5)

        # Update step
        s2 = ewma_update(s, 15.0, alpha=0.1)
        self.assertEqual(s2.n, 13)
        self.assertGreater(s2.mean, 10.0)

    def test_blockage_detection(self):
        window = {
            "approach_lane": "NB-TR",
            "vehicle_count": 8,
            "discharge_count": 0,
            "max_queue_m": 85.0,
            "run_id": "run-test",
            "window_start": "2026-10-27T10:00:00Z",
            "window_end": "2026-10-27T10:00:10Z",
        }
        anomalies, _ = detect_anomalies(window, signal_indication="G")
        types = [a["type"] for a in anomalies]
        self.assertIn("BLOCKAGE", types)
        blockage = next(a for a in anomalies if a["type"] == "BLOCKAGE")
        self.assertEqual(blockage["lane"], "NB-TR")

    def test_demand_surge_after_warmup(self):
        # Warmup with n = 15 windows
        s = Ewma(mean=5.0, var=1.0, n=15)
        window = {
            "approach_lane": "SB-TR",
            "vehicle_count": 18, # severe spike
            "discharge_count": 12,
            "max_queue_m": 40.0,
            "run_id": "run-test",
            "window_start": "2026-10-27T10:05:00Z",
            "window_end": "2026-10-27T10:05:10Z",
        }
        anomalies, _ = detect_anomalies(window, ewma_state=s, signal_indication="G")
        types = [a["type"] for a in anomalies]
        self.assertIn("DEMAND_SURGE", types)

    def test_signal_stuck_detection(self):
        window = {
            "approach_lane": "EB-TR",
            "vehicle_count": 2,
            "discharge_count": 2,
            "max_queue_m": 10.0,
            "run_id": "run-test",
            "window_start": "2026-10-27T10:00:00Z",
            "window_end": "2026-10-27T10:00:10Z",
        }
        anomalies, _ = detect_anomalies(window, signal_indication="G", signal_duration_s=75.0)
        types = [a["type"] for a in anomalies]
        self.assertIn("SIGNAL_STUCK", types)

    def test_ems_delayed_detection(self):
        window = {
            "approach_lane": "WB-L",
            "vehicle_count": 5,
            "discharge_count": 0,
            "max_queue_m": 35.0,
            "run_id": "run-test",
            "window_start": "2026-10-27T10:00:00Z",
            "window_end": "2026-10-27T10:00:10Z",
        }
        anomalies, _ = detect_anomalies(window, signal_indication="R", ems_wait_s=22.0)
        types = [a["type"] for a in anomalies]
        self.assertIn("EMS_DELAYED", types)

if __name__ == "__main__":
    unittest.main()
