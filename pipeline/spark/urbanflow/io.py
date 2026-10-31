"""
Module 23: Spark & Kafka Streaming I/O Connectors
"""
import os

def get_kafka_bootstrap_servers() -> str:
    return os.environ.get("KAFKA_BOOTSTRAP_SERVERS", "127.0.0.1:9092")

def get_lake_storage_path() -> str:
    return os.environ.get("LAKE_STORAGE_PATH", "/data/lake")
