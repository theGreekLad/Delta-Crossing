#!/usr/bin/env python3
"""Check whether lot polygons overlap road 30' width annotations."""

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


def fill_polygons_mask(mask: np.ndarray, polygons: list[list[list[float]]]) -> None:
    for polygon in polygons:
        if len(polygon) < 3:
            continue
        cv2.fillPoly(mask, [np.array(polygon, dtype=np.int32)], 255)


def main() -> None:
    pdf = ROOT / "2023.7.12 Delta Crossings Prelim.pdf"
    page = fitz.open(pdf)[0]
    lots = json.loads((ROOT / "web/data/sheet1-lots.json").read_text(encoding="utf-8"))
    res_lots = [lot for lot in lots if lot.get("lotNumber")]

    annotated = ep.match_square_footage_to_lots(
        ep.extract_lot_labels(page),
        ep.extract_square_footage_annotations(page),
    )

    ratios = sorted(
        math.sqrt(lot["squareFeet"] / lot["areaPx"])
        for lot in res_lots
        if lot.get("squareFeet") and lot.get("areaPx")
    )
    fpp = ratios[len(ratios) // 2]

    width_points: list[tuple[float, float]] = []
    for annot in page.annots() or []:
        content = (annot.info.get("content") or "").strip()
        if not content or annot.rect.x0 > ep.MAP_X_MAX:
            continue
        if re.fullmatch(r"30\.?0*'|30'", content):
            rect = annot.rect
            width_points.append(((rect.x0 + rect.x1) / 2, (rect.y0 + rect.y1) / 2))

    all_xs = []
    all_ys = []
    for lot in res_lots:
        for x, y in lot.get("polygon") or []:
            all_xs.append(x)
            all_ys.append(y)
    pad = 20
    width = int(max(all_xs) + pad)
    height = int(max(all_ys) + pad)

    lot_mask = np.zeros((height, width), np.uint8)
    fill_polygons_mask(lot_mask, [lot["polygon"] for lot in res_lots if lot.get("polygon")])

    inside = 0
    outside = 0
    for x, y in width_points:
        ix, iy = int(x), int(y)
        if 0 <= ix < width and 0 <= iy < height and lot_mask[iy, ix] > 0:
            inside += 1
        else:
            outside += 1

    ann_sqft = sum(
        lot["squareFeet"] for lot in res_lots if lot.get("lotNumber") in annotated
    )
    computed_sqft = sum(
        lot["squareFeet"]
        for lot in res_lots
        if lot.get("lotNumber") not in annotated and lot.get("squareFeet")
    )

    print("Lot sqft sources")
    print(f"  Direct PDF S.F. labels: {len(annotated)} lots = {ann_sqft:,} sqft ({ann_sqft/43560:.2f} ac)")
    print(f"  Polygon-derived sqft:   {215-len(annotated)} lots = {computed_sqft:,} sqft ({computed_sqft/43560:.2f} ac)")
    print(f"  Total: {ann_sqft+computed_sqft:,} sqft ({(ann_sqft+computed_sqft)/43560:.2f} ac)")
    print()
    print("30' ROW half-width annotations on PDF")
    print(f"  Count: {len(width_points)}")
    print(f"  Falling inside lot color polygons: {inside}")
    print(f"  Falling outside lot color polygons: {outside}")
    print()
    print("Interpretation:")
    if inside > outside:
        print("  Many 30' labels sit inside lot polygons — color fills may extend into ROW.")
    else:
        print("  Most 30' labels sit outside lot polygons — roads are separate from lot fills.")


if __name__ == "__main__":
    main()
