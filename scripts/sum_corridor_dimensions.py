#!/usr/bin/env python3
"""Sum dimension annotations that fall inside road corridors on the plat."""

from __future__ import annotations

import json
import math
import re
import sys
from pathlib import Path

import cv2
import fitz
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import extract_plat as ep  # noqa: E402

BEARING_LENGTH = re.compile(r"^[NS].*\s([\d.]+)'$", re.I)
STANDALONE_LENGTH = re.compile(r"^([\d.]+)'$")
ROW_HALF_WIDTH = re.compile(r"^30\.?0*'|30'$")


def parse_length(content: str) -> float | None:
    content = content.strip()
    match = STANDALONE_LENGTH.fullmatch(content)
    if match:
        return float(match.group(1))
    match = BEARING_LENGTH.match(content)
    if match:
        return float(match.group(1))
    combined = re.match(r"^[NS].*\s([\d.]+)'$", content, re.I)
    if combined:
        return float(combined.group(1))
    return None


def build_road_corridor_mask(page: fitz.Page, lots: list[dict], commercial: list[dict]) -> tuple[np.ndarray, float]:
    page_width = int(page.rect.width * ep.RENDER_SCALE)
    page_height = int(page.rect.height * ep.RENDER_SCALE)
    free_space = ep.build_linework_mask(page, page_width, page_height)
    plat_mask = ep.build_plat_bbox_mask(lots, commercial, page_width, page_height)
    free_space = cv2.bitwise_and(free_space, plat_mask)

    claimed = np.zeros((page_height, page_width), np.uint8)
    ep.fill_polygons_mask(claimed, [lot["polygon"] for lot in lots if lot.get("polygon")])
    ep.fill_polygons_mask(claimed, [unit["polygon"] for unit in commercial if unit.get("polygon")])
    free_space[claimed > 0] = 0

    fpp = ep.compute_feet_per_pixel(lots)
    return free_space, fpp


def main() -> None:
    pdf = ROOT / "2023.7.12 Delta Crossings Prelim.pdf"
    page = fitz.open(pdf)[0]
    lots = json.loads((ROOT / "web/data/sheet1-lots.json").read_text(encoding="utf-8"))
    commercial = json.loads((ROOT / "web/data/sheet1-commercial.json").read_text(encoding="utf-8"))

    road_mask, fpp = build_road_corridor_mask(page, lots, commercial)
    road_px = int(np.count_nonzero(road_mask))
    corridor_area = road_px * fpp * fpp

    in_corridor: list[tuple[float, str, float, float]] = []
    outside: list[tuple[float, str]] = []

    for annot in page.annots() or []:
        content = (annot.info.get("content") or "").strip()
        if not content or annot.rect.x0 > ep.MAP_X_MAX:
            continue
        if ROW_HALF_WIDTH.fullmatch(content):
            continue
        if ep.SQUARE_FOOTAGE_PATTERN.fullmatch(content):
            continue
        if re.fullmatch(r"\d+", content):
            continue

        length = parse_length(content)
        if length is None or length < 25 or length > 2000:
            continue

        rect = annot.rect
        ix = int((rect.x0 + rect.x1) / 2 * ep.RENDER_SCALE)
        iy = int((rect.y0 + rect.y1) / 2 * ep.RENDER_SCALE)
        if 0 <= ix < road_mask.shape[1] and 0 <= iy < road_mask.shape[0] and road_mask[iy, ix] > 128:
            in_corridor.append((length, content, rect.x0, rect.y0))
        else:
            outside.append((length, content))

    # Deduplicate corridor lengths by rounded value + coarse grid (same dim repeated)
    seen: set[tuple[float, int, int]] = set()
    unique: list[float] = []
    for length, content, x, y in in_corridor:
        key = (round(length, 1), round(x / 100), round(y / 100))
        if key in seen:
            continue
        seen.add(key)
        unique.append(length)

    centerline_lf = sum(unique)
    row_width = 60.0
    area_from_dims = centerline_lf * row_width

    print(f"Road corridor mask area: {corridor_area:,.0f} sqft = {corridor_area/43560:.2f} ac")
    print(f"Dimension annotations in corridor: {len(in_corridor)} (unique {len(unique)})")
    print(f"Sum unique corridor dimensions: {centerline_lf:,.1f} ft")
    print(f"× {row_width}' ROW = {area_from_dims:,.0f} sqft = {area_from_dims/43560:.2f} ac")
    print()
    print("Outside corridor (sample counts by length):")
    from collections import Counter
    c = Counter(round(l, 1) for l, _ in outside)
    for val, count in c.most_common(15):
        print(f"  {val}' x {count}")

    print()
    print("In corridor unique lengths:")
    for length in sorted(unique, reverse=True)[:25]:
        print(f"  {length:.2f}'")


if __name__ == "__main__":
    main()
