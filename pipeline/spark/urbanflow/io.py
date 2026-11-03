"""
Module 23 §2: configuration is read once, into a frozen `Settings` object.

Nothing below the entrypoint touches `os.environ`. That rule exists because a
config read buried in a function is untestable and turns a missing variable into
a failure at row 40 000 instead of at startup.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Mapping

DEFAULT_KAFKA_BOOTSTRAP = "127.0.0.1:9092"
DEFAULT_LAKE_PATH = "/data/lake"
DEFAULT_MONGO_DB = "urbanflow"

# Module 23 §3: the default of 200 shuffle partitions is wasteful on one
# intersection. 6 keeps the small aggregations to one wave of tasks.
DEFAULT_SHUFFLE_PARTITIONS = 6
LOCAL_SHUFFLE_RANGE = (6, 8)


@dataclass(frozen=True)
class Settings:
    """Immutable pipeline configuration, resolved once at startup."""

    kafka_bootstrap_servers: str
    lake_storage_path: str
    shuffle_partitions: int
    extra_jars: str
    # Optional analytics mirror (ADR-0008 keeps Parquet authoritative). An empty
    # `mongo_uri` disables the mirror entirely, so the default quickstart is
    # unchanged and no MongoDB needs to be running unless the operator opts in.
    mongo_uri: str = ""
    mongo_db: str = DEFAULT_MONGO_DB

    @property
    def mongo_enabled(self) -> bool:
        return bool(self.mongo_uri.strip())

    @property
    def checkpoint_root(self) -> str:
        return f"{self.lake_storage_path}/_checkpoints"

    @property
    def lane_metrics_checkpoint(self) -> str:
        # Module 23 §3: one streaming query, one checkpoint directory.
        return f"{self.checkpoint_root}/lane_metrics"

    @property
    def heartbeat_path(self) -> str:
        return f"{self.lake_storage_path}/_health/stream.json"


def _int_or(value: str | None, fallback: int, low: int, high: int) -> int:
    """Parse an int in [low, high]; anything else falls back instead of raising."""
    if value is None or not value.strip():
        return fallback
    try:
        parsed = int(value)
    except ValueError:
        return fallback
    return parsed if low <= parsed <= high else fallback


def load_settings(environ: Mapping[str, str] | None = None) -> Settings:
    """Build `Settings` from a mapping (defaults to `os.environ`)."""
    env = os.environ if environ is None else environ
    lake = env.get("LAKE_STORAGE_PATH", "").strip() or DEFAULT_LAKE_PATH
    kafka = env.get("KAFKA_BOOTSTRAP_SERVERS", "").strip() or DEFAULT_KAFKA_BOOTSTRAP
    partitions = _int_or(
        env.get("SPARK_SHUFFLE_PARTITIONS"),
        DEFAULT_SHUFFLE_PARTITIONS,
        LOCAL_SHUFFLE_RANGE[0],
        LOCAL_SHUFFLE_RANGE[1],
    )
    # A single MongoDB is shared with the edge gateway: prefer an explicit
    # pipeline `MONGO_URI`, else fall back to the edge's `MONGODB_URI`. Neither
    # set => mirror disabled.
    mongo_uri = (env.get("MONGO_URI", "").strip() or env.get("MONGODB_URI", "").strip())
    mongo_db = env.get("MONGO_DB", "").strip() or env.get("MONGODB_DB_NAME", "").strip() or DEFAULT_MONGO_DB
    return Settings(
        kafka_bootstrap_servers=kafka,
        lake_storage_path=lake.rstrip("/"),
        shuffle_partitions=partitions,
        extra_jars=env.get("SPARK_EXTRA_JARS", "").strip(),
        mongo_uri=mongo_uri,
        mongo_db=mongo_db,
    )
