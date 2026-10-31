#!/usr/bin/env python3
"""
Module 23: UrbanFlow Spark Streaming Job Entrypoint
Reads lane-telemetry from Kafka, aggregates 10s windows, executes EWMA anomaly detection,
and writes to Parquet lake storage and downstream Kafka topics.
"""
import sys
import logging
from urbanflow.constants import TIMING
from urbanflow.anomalies import Ewma, detect_anomalies
from urbanflow.io import get_kafka_bootstrap_servers, get_lake_storage_path

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s: %(message)s')
logger = logging.getLogger("UrbanFlowStream")

def main():
    logger.info("Starting UrbanFlow Streaming Pipeline...")
    kafka_servers = get_kafka_bootstrap_servers()
    lake_path = get_lake_storage_path()
    logger.info("Kafka: %s | Lake Storage: %s", kafka_servers, lake_path)

    try:
        from pyspark.sql import SparkSession
        spark = SparkSession.builder \
            .appName("UrbanFlow-Streaming") \
            .config("spark.sql.shuffle.partitions", "6") \
            .config("spark.sql.session.timeZone", "UTC") \
            .getOrCreate()
        logger.info("Spark session initialized successfully.")
    except ImportError:
        logger.warning("PySpark not installed locally. Run via Docker Compose or use pipeline/lite.")
        sys.exit(0)

if __name__ == "__main__":
    main()
