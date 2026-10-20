#!/usr/bin/env python3
"""Explore PDF linework layers and dimension placement for road extraction."""

from __future__ import annotations

import re
import sys
from collections import Counter
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import extract_plat as ep  # noqa: E402


def main() -> None:
    pdf = ROOT / "2023.7.12 Delta Crossings Prelim.pdf"
    page = fitz.open(pdf)[0]

    layers: Counter[str] = Counter()
    roadish_layers: Counter[str] = Counter()
    for drawing in page.get_drawings():
        layer = drawing.get("layer") or "(none)"
        layers[layer] += 1
        if re.search(r"road|street|center|row|align|prop|easement|right", layer, re.I):
            roadish_layers[layer] += 1

    print("Drawing layers (top 30):")
    for layer, count in layers.most_common(30):
        print(f"  {count:5d}  {layer}")
    print()
    print("Road-ish layers:")
    for layer, count in roadish_layers.most_common():
        print(f"  {count:5d}  {layer}")

    # Bearing+distance pattern
    bear_pat = re.compile(
        r"^(?:[NS]\d+[°º]\d+'\d+\"[EW]|[NS]\d+[°º]\d+'\d+\s*[EW])\s*([\d.]+)'$",
        re.I,
    )
    bear_pat2 = re.compile(r"^[NS].*\s([\d.]+)'$", re.I)
    len_pat = re.compile(r"^([\d.]+)'$")

    lengths_in_road_corridor = []
    lengths_in_lot = []

    # Build simple lot bbox from labels - use free space heuristic
    # For now classify by whether annotation is near a 30' marker pair

    thirty_pts = []
    for annot in page.annots() or []:
        c = (annot.info.get("content") or "").strip()
        if not c or annot.rect.x0 > ep.MAP_X_MAX:
            continue
        if re.fullmatch(r"30\.?0*'|30'", c):
            r = annot.rect
            thirty_pts.append(((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2))

    def near_thirty(x: float, y: float, radius: float = 80.0) -> bool:
        return any((x - tx) ** 2 + (y - ty) ** 2 <= radius * radius for tx, ty in thirty_pts)

    bearing_lengths = []
    standalone_lengths = []
    for annot in page.annots() or []:
        c = (annot.info.get("content") or "").strip()
        if not c or annot.rect.x0 > ep.MAP_X_MAX:
            continue
        r = annot.rect
        x, y = (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2
        m = bear_pat2.match(c) or bear_pat.match(c)
        if m:
            try:
                length = float(m.group(1))
            except IndexError:
                parts = c.split()
                length = float(parts[-1].rstrip("'"))
            if 20 <= length <= 3000:
                bearing_lengths.append((length, c, x, y, near_thirty(x, y)))
            continue
        m2 = len_pat.match(c)
        if m2:
            length = float(m2.group(1))
            if 20 <= length <= 3000:
                standalone_lengths.append((length, c, x, y, near_thirty(x, y)))

    print()
    print(f"Bearing+distance lengths (20-3000'): {len(bearing_lengths)}")
    near_b = [item for item in bearing_lengths if item[4]]
    print(f"  Near 30' marker: {len(near_b)}, sum={sum(i[0] for i in near_b):,.1f} ft")
    print(f"  Not near 30': {len(bearing_lengths)-len(near_b)}, sum={sum(i[0] for i in bearing_lengths if not i[4]):,.1f} ft")

    print()
    print(f"Standalone lengths (20-3000'): {len(standalone_lengths)}")
    near_s = [item for item in standalone_lengths if item[4]]
    print(f"  Near 30' marker: {len(near_s)}, sum={sum(i[0] for i in near_s):,.1f} ft")
    print(f"  Not near 30': {len(standalone_lengths)-len(near_s)}, sum={sum(i[0] for i in standalone_lengths if not i[4]):,.1f} ft")

    # Unique bearing segments (dedupe by rounded length+position grid)
    seen = set()
    unique_near = []
    for length, c, x, y, is_near in bearing_lengths:
        if not is_near:
            continue
        key = (round(length, 2), round(x / 50), round(y / 50))
        if key in seen:
            continue
        seen.add(key)
        unique_near.append(length)
    print()
    print(f"Unique bearing lengths near 30': {len(unique_near)}, sum={sum(unique_near):,.1f} ft")
    print(f"  × 60' ROW = {sum(unique_near)*60:,.0f} sqft = {sum(unique_near)*60/43560:.2f} ac")


if __name__ == "__main__":
    main()
