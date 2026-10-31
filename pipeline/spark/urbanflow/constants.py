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
