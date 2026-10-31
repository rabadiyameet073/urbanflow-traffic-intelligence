"""
Module 23 & Module 26: PySpark StructType Schemas Mirroring contracts.ts
"""

try:
    from pyspark.sql.types import (
        StructType,
        StructField,
        StringType,
        IntegerType,
        DoubleType,
        TimestampType,
        ArrayType,
    )

    LANE_METRICS_SCHEMA = StructType([
        StructField("window_start", TimestampType(), False),
        StructField("window_end", TimestampType(), False),
        StructField("intersection_id", StringType(), False),
        StructField("controller", StringType(), False),
        StructField("approach_lane", StringType(), False),
        StructField("vehicle_count", IntegerType(), False),
        StructField("weighted_delay", DoubleType(), False),
        StructField("max_queue_m", DoubleType(), False),
        StructField("avg_speed_kmh", DoubleType(), True),
        StructField("discharge_count", IntegerType(), False),
        StructField("pressure_index", DoubleType(), False),
        StructField("run_id", StringType(), False),
        StructField("schema_version", IntegerType(), False),
    ])

    ANOMALIES_SCHEMA = StructType([
        StructField("schema_version", IntegerType(), False),
        StructField("event_id", StringType(), False),
        StructField("type", StringType(), False),
        StructField("lane", StringType(), False),
        StructField("severity", StringType(), False),
        StructField("evidence", ArrayType(StringType()), False),
        StructField("window_start", TimestampType(), False),
        StructField("window_end", TimestampType(), False),
        StructField("detected_at", TimestampType(), False),
        StructField("run_id", StringType(), False),
    ])

except ImportError:
    # Standalone environment without PySpark installed
    LANE_METRICS_SCHEMA = None
    ANOMALIES_SCHEMA = None
