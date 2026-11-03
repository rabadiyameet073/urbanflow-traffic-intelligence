"""
Constants mirroring @urbanflow/core contracts.ts (Rule 12).
"""
LANES = [
    "NB-TR", "NB-L",
    "SB-TR", "SB-L",
    "EB-TR", "EB-L",
    "WB-TR", "WB-L",
]

PHASES = [
    "P1_NS_LEFT",
    "P2_NS_THRU",
    "P3_EW_LEFT",
    "P4_EW_THRU",
]

PHASE_LANES = {
    "P1_NS_LEFT": ("NB-L", "SB-L"),
    "P2_NS_THRU": ("NB-TR", "SB-TR"),
    "P3_EW_LEFT": ("EB-L", "WB-L"),
    "P4_EW_THRU": ("EB-TR", "WB-TR"),
}

TIMING = {
    "G_MIN_S": 7.0,
    "G_MAX_S": 65.0,
    "YELLOW_S": 3.5,
    "ALL_RED_S": 2.0,
    "PLANNING_WINDOW_S": 10.0,
    "FIXED_CYCLE_S": 90.0,
    "WINDOW_DURATION_S": 10.0,
}

SCHEMA_VERSION = 1

# Module 02 §3 / Module 12 §3.1 (Rule 12): the six frozen Kafka topics —
# name, message key, partition count and retention. `tests/test_constants.py`
# parses the `KAFKA_TOPICS` block in contracts.ts and fails on drift; the
# Makefile creates exactly these topics.
KAFKA_TOPICS = {
    "laneTelemetry": {"name": "lane-telemetry", "key": "intersectionId:lane", "partitions": 3, "retention_ms": 3_600_000},
    "signalState": {"name": "signal-state", "key": "intersectionId", "partitions": 1, "retention_ms": 3_600_000},
    "emergencyEvents": {"name": "emergency-events", "key": "intersectionId", "partitions": 1, "retention_ms": 3_600_000},
    "laneMetrics": {"name": "lane-metrics", "key": "intersectionId:lane", "partitions": 3, "retention_ms": 3_600_000},
    "anomalyEvents": {"name": "anomaly-events", "key": "intersectionId", "partitions": 1, "retention_ms": 3_600_000},
    "dlq": {"name": "dlq", "key": "topic", "partitions": 1, "retention_ms": 86_400_000},
}

# --- Mirrors of packages/core contracts -------------------------------------------------
# `pressure.py` in core is the single source of truth; these three tables exist
# so the Python side can compute the same index without importing TypeScript.
# `tests/test_constants.py` parses contracts.ts and fails when they drift.

# VEHICLE_SPECS[type].priorityWeight
VEHICLE_PRIORITY_WEIGHTS = {
    "BIKE": 1.0,
    "CAR": 1.2,
    "BUS": 8.5,
    "TRUCK": 2.0,
    "AMBULANCE": 1000.0,
}

# DEFAULT_PRESSURE_WEIGHTS
PRESSURE_WEIGHTS = {"alpha": 1.0, "beta": 1.0, "gamma": 1.0}

# DEFAULT_SIM_CONFIG.laneLengthM
LANE_LENGTH_M = 300.0

# Module 23 §4: West's update with alpha 0.1, a z threshold of 2.5 and a warm-up
# of 12 windows before a z-score is meaningful. These are the values the
# detector below actually uses — not aspirations, and not a second copy.
EWMA_ALPHA = 0.1
EWMA_WARMUP_N = 12
EWMA_Z_THRESHOLD = 2.5

