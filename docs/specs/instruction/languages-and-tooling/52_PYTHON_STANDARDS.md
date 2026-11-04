# Module 52: Python Standards

> Python is used for `pipeline/` (Spark job, anomaly logic), `vision/` (SAM 3.1, Muse Image, geometry, evaluation) and `evals/` runners where convenient. It is held to the same bar as TypeScript.

---

## 1. Baseline

| Item | Standard |
|---|---|
| Version | **3.11** (pinned in Docker, CI, `.python-version`) |
| Layout | `src`-style packages (`pipeline/spark/urbanflow/`, `vision/urbanflow_vision/`) with `tests/` beside |
| Dependencies | `requirements.txt` (runtime) + `requirements-dev.txt`; **exact pins** (`==`); hashes optional; `pip-audit` in CI |
| Env | Virtualenv per area or `uv`; never install globally; `pip install --break-system-packages` only in disposable sandboxes |
| Lint/format | `ruff` (lint + format); config in `pyproject.toml` |
| Types | `mypy --strict` on library code; type hints on every function |
| Tests | `pytest`, `pytest-cov` optional, Hypothesis for property tests where valuable |
| Docs | Google-style docstrings on public functions; units stated |

`pyproject.toml` essentials:

```toml
[tool.ruff]
line-length = 100
target-version = "py311"
[tool.ruff.lint]
select = ["E","F","I","B","UP","S","SIM","C4","PT","RUF","N","ANN"]
ignore = ["S101"]            # asserts allowed in tests only (per-file ignore recommended)
[tool.mypy]
strict = true
python_version = "3.11"
```

---

## 2. Language Rules

1. **Type everything public.** Use `dataclass(frozen=True, slots=True)` for records, `TypedDict`/`Protocol` for structural contracts, `Literal` for enums-as-strings, `NewType` for units where mixing is a risk.
2. **No mutable default arguments;** no module-level mutable state; no `global`.
3. **Explicit is better:** no `from x import *`; no implicit `Optional` (use `X | None`).
4. **Errors:** custom exception hierarchy (`UrbanFlowError`); never bare `except:`; catch the narrowest type; preserve causes (`raise … from e`).
5. **Logging, not printing:** `logging` with a JSON formatter; levels as in module 16; no secrets/PII in messages.
6. **Config:** one frozen `Settings` dataclass built from env at startup (`os.environ` read **once**); validation errors fail fast with a clear message.
7. **IO at the edges:** pure functions in the core of the module; file/network/Spark session creation only in entrypoints.
8. **Paths:** `pathlib.Path`, never string concatenation; `Path.resolve()` and containment checks when handling user-provided paths.
9. **Time:** timezone-aware UTC `datetime`; never naive; ISO-8601 on the wire.
10. **Numerics:** `float` for metrics; money not used here; avoid `==` on floats (`math.isclose`); NaN handling explicit.
11. **Concurrency:** none unless justified; Spark handles parallelism; no threads touching Spark sessions.
12. **Security:** no `eval/exec/pickle.load` on untrusted data; `subprocess.run([...], check=True)` with list args, never `shell=True`; `yaml.safe_load` only; ruff `S` rules enabled.

---

## 3. Vision Package Specifics

| Concern | Rule |
|---|---|
| Heavy deps (`torch`, `transformers`) | Isolated in `vision/requirements-colab.txt`; **not** installed in CI; CI tests geometry with stubs/fixtures |
| Gated model access | `HF_TOKEN` from env only (Colab secrets); never committed or printed |
| Determinism | Seeds set for `random`, `numpy`, `torch`; library versions recorded in output JSON |
| Outputs | JSON schema-validated (`pydantic` or `jsonschema`) before commit; includes model name/version, prompt, seed, input image hash |
| Evaluation | `vision/eval.py` compares to hand labels; reports MAE and failure cases honestly |
| Licences | Model licence accepted by the human; credited in `docs/CREDITS.md`; generated-image prompts stored |
| Geometry | Pure functions (mask → polygon → lane mapping → queue estimate) unit-tested with synthetic masks |

---

## 4. Testing

```python
def test_ewma_matches_reference():
    xs = [3.0, 4.0, 5.0, 4.5]
    s = Ewma(0.0, 0.0, 0)
    for x in xs: s = ewma_update(s, x, alpha=0.1)
    assert math.isclose(s.mean, reference_mean(xs, 0.1), rel_tol=1e-12)
```

- Golden fixtures in `tests/golden/*.json` with a README describing how to regenerate.
- Parametrised tests for rules (true positives, true negatives, boundary values).
- Property tests: window aggregation is order-independent within a window; EWMA invariants.
- Spark tests use a **session-scoped local SparkSession** fixture with `shuffle.partitions=2`, UTC timezone.
- Mark slow tests (`@pytest.mark.integration`); CI runs unit by default, integration via `make test`.
- Coverage target for pure logic ≥ 90 %; do not chase coverage in IO glue.

---

## 5. Packaging & Running

- Entrypoints via `python -m urbanflow.cli …` (argparse/typer), not ad-hoc scripts.
- Docker images run as non-root with a pinned base; `PYTHONDONTWRITEBYTECODE=1`, `PYTHONUNBUFFERED=1`.
- Reproducibility: record package versions in outputs (`importlib.metadata`).

---

## 6. Anti-Patterns

| ❌ | ✅ |
|---|---|
| `except Exception: pass` | Specific catch + log + decision |
| `print(df.collect())` | Structured log of a small aggregate |
| `datetime.now()` | `datetime.now(timezone.utc)` |
| `subprocess.run(cmd, shell=True)` | `subprocess.run([...], check=True)` |
| `pip install pyspark` (unpinned) | `pyspark==<pinned>` + matching connector |
| Notebook-only logic | Importable module + tests; notebook is a thin driver |
| Reading env vars in the middle of functions | Settings object |
