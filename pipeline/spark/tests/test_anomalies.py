"""
Unit tests for Pure EWMA and Anomaly Detection Rules (Module 23).

§4 also pins the statistical floors: 1 000 normal windows must false-alarm at
under 1 %, and the West update must match a reference implementation. Both run
without Spark; the PRNG is seeded, so a failure here is reproducible (module
02 §7: seeded streams, never a bare random call).
"""
import random
import unittest
from urbanflow.anomalies import Ewma, ewma_update, zscore, detect_anomalies
from urbanflow.constants import EWMA_ALPHA

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

    def test_false_alarm_rate_below_one_percent_on_normal_traffic(self):
        # Module 23 §4: 1 000 normal windows, seeded so any failure replays.
        rng = random.Random(1403)
        state = None
        surges = 0
        for i in range(1000):
            count = max(0, round(rng.gauss(5.0, 0.8)))
            window = {
                "approach_lane": "NB-TR",
                "vehicle_count": count,
                "discharge_count": count,  # flowing: no BLOCKAGE by construction
                "max_queue_m": 20.0,
                "run_id": "run-normal",
                "window_start": "2026-10-27T10:00:00Z",
                "window_end": "2026-10-27T10:00:10Z",
            }
            anomalies, state = detect_anomalies(
                window, state, signal_indication="G", window_index=i
            )
            surges += sum(1 for a in anomalies if a["type"] == "DEMAND_SURGE")
        self.assertLess(surges / 1000.0, 0.01)

    def test_ewma_matches_numpy_reference(self):
        # Module 23 §4: numerical correctness against a reference implementation.
        import numpy as np

        rng = random.Random(42)
        series = [float(rng.randint(0, 12)) for _ in range(200)]

        mine = Ewma(mean=0.0, var=0.0, n=0)
        for x in series:
            mine = ewma_update(mine, x, alpha=EWMA_ALPHA)

        # Same recurrence, evaluated in numpy float64 as the reference.
        mean = np.float64(series[0])
        var = np.float64(0.0)
        alpha = np.float64(EWMA_ALPHA)
        for x in series[1:]:
            d = np.float64(x) - mean
            mean = mean + alpha * d
            var = (np.float64(1.0) - alpha) * (var + alpha * d * d)

        self.assertAlmostEqual(mine.mean, float(mean), places=10)
        self.assertAlmostEqual(mine.var, float(var), places=10)
        self.assertEqual(mine.n, len(series))

if __name__ == "__main__":
    unittest.main()

