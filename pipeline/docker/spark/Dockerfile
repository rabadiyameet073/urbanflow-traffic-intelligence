# syntax=docker/dockerfile:1
# Module 23 §5: pinned base, multi-stage, non-root, requirements copied first.
#
# Build context is `pipeline/docker/spark` (module 23 §5 compose skeleton), so
# application code is NOT baked in: `spark/` is mounted read-only at /app. The
# image carries the interpreter and the pinned jars; the job carries the logic.

FROM python:3.11.9-slim-bookworm AS builder

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Layer cache: requirements change far less often than the jars do.
COPY requirements.txt /tmp/requirements.txt
RUN python -m venv /opt/venv \
    && /opt/venv/bin/pip install --upgrade pip==24.0 \
    && /opt/venv/bin/pip install -r /tmp/requirements.txt

COPY fetch_jars.py /tmp/fetch_jars.py
RUN /opt/venv/bin/python /tmp/fetch_jars.py /opt/urbanflow/jars


FROM python:3.11.9-slim-bookworm AS runtime

# PySpark needs a JVM; headless JRE keeps the image ~200 MB smaller than a JDK.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openjdk-17-jre-headless \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH=/opt/venv/bin:$PATH \
    JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 \
    SPARK_EXTRA_JARS=/opt/urbanflow/jars/spark-sql-kafka-0-10_2.12-3.5.2.jar,/opt/urbanflow/jars/spark-token-provider-kafka-0-10_2.12-3.5.2.jar,/opt/urbanflow/jars/kafka-clients-3.4.1.jar,/opt/urbanflow/jars/commons-pool2-2.11.1.jar \
    LAKE_STORAGE_PATH=/data/lake

COPY --from=builder /opt/venv /opt/venv
COPY --from=builder /opt/urbanflow/jars /opt/urbanflow/jars

# Module 23 §5: never root. 10001 matches the uid the compose file runs as.
RUN groupadd --gid 10001 urbanflow \
    && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin urbanflow

# The named volume is initialised from the image on first use, so the ownership
# here is what makes /data writable for 10001 without a root fix-up step.
RUN mkdir -p /data/lake \
    && chown -R 10001:10001 /data

USER 10001
WORKDIR /app

# Module 54 §3: provenance labels. The version mirrors the single pinned source
# of truth (`pipeline/pyproject.toml` = 0.1.0); the source/revision are injected
# by CI at build time rather than hard-coded here, because the git remote and
# commit are not recorded in the tree and inventing one would break Rule 00.
LABEL org.opencontainers.image.title="urbanflow-spark" \
      org.opencontainers.image.description="UrbanFlow AI Spark streaming pipeline" \
      org.opencontainers.image.version="0.1.0" \
      org.opencontainers.image.licenses="MIT"

# No secrets are passed by this image: the pipeline needs none (Module 23 §5).
ENTRYPOINT ["python", "urbanflow_stream.py"]
