# Module 23 §6: Makefile contract.
#
# Two targets deliberately differ from the module's table and are tracked in
# docs/validation/LIMITATIONS.md item 21: `make test` runs the unit + contract
# suite (that is what executes locally), and `make test-integration` /
# `make record` assert against a running stack and there is no producer to feed
# Kafka yet.

SHELL := bash
.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := help

PY ?= python

.PHONY: help up topics demo test lint typecheck test-integration record down clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "%-18s %s\n",$$1,$$2}'

up: topics ## Start Kafka + the Spark job
	docker compose up -d --wait kafka
	docker compose up -d spark

# Module 12 §3.1: names, partitions and retention are frozen — creating them
# implicitly would give the wrong partition count and an auto-generated name.
topics: ## Create the frozen Kafka topics (idempotent --if-not-exists)
	docker compose up -d --wait kafka
	docker compose exec -T kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 \
		--create --if-not-exists --topic lane-telemetry --partitions 3 --replication-factor 1 \
		--config retention.ms=3600000
	docker compose exec -T kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 \
		--create --if-not-exists --topic signal-state --partitions 1 --replication-factor 1 \
		--config retention.ms=3600000
	docker compose exec -T kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 \
		--create --if-not-exists --topic emergency-events --partitions 1 --replication-factor 1 \
		--config retention.ms=3600000
	docker compose exec -T kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 \
		--create --if-not-exists --topic lane-metrics --partitions 3 --replication-factor 1 \
		--config retention.ms=3600000
	docker compose exec -T kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 \
		--create --if-not-exists --topic anomaly-events --partitions 1 --replication-factor 1 \
		--config retention.ms=3600000
	docker compose exec -T kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 \
		--create --if-not-exists --topic dlq --partitions 1 --replication-factor 1 \
		--config retention.ms=86400000

demo: up ## Tail the streaming job; telemetry comes from the browser or Lite runner
	@echo "Tail the Spark job; telemetry is produced by the browser session or the Lite runner."
	docker compose logs -f spark

# Unit + contract: window math, EWMA rules, constants parity with contracts.ts.
# Needs no Docker and no Spark, which is why CI can run it.
test: ## Run the unit + contract suite (no Docker, no Spark required)
	$(PY) -m pytest

lint: ## Run ruff over the Spark sources
	ruff check spark 2>/dev/null || echo "ruff not installed; run 'pip install ruff==0.6.9'"

typecheck: ## Run mypy over the library code
	mypy 2>/dev/null || echo "mypy not installed; run 'pip install mypy==1.11.2'"

# Module 23 §6 integration flow. Requires a running stack AND a producer, which
# this build does not have yet. Fails loudly rather than pretending.
test-integration: ## Integration flow (fails: this build has no producer)
	@echo "No producer in this build: nothing can be published to lane-telemetry." >&2
	@echo "See docs/validation/LIMITATIONS.md item 21." >&2
	exit 1

record: ## Record demo clips (fails: this build has no producer)
	@echo "Recordings need the producer too; see LIMITATIONS 21 / T26." >&2
	exit 1

down: ## Stop the stack, keep named volumes
	docker compose down

clean: ## DESTRUCTIVE: stop the stack and delete its named volumes
	@echo "Removing the compose stack and all named data volumes (docker compose down -v)."
	docker compose down -v
