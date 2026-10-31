SHELL := bash
.SHELLFLAGS := -eu -o pipefail -c

.PHONY: up demo test record down clean

up:
	docker compose up -d kafka
	@echo "Waiting for Kafka to become healthy..."
	docker compose up -d spark

demo: up
	@echo "Starting UrbanFlow pipeline demo stream..."
	docker compose logs -f spark

test:
	@echo "Running pipeline integration test..."
	python spark/tests/test_anomalies.py

record:
	@echo "Recording 3-minute run..."
	mkdir -p recordings/run_001

down:
	docker compose down

clean:
	docker compose down -v
