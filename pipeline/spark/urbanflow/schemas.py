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

    # Module 23 §3: the Kafka value is parsed with an explicit schema. `inferSchema`
    # would sample the first batch, guess a column to be a string, and then fail
    # on a batch that carries the same field as a number.
    LANE_TELEMETRY_SCHEMA = StructType([
        StructField("schemaVersion", IntegerType(), False),
        StructField("eventId", StringType(), False),
        StructField("timestamp", StringType(), False),
        StructField("intersectionId", StringType(), False),
        StructField("controller", StringType(), True),
        StructField("approachLane", StringType(), False),
        StructField(
            "vehicle",
            StructType([
                StructField("vehicleId", StringType(), False),
                StructField("type", StringType(), False),
                StructField("priorityLevel", DoubleType(), False),
                StructField("speedKmh", DoubleType(), False),
                StructField("distanceToStopLineMeters", DoubleType(), False),
                StructField("waitingTimeSeconds", DoubleType(), False),
            ]),
            False,
        ),
        StructField(
            "laneMetrics",
            StructType([
                StructField("currentQueueLengthMeters", DoubleType(), False),
                StructField("occupancyPercent", DoubleType(), False),
            ]),
            False,
        ),
    ])

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
    LANE_TELEMETRY_SCHEMA = None
    LANE_METRICS_SCHEMA = None
    ANOMALIES_SCHEMA = None

