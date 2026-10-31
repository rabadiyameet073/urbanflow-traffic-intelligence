"""
Module 23: Streaming Latency Tracking
"""
import time
from typing import Dict, Any

class LatencyTracker:
    def __init__(self):
        self.samples = []

    def record(self, produced_at_ms: int, processed_at_ms: int = 0) -> int:
        if processed_at_ms == 0:
            processed_at_ms = int(time.time() * 1000)
        latency = max(0, processed_at_ms - produced_at_ms)
        self.samples.append(latency)
        return latency

    def p95(self) -> float:
        if not self.samples:
            return 0.0
        sorted_samples = sorted(self.samples)
        idx = int(0.95 * (len(sorted_samples) - 1))
        return float(sorted_samples[idx])
