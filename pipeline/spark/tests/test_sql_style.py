"""
Module 26 §4: every analytical query under `pipeline/sql/` is stored with a
header (purpose, inputs, owner) and is checked here, in CI, rather than being
copy-pasted from a notebook. Executing the queries needs a Spark session, which
the producer-less environment does not have (LIMITATIONS item 21), so this gate
is static — but it fails on the style violations that would make a hand-run
result irreproducible: implicit columns, untyped date filters, and missing
lineage headers.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import List

SQL_DIR = Path(__file__).resolve().parents[2] / "sql"

HEADER_KEYS = ("Purpose:", "Input:", "Owner:")

# Keywords that must appear uppercase; matches case-sensitively first so the
# lowercase occurrence is the violation.
KEYWORDS = [
    "SELECT",
    "FROM",
    "WHERE",
    "GROUP BY",
    "ORDER BY",
    "AS",
    "AND",
    "OR",
    "COUNT",
    "SUM",
    "AVG",
    "DATE",
    "TIMESTAMP",
]


def _sql_files() -> List[Path]:
    files = sorted(SQL_DIR.glob("*.sql"))
    assert files, f"no .sql files found under {SQL_DIR}"
    return files


def test_every_query_has_a_header() -> None:
    for path in _sql_files():
        text = path.read_text(encoding="utf-8")
        head = "\n".join(text.splitlines()[:6])
        for key in HEADER_KEYS:
            assert key in head, f"{path.name}: header must state '{key}' (module 26 §4)"


def test_no_select_star_outside_exploration() -> None:
    for path in _sql_files():
        text = path.read_text(encoding="utf-8")
        assert not re.search(r"SELECT\s+\*", text, re.IGNORECASE), (
            f"{path.name}: explicit column lists only"
        )


def test_keywords_are_uppercase_and_identifiers_snake_case() -> None:
    pattern = re.compile(r"(?<![A-Z_])(" + "|".join(kw for kw in KEYWORDS if kw not in ("AS", "DATE", "TIMESTAMP")) + r")\b", re.IGNORECASE)
    for path in _sql_files():
        text = "\n".join(
            line for line in path.read_text(encoding="utf-8").splitlines() if not line.strip().startswith("--")
        )
        for match in pattern.finditer(text):
            assert match.group(0) == match.group(0).upper(), (
                f"{path.name}: keyword '{match.group(0)}' must be uppercase"
            )
        # snake_case columns: no camelCase identifiers in the projection list.
        assert not re.search(r"\b[a-z]+[A-Z][a-zA-Z]*\b", text), (
            f"{path.name}: identifiers must be snake_case (module 26 §2)"
        )


def test_order_by_has_a_tiebreaker_when_present() -> None:
    for path in _sql_files():
        for match in re.finditer(r"ORDER BY\s+([^;]+)", path.read_text(encoding="utf-8"), re.IGNORECASE):
            columns = [c.strip().split()[0].lower() for c in match.group(1).split(",")]
            assert len(columns) >= 2, f"{path.name}: ORDER BY needs a tie-breaker column"


def test_date_predicates_are_typed_literals_or_functions() -> None:
    for path in _sql_files():
        text = path.read_text(encoding="utf-8")
        for match in re.finditer(r"date\s*=\s*([^%\n]+)", text, re.IGNORECASE):
            value = match.group(1).strip()
            assert (
                re.match(r"DATE\s+'", value, re.IGNORECASE) or value.upper().startswith(("DATE_", "CURRENT_", "TIMESTAMP"))
            ), f"{path.name}: date predicate '{value}' is not a typed literal or documented function"
