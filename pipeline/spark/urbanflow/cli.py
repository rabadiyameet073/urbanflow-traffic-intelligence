"""
Module 52 §5: entrypoints via `python -m urbanflow.cli`, not ad-hoc scripts.

A thin argparse driver over the streaming job. The real entrypoint stays
`spark/urbanflow_stream.py` (that is what the Docker image runs); this module
exists so the *documented* invocation form works and so future subcommands
have a home that is not a loose script in the repo root.

Run it from the `spark/` directory (where `urbanflow_stream.py` is importable)
or with `PYTHONPATH` pointing there:

    python -m urbanflow.cli run-stream
"""
from __future__ import annotations

import argparse
import importlib
import sys
from typing import Sequence


def _version() -> str:
    """Module 52 §5: record the package version in outputs.

    The distribution is not installed (no setup.py by design — Module 23 §2),
    so `importlib.metadata` has nothing to read; the version then comes from
    `pyproject.toml` and is reported as unknown rather than guessed (Rule 00).
    """
    try:
        from importlib.metadata import PackageNotFoundError, version

        return version("urbanflow-pipeline")
    except (ImportError, PackageNotFoundError):
        return "unknown"


def _run_stream() -> int:
    try:
        entry = importlib.import_module("urbanflow_stream")
    except ImportError as exc:  # narrow on purpose (Module 52 §2.4)
        print(
            "urbanflow_stream is not importable; run from the spark/ directory"
            " or add it to PYTHONPATH.",
            file=sys.stderr,
        )
        raise SystemExit(2) from exc
    return entry.main()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="urbanflow.cli")
    parser.add_argument("--version", action="version", version=_version())
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("run-stream", help="start the Kafka -> lake streaming job")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.command == "run-stream":
        return _run_stream()
    return 2  # unreachable while `required=True`; no implicit fall-through
