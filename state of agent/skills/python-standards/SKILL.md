# Skill: python-standards

**Use when:** Writing Python in pipeline/ or vision/.

**Read first:** `languages-and-tooling/52`, `languages-and-tooling/53`

## Rules

1. Python 3.11, typed, `ruff` + `mypy --strict`, pinned requirements.
2. Frozen dataclasses for records; settings loaded once from env.
3. No `print`; JSON logging; UTC-aware datetimes.
4. Pure functions in the core; IO and Spark session only in entry points.
5. Tests with pytest and fixtures; Hypothesis where invariants exist.

## Good / Bad

- ✅ `@dataclass(frozen=True, slots=True)`
- ❌ `except Exception: pass`

## Landmines

- `pip install` needs `--break-system-packages` only in disposable sandboxes.
