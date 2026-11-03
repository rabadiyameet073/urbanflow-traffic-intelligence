"""
Fetch the pinned Kafka connector jars into the image (Module 23 §3, §5).

Why not `--packages`: that resolves from Maven on every container start, so the
same image can run different jars on different days. Here the versions are exact
URLs and the resolved digests are written next to them as `SHA256SUMS`, which is
what makes the image auditable after the fact.

Usage: python fetch_jars.py [destination]
"""
from __future__ import annotations

import hashlib
import sys
import urllib.request
from pathlib import Path

MAVEN_CENTRAL = "https://repo1.maven.org/maven2"

# Spark 3.5.2 ships against Scala 2.12 and Kafka clients 3.4.1. These four jars
# are the connector and its transitive runtime dependencies.
ARTIFACTS = (
    "org/apache/spark/spark-sql-kafka-0-10_2.12/3.5.2/spark-sql-kafka-0-10_2.12-3.5.2.jar",
    "org/apache/spark/spark-token-provider-kafka-0-10_2.12/3.5.2/"
    "spark-token-provider-kafka-0-10_2.12-3.5.2.jar",
    "org/apache/kafka/kafka-clients/3.4.1/kafka-clients-3.4.1.jar",
    "org/apache/commons/commons-pool2/2.11.1/commons-pool2-2.11.1.jar",
)


def main() -> int:
    destination = Path(sys.argv[1] if len(sys.argv) > 1 else "/opt/urbanflow/jars")
    destination.mkdir(parents=True, exist_ok=True)

    digests = []
    for relative in ARTIFACTS:
        name = relative.rsplit("/", 1)[-1]
        target = destination / name
        if not target.exists():
            url = f"{MAVEN_CENTRAL}/{relative}"
            with urllib.request.urlopen(url, timeout=120) as response:  # noqa: S310 - pinned https host
                target.write_bytes(response.read())
        digests.append(f"{hashlib.sha256(target.read_bytes()).hexdigest()}  {name}")

    (destination / "SHA256SUMS").write_text("\n".join(digests) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
