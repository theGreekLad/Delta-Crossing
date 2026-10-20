#!/usr/bin/env python3
"""Prototype ribbon-max centerline extraction."""

from __future__ import annotations

import json
import math
import re
import sys
from collections import defaultdict
from pathlib import Path

import cv2
import fitz
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import extract_plat as ep  # noqa: E402

LOT_FRONTAGE = {70.0, 73.9, 73.91, 75.71, 76.12, 105.5, 108.0}
ROW_HALF = re.compile(r"^30\.?0*'|30'$")
STANDALONE = re.compile(r"^([\d.]+)'$")
BEARING = re.compile(r"^[NS].*\s([\d.]+)'$", re.I)


def parse_length(content: str) -> float | None:
    m = STANDALONE.fullmatch(content.strip())
    if m:
        return float(m.group(1))
    m = BEARING.match(content.strip())
    if m:
        return float(m.group(1))
    return None


def main() -> None:
    page = fitz.open(ROOT / "2023.7.12 Delta Crossings Prelim.pdf")[0]
    lots = json.loads((ROOT / "web/data/sheet1-lots.json").read_text())
    commercial = json.loads((ROOT / "web/data/sheet1-commercial.json").read_text())

    w, h = int(page.rect.width * ep.RENDER_SCALE), int(page.rect.height * ep.RENDER_SCALE)
    free = ep.build_linework_mask(page, w, h)
    free = cv2.bitwise_and(free, ep.build_plat_bbox_mask(lots, commercial, w, h))
    claimed = np.zeros((h, w), np.uint8)
    ep.fill_polygons_mask(claimed, [l["polygon"] for l in lots if l.get("polygon")])
    ep.fill_polygons_mask(claimed, [u["polygon"] for u in commercial if u.get("polygon")])
    free[claimed > 0] = 0
    road = free > 128

    horiz: dict[int, float] = defaultdict(float)
    vert: dict[int, float] = defaultdict(float)
    count = 0

    for annot in page.annots() or []:
        content = (annot.info.get("content") or "").strip()
        if not content or annot.rect.x0 > ep.MAP_X_MAX:
            continue
        if ROW_HALF.fullmatch(content) or ep.SQUARE_FOOTAGE_PATTERN.fullmatch(content):
            continue
        if re.fullmatch(r"\d+", content):
            continue

        length = parse_length(content)
        if length is None or length in LOT_FRONTAGE or length < 100 or length > 650:
            continue

        rect = annot.rect
        ix = int((rect.x0 + rect.x1) / 2 * ep.RENDER_SCALE)
        iy = int((rect.y0 + rect.y1) / 2 * ep.RENDER_SCALE)
        if not (0 <= ix < w and 0 <= iy < h and road[iy, ix]):
            continue

        count += 1
        rw = rect.x1 - rect.x0
        rh = rect.y1 - rect.y0
        if rw >= rh:
            key = round(iy / 80)
            horiz[key] = max(horiz[key], length)
        else:
            key = round(ix / 80)
            vert[key] = max(vert[key], length)

    h_sum = sum(horiz.values())
    v_sum = sum(vert.values())
    total = h_sum + v_sum
    print("annotations used", count)
    print("horizontal ribbons", len(horiz), "sum", h_sum)
    print("vertical ribbons", len(vert), "sum", v_sum)
    print("total centerline lf", total)
    print("road area ac", total * 60 / 43560)
    print("top horiz", sorted(horiz.items(), key=lambda x: -x[1])[:10])
    print("top vert", sorted(vert.items(), key=lambda x: -x[1])[:10])


if __name__ == "__main__":
    main()
