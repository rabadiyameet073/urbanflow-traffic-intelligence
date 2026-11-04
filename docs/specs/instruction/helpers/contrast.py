#!/usr/bin/env python3
"""WCAG 2.x contrast checker for UrbanFlow design tokens.

Usage:
    python3 -I contrast.py            # checks the built-in token pairs, exit 1 on failure
    python3 -I contrast.py '#E8EEF4' '#0B0F14'   # ad-hoc pair

Pairs are (foreground, background, minimum ratio, description).
Text needs 4.5 (3.0 for large text); non-text UI/graphics need 3.0.
"""
from __future__ import annotations

import sys


def _lin(c: float) -> float:
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4


def luminance(hex_color: str) -> float:
    h = hex_color.lstrip("#")
    r, g, b = (int(h[i : i + 2], 16) / 255 for i in (0, 2, 4))
    return 0.2126 * _lin(r) + 0.7152 * _lin(g) + 0.0722 * _lin(b)


def ratio(fg: str, bg: str) -> float:
    a, b = luminance(fg), luminance(bg)
    hi, lo = (a, b) if a >= b else (b, a)
    return (hi + 0.05) / (lo + 0.05)


# Keep in sync with design-and-motion/40_CONTROL_ROOM_DESIGN_SYSTEM.md
DARK = {
    "canvas": "#0B0F14", "surface": "#121820", "elevated": "#1A2330",
    "text": "#E8EEF4", "text-2": "#A9B6C6", "text-3": "#8594A8",
    "accent": "#56B4E9", "go": "#2FD4A0", "caution": "#F0E442", "stop": "#FF8A4C",
    "focus": "#F0E442", "border-strong": "#66778C",
}
LIGHT = {
    "canvas": "#F6F8FA", "surface": "#FFFFFF", "elevated": "#FFFFFF",
    "text": "#0B1520", "text-2": "#3A4A5C", "text-3": "#566679",
    "accent": "#005F96", "go": "#00694D", "caution": "#7A6A00", "stop": "#B33C00",
    "focus": "#005F96", "border-strong": "#6B7A8C",
}


def token_pairs() -> list[tuple[str, str, str, float, str]]:
    out = []
    for name, t in (("dark", DARK), ("light", LIGHT)):
        for bg in ("canvas", "surface", "elevated"):
            out += [
                (name, t["text"], t[bg], 4.5, f"text on {bg}"),
                (name, t["text-2"], t[bg], 4.5, f"text-2 on {bg}"),
                (name, t["text-3"], t[bg], 4.5, f"text-3 on {bg}"),
                (name, t["accent"], t[bg], 4.5, f"accent text on {bg}"),
                (name, t["go"], t[bg], 4.5, f"go text on {bg}"),
                (name, t["caution"], t[bg], 4.5, f"caution text on {bg}"),
                (name, t["stop"], t[bg], 4.5, f"stop text on {bg}"),
                (name, t["focus"], t[bg], 3.0, f"focus ring on {bg}"),
                (name, t["border-strong"], t[bg], 3.0, f"control border on {bg}"),
            ]
    return out


def main(argv: list[str]) -> int:
    if len(argv) == 3:
        print(f"{ratio(argv[1], argv[2]):.2f}:1")
        return 0
    failed = 0
    for theme, fg, bg, need, desc in token_pairs():
        r = ratio(fg, bg)
        ok = r >= need
        failed += not ok
        print(f"{'PASS' if ok else 'FAIL'} [{theme}] {desc:28s} {fg} on {bg} = {r:5.2f} (need {need})")
    print(f"\n{failed} failing pair(s)")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
