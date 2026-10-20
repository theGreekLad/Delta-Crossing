#!/usr/bin/env python3
"""Cluster 30' ROW markers and associate centerline length dimensions."""

from __future__ import annotations

import json
import math
import re
import sys
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import extract_plat as ep  # noqa: E402

ROW_HALF = re.compile(r"^30\.?0*'|30'$")
BEARING = re.compile(r"^([NS].*?)\s+([\d.]+)'$", re.I)
STANDALONE = re.compile(r"^([\d.]+)'$")
LOT_DIMS = {70.0, 108.0, 105.5, 73.9, 73.91, 75.71, 76.12, 112.1, 112.15, 112.2, 112.24}


def annot_points(page: fitz.Page) -> list[tuple[str, float, float, fitz.Rect]]:
    items = []
    for annot in page.annots() or []:
        content = (annot.info.get("content") or "").strip()
        if not content or annot.rect.x0 > ep.MAP_X_MAX:
            continue
        rect = annot.rect
        x = (rect.x0 + rect.x1) / 2
        y = (rect.y0 + rect.y1) / 2
        items.append((content, x, y, rect))
    return items


def parse_road_length(content: str) -> float | None:
    match = STANDALONE.fullmatch(content)
    if match:
        value = float(match.group(1))
        if value in LOT_DIMS or value < 90 or value > 900:
            return None
        return value
    match = BEARING.match(content)
    if match:
        value = float(match.group(2))
        if value < 90 or value > 900:
            return None
        return value
    return None


def dist(a: tuple[float, float], b: tuple[float, float]) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def main() -> None:
    page = fitz.open(ROOT / "2023.7.12 Delta Crossings Prelim.pdf")[0]
    items = annot_points(page)

    thirty = [(x, y) for content, x, y, _ in items if ROW_HALF.fullmatch(content)]
    lengths = [(parse_road_length(content), content, x, y) for content, x, y, _ in items]
    lengths = [(value, content, x, y) for value, content, x, y in lengths if value]

    # A length is a centerline call if it's within ~45 pdf units of a 30' marker
    # and roughly parallel to the street (between two 30' markers on same row/col)
    associated: list[tuple[float, str, float, float, int]] = []
    for value, content, x, y in lengths:
        nearby_thirty = sum(1 for tx, ty in thirty if dist((x, y), (tx, ty)) <= 55)
        if nearby_thirty >= 1:
            associated.append((value, content, x, y, nearby_thirty))

    # Deduplicate: same length at nearby positions (dim repeated)
    seen: set[tuple[float, int, int]] = set()
    unique_segments: list[dict] = []
    for value, content, x, y, count in sorted(associated, key=lambda item: -item[0]):
        key = (round(value, 1), round(x / 80), round(y / 80))
        if key in seen:
            continue
        seen.add(key)
        unique_segments.append(
            {
                "lengthFt": round(value, 2),
                "label": content,
                "x": round(x, 2),
                "y": round(y, 2),
                "nearby30Count": count,
            }
        )

    centerline_lf = sum(seg["lengthFt"] for seg in unique_segments)
    row_width = 60.0
    road_sqft = centerline_lf * row_width

    print(f"30' markers: {len(thirty)}")
    print(f"Candidate centerline length annotations: {len(associated)}")
    print(f"Unique segments: {len(unique_segments)}")
    print(f"Centerline LF: {centerline_lf:,.1f}")
    print(f"Road area (@ 60' ROW): {road_sqft:,.0f} sqft = {road_sqft/43560:.2f} ac")
    print()
    for seg in sorted(unique_segments, key=lambda s: -s["lengthFt"])[:30]:
        print(f"  {seg['lengthFt']:7.1f} ft  {seg['label']!r}")


if __name__ == "__main__":
    main()
