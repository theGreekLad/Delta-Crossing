#!/usr/bin/env python3
"""Measure CENTERLINE layer path lengths from plat PDF."""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import extract_plat as ep  # noqa: E402


def path_length_pdf(points: list[tuple[float, float]]) -> float:
    total = 0.0
    for i in range(1, len(points)):
        dx = points[i][0] - points[i - 1][0]
        dy = points[i][1] - points[i - 1][1]
        total += math.hypot(dx, dy)
    return total


def drawing_polylines(drawing: dict, page: fitz.Page) -> list[list[tuple[float, float]]]:
    polylines: list[list[tuple[float, float]]] = []
    current: list[tuple[float, float]] = []
    for item in drawing.get("items") or []:
        op = item[0]
        if op == "l":
            p1 = fitz.Point(item[1]) * page.rotation_matrix
            p2 = fitz.Point(item[2]) * page.rotation_matrix
            if not current:
                current = [(p1.x, p1.y)]
            current.append((p2.x, p2.y))
        elif op == "m":
            if len(current) >= 2:
                polylines.append(current)
            p = fitz.Point(item[1]) * page.rotation_matrix
            current = [(p.x, p.y)]
        elif op == "c":
            # cubic bezier - approximate with chord endpoints
            p3 = fitz.Point(item[3]) * page.rotation_matrix
            if not current:
                current = [(p3.x, p3.y)]
            else:
                current.append((p3.x, p3.y))
        else:
            if len(current) >= 2:
                polylines.append(current)
            current = []
    if len(current) >= 2:
        polylines.append(current)
    return polylines


def main() -> None:
    pdf = ROOT / "2023.7.12 Delta Crossings Prelim.pdf"
    page = fitz.open(pdf)[0]
    lots = json.loads((ROOT / "web/data/sheet1-lots.json").read_text(encoding="utf-8"))
    res_lots = [lot for lot in lots if lot.get("lotNumber")]
    ratios = sorted(
        math.sqrt(lot["squareFeet"] / lot["areaPx"])
        for lot in res_lots
        if lot.get("squareFeet") and lot.get("areaPx")
    )
    fpp = ratios[len(ratios) // 2]

    centerline_lengths_pdf = []
    all_lengths_pdf = []
    for drawing in page.get_drawings():
        layer = drawing.get("layer") or "(none)"
        rect = drawing.get("rect")
        if not rect or rect.x0 > ep.MAP_X_MAX:
            continue
        for polyline in drawing_polylines(drawing, page):
            length_pdf = path_length_pdf(polyline)
            if length_pdf < 5:
                continue
            all_lengths_pdf.append((layer, length_pdf))
            if layer == "CENTERLINE":
                centerline_lengths_pdf.append(length_pdf)

    total_cl_pdf = sum(centerline_lengths_pdf)
    total_cl_ft = total_cl_pdf * fpp  # wrong - fpp is ft per pixel in image space, not pdf units

    # Calibrate pdf units to feet using a known dimension
    # PDF user units appear to be points (1/72 inch) or drawing units
    # Use annotation: N00°22'27"E 1255.69' - find matching drawing segment or use sqft calibration
    # Better: compare pdf distance between two points vs image pixel distance
    # pdf_to_image_pixel scales by RENDER_SCALE

    # feet per PDF unit: measure known segment from annotation
    # 1255.69' annotation at approx - use image coords
    # fpp is feet per IMAGE pixel; pdf to image = * RENDER_SCALE
    feet_per_pdf = fpp * ep.RENDER_SCALE

    total_cl_ft = total_cl_pdf * feet_per_pdf
    row_width = 60.0
    area_sqft = total_cl_ft * row_width

    print(f"feet per PDF unit (via image scale): {feet_per_pdf:.4f}")
    print(f"CENTERLINE polylines: {len(centerline_lengths_pdf)}")
    print(f"Total centerline length: {total_cl_ft:,.1f} ft ({total_cl_ft/5280:.2f} mi)")
    print(f"ROW width: {row_width} ft")
    print(f"Road area: {area_sqft:,.0f} sqft = {area_sqft/43560:.2f} ac")
    print()
    print("Longest CENTERLINE segments (ft):")
    sorted_cl = sorted(centerline_lengths_pdf, reverse=True)
    for length in sorted_cl[:15]:
        print(f"  {length * feet_per_pdf:,.1f} ft")

    # Also try EASEMENTS / road-related
    for layer in ["CENTERLINE", "EASEMENTS", "CANDG", "Trail Pavement", "Pathway"]:
        layer_total = sum(length for name, length in all_lengths_pdf if name == layer)
        if layer_total:
            print(f"{layer}: {layer_total * feet_per_pdf:,.1f} ft total path")


if __name__ == "__main__":
    main()
