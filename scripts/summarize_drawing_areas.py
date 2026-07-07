#!/usr/bin/env python3
"""Summarize drawing-based polygon areas from extracted plat JSON."""

from __future__ import annotations

import json
import math
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "web" / "data"


def load(name: str):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def sum_field(items, field="squareFeet"):
    return sum(item.get(field, 0) or 0 for item in items)


def ac(sqft: float) -> float:
    return sqft / 43560


def fill_polygons_mask(mask: np.ndarray, polygons: list[list[list[float]]]) -> None:
    for polygon in polygons:
        if len(polygon) < 3:
            continue
        pts = np.array(polygon, dtype=np.int32)
        cv2.fillPoly(mask, [pts], 255)


def mask_area_sqft(mask: np.ndarray, feet_per_pixel: float) -> float:
    px = int(np.count_nonzero(mask))
    return px * feet_per_pixel * feet_per_pixel


def main() -> None:
    lots = load("sheet1-lots.json")
    commercial = load("sheet1-commercial.json")
    site_areas = load("sheet1-site-areas.json")

    res_lots = [lot for lot in lots if lot.get("lotNumber")]

    ratios = [
        math.sqrt(lot["squareFeet"] / lot["areaPx"])
        for lot in res_lots
        if lot.get("squareFeet") and lot.get("areaPx")
    ]
    ratios.sort()
    fpp = ratios[len(ratios) // 2]

    by_type: dict[str, int] = {}
    by_type_count: dict[str, int] = {}
    for area in site_areas:
        area_type = area.get("type", "?")
        by_type[area_type] = by_type.get(area_type, 0) + (area.get("squareFeet") or 0)
        by_type_count[area_type] = by_type_count.get(area_type, 0) + 1

    res_sqft = sum_field(res_lots)
    comm_sqft = sum_field(commercial)
    site_sqft = sum(by_type.values())
    road_sqft = by_type.get("road", 0)
    non_road_site_sqft = site_sqft - road_sqft

    # Pixel union on a shared canvas (non-overlapping actual coverage)
    all_xs = []
    all_ys = []
    for entry in [*lots, *commercial, *site_areas]:
        for x, y in entry.get("polygon") or []:
            all_xs.append(x)
            all_ys.append(y)
    pad = 20
    width = int(max(all_xs) + pad)
    height = int(max(all_ys) + pad)

    lot_mask = np.zeros((height, width), np.uint8)
    comm_mask = np.zeros((height, width), np.uint8)
    road_mask = np.zeros((height, width), np.uint8)
    other_mask = np.zeros((height, width), np.uint8)

    fill_polygons_mask(lot_mask, [lot["polygon"] for lot in res_lots if lot.get("polygon")])
    fill_polygons_mask(comm_mask, [unit["polygon"] for unit in commercial if unit.get("polygon")])

    for area in site_areas:
        polygon = area.get("polygon")
        if not polygon:
            continue
        target = road_mask if area.get("type") == "road" else other_mask
        fill_polygons_mask(target, [polygon])

    combined_mask = cv2.bitwise_or(lot_mask, comm_mask)
    combined_mask = cv2.bitwise_or(combined_mask, road_mask)
    combined_mask = cv2.bitwise_or(combined_mask, other_mask)

    lot_union = mask_area_sqft(lot_mask, fpp)
    comm_union = mask_area_sqft(comm_mask, fpp)
    road_union = mask_area_sqft(road_mask, fpp)
    other_union = mask_area_sqft(other_mask, fpp)
    combined_union = mask_area_sqft(combined_mask, fpp)

    # Bounding box of all lot/commercial polygons (plat footprint proxy)
    xs = []
    ys = []
    for entry in [*lots, *commercial]:
        for x, y in entry.get("polygon") or []:
            xs.append(x)
            ys.append(y)
    bbox_sqft = (max(xs) - min(xs)) * (max(ys) - min(ys)) * fpp * fpp

    print("Drawing-based area summary (sheet1)")
    print("=" * 60)
    print(f"Scale: {fpp:.5f} ft/px (from lot annotation calibration)")
    print()
    print("NAIVE SUMS (each polygon area added — overlaps double-count)")
    print(f"  Residential lots ({len(res_lots)}): {res_sqft:,.0f} sqft = {ac(res_sqft):.2f} ac")
    print(f"  Commercial ({len(commercial)}):     {comm_sqft:,.0f} sqft = {ac(comm_sqft):.2f} ac")
    for area_type in sorted(by_type, key=lambda key: -by_type[key]):
        sqft = by_type[area_type]
        count = by_type_count[area_type]
        print(f"  Site {area_type} ({count} polys): {sqft:,.0f} sqft = {ac(sqft):.2f} ac")
    naive_all = res_sqft + comm_sqft + site_sqft
    print(f"  TOTAL (lots + commercial + all site areas): {naive_all:,.0f} sqft = {ac(naive_all):.2f} ac")
    print()
    print("UNION AREAS (pixel masks — no double-count within each layer)")
    print(f"  Residential lots:  {lot_union:,.0f} sqft = {ac(lot_union):.2f} ac")
    print(f"  Commercial:        {comm_union:,.0f} sqft = {ac(comm_union):.2f} ac")
    print(f"  Roads:             {road_union:,.0f} sqft = {ac(road_union):.2f} ac")
    print(f"  Other designated:  {other_union:,.0f} sqft = {ac(other_union):.2f} ac")
    print(f"  COMBINED UNION:    {combined_union:,.0f} sqft = {ac(combined_union):.2f} ac")
    print()
    print("COMPARISONS")
    print(f"  Known total site: 52.00 ac = {52 * 43560:,.0f} sqft")
    print(f"  Lot bbox (lots+comm only): {bbox_sqft:,.0f} sqft = {ac(bbox_sqft):.2f} ac")
    print(f"  Naive sum minus road polygons: {res_sqft + comm_sqft + non_road_site_sqft:,.0f} sqft = {ac(res_sqft + comm_sqft + non_road_site_sqft):.2f} ac")
    print(f"  Union lots + roads: {lot_union + road_union:,.0f} sqft = {ac(lot_union + road_union):.2f} ac")
    print(f"  Union all layers: {combined_union:,.0f} sqft = {ac(combined_union):.2f} ac")
    print()
    print("Road polygon overlap check")
    road_polys = [a for a in site_areas if a.get("type") == "road"]
    print(f"  Road polygon count: {len(road_polys)}")
    print(f"  Naive road sum: {road_sqft:,.0f} sqft = {ac(road_sqft):.2f} ac")
    print(f"  Union road mask: {road_union:,.0f} sqft = {ac(road_union):.2f} ac")
    print(f"  Overcount factor (naive/union): {road_sqft / road_union:.2f}x" if road_union else "  n/a")


if __name__ == "__main__":
    main()
