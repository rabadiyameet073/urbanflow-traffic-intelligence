# Module 54: Shell, Make, Docker, YAML & TOML Standards

> The glue languages. They break demos at 2 a.m., so they get strict rules.

---

## 1. Bash

| Rule | Detail |
|---|---|
| Header | `#!/usr/bin/env bash` + `set -euo pipefail` + `IFS=$'\n\t'` |
| Linting | `shellcheck` clean (CI) and `shfmt -i 2` |
| Quoting | Quote every expansion: `"$var"`, `"${arr[@]}"` |
| Portability | Bash only (state it); avoid GNU-only flags in scripts meant for macOS (or detect) |
| Arguments | `getopts`/manual parser with `--help`; fail on unknown flags |
| Temp files | `mktemp -d` + `trap 'rm -rf "$tmp"' EXIT` |
| Dangerous ops | Never `rm -rf "$var/"` with an unchecked variable; use `${var:?}` |
| Secrets | Never echoed; `set +x` around anything touching them; no secrets in command lines (they appear in process lists) |
| Output | Errors to stderr; machine output to stdout |
| Idempotency | Safe to re-run |
| Size | Over ~80 lines or any real logic ⇒ write it in TypeScript or Python |

Template:

```bash
#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'
usage() { echo "Usage: $0 --url <live-url>" >&2; exit 2; }
url=""; while [[ $# -gt 0 ]]; do case "$1" in --url) url="${2:?}"; shift 2;; -h|--help) usage;; *) usage;; esac; done
[[ -n "$url" ]] || usage
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
curl --fail --silent --show-error --max-time 10 "$url/api/health" -o "$tmp/health.json"
```

---

## 2. Makefile

```make
SHELL := bash
.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := help
.PHONY: help up demo test record down clean

help: ## Show targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "%-12s %s\n",$$1,$$2}'
up: ## Start Kafka + Spark
	docker compose up -d --wait
```

Rules: `.PHONY` for non-file targets; tabs for recipes; no business logic (call scripts); `--wait`/healthchecks instead of `sleep`; every target documented with `##`; destructive targets (`clean`) print what they remove.

---

## 3. Dockerfile

```dockerfile
# syntax=docker/dockerfile:1
FROM python:3.11-slim-bookworm AS base          # pin tag; digest when practical
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY spark/ ./spark/
RUN useradd --uid 10001 --no-create-home app
USER 10001
ENTRYPOINT ["python","-m","urbanflow.cli"]
```

Rules: pinned base tags; multi-stage when build tools are needed; copy dependency manifests before source (layer cache); non-root `USER`; no `latest`; no secrets in layers (`ARG`/`ENV` for secrets forbidden); `HEALTHCHECK` where a service listens; `.dockerignore` present; one process per container; minimal packages (`--no-install-recommends`, clean apt lists); labels for source/version.

`hadolint` runs in CI on every Dockerfile.

---

## 4. docker-compose.yml

| Rule | Detail |
|---|---|
| Version | Compose spec (no obsolete `version:` key needed) |
| Pinned images | Exact tags |
| Resources | `mem_limit` on every service (total ≈ 4 GB) |
| Ports | Bind `127.0.0.1:` only |
| Health | `healthcheck` + `depends_on: condition: service_healthy` |
| Volumes | Named volumes for data; read-only mounts for configs (`:ro`) |
| Profiles | `hdfs`, `s3` optional (`profiles: [hdfs]`) |
| Env | `env_file` only for non-secret config; no secrets required for this pipeline |
| Restart | `restart: "no"` for demos (failures must be visible) |

---

## 5. YAML

- 2-space indent; no tabs; quote strings that could be parsed as other types (`"1.0"`, `"on"`, `"no"`, `"0123"`).
- No anchors/merge keys in CI files unless necessary (readability).
- `yamllint` (relaxed line length 120) in CI; GitHub Actions validated with `actionlint`.
- Parse with a **safe** loader only (`yaml.safe_load`, `js-yaml` `safeLoad` semantics).
- Comments explain *why* a non-default value exists.

---

## 6. TOML (wrangler, pyproject)

- Keys lowercase snake/kebab per tool convention; arrays of tables for bindings/migrations.
- `compatibility_date` = date the project was created; update deliberately, re-run tests.
- No secrets in `wrangler.toml` (vars only); secrets via `wrangler secret put`.
- Formatting by `taplo` (optional) or Prettier plugin; validated by the tool itself (`wrangler deploy --dry-run`).

---

## 7. Config & Env Naming

| Prefix | Meaning |
|---|---|
| `VITE_*` | Build-time public web vars (visible in the bundle — **never secrets**) |
| `META_*`, `EVP_*`, `AI_*` | Edge settings |
| `UF_*` | Local tooling toggles (`UF_LITE=1`) |
| No prefix for third-party tool vars (`HF_TOKEN`) |

Document every variable in `.env.example` (name only, comment with purpose) and in `docs/DEPLOY.md`.

---

## 8. Anti-Patterns

| ❌ | ✅ |
|---|---|
| `sleep 30` waiting for services | Healthchecks + `--wait` |
| `docker run --privileged` | Minimal capabilities |
| `curl … | bash` installers in CI | Pinned package installs |
| Secrets in `docker-compose.yml` or Dockerfile | Runtime env/secret stores |
| Unquoted `$VAR` | `"$VAR"` |
| 300-line Bash | TypeScript/Python script with tests |
| `latest` tags | Exact tags/digests |
