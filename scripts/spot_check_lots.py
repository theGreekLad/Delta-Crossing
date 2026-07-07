"""Spot-check plat lot dimensions vs annotated square footage."""
from __future__ import annotations

import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOTS_PATH = ROOT / "web" / "data" / "sheet1-lots.json"


def shoelace_area(poly: list[list[float]]) -> float:
    ring = poly[:-1] if poly[0] == poly[-1] else poly
    area = 0.0
    for i, (x1, y1) in enumerate(ring):
        x2, y2 = ring[(i + 1) % len(ring)]
        area += x1 * y2 - x2 * y1
    return abs(area) / 2.0


def edge_lengths(poly: list[list[float]]) -> list[float]:
    ring = poly[:-1] if poly[0] == poly[-1] else poly
    lengths = []
    for i, (x1, y1) in enumerate(ring):
        x2, y2 = ring[(i + 1) % len(ring)]
        lengths.append(math.hypot(x2 - x1, y2 - y1))
    return sorted(lengths, reverse=True)


def compute_feet_per_pixel(lots: list[dict]) -> tuple[float, float]:
    ratios = [
        lot["squareFeet"] / lot["areaPx"]
        for lot in lots
        if lot.get("squareFeet") and lot.get("areaPx")
    ]
    ratios.sort()
    sqft_per_px = ratios[len(ratios) // 2]
    return math.sqrt(sqft_per_px), sqft_per_px


def analyze(lot: dict, fpp: float, sqft_per_px: float) -> dict:
    poly_px = lot["polygon"]
    ring = poly_px[:-1] if poly_px[0] == poly_px[-1] else poly_px
    poly_ft = [[x * fpp, y * fpp] for x, y in ring]

    area_from_px = lot["areaPx"] * sqft_per_px
    area_from_poly = shoelace_area(poly_ft)
    annotated = lot.get("squareFeet")

    xs = [p[0] for p in poly_ft]
    ys = [p[1] for p in poly_ft]
    bbox_w = max(xs) - min(xs)
    bbox_d = max(ys) - min(ys)

    return {
        "lotNumber": lot["lotNumber"],
        "lotType": lot.get("lotType"),
        "phase": lot.get("phase"),
        "annotatedSqFt": annotated,
        "areaPx": lot["areaPx"],
        "computedFromAreaPx": round(area_from_px),
        "computedFromPolygon": round(area_from_poly),
        "errorAreaPxPct": round(100 * (area_from_px - annotated) / annotated, 2) if annotated else None,
        "errorPolygonPct": round(100 * (area_from_poly - annotated) / annotated, 2) if annotated else None,
        "bboxFeet": (round(bbox_w, 1), round(bbox_d, 1)),
        "bboxRectSqFt": round(bbox_w * bbox_d),
        "topEdgesFeet": [round(e, 1) for e in edge_lengths(poly_ft)[:4]],
        "vertexCount": len(ring),
    }


def main() -> None:
    lots = json.loads(LOTS_PATH.read_text(encoding="utf-8"))
    fpp, sqft_per_px = compute_feet_per_pixel(lots)

    print(f"Global scale: {fpp:.6f} ft/px  ({sqft_per_px:.6f} sq ft/px)")
    annotated_count = sum(1 for lot in lots if lot.get("squareFeet"))
    print(f"Calibrated from {annotated_count} lots with annotated sq ft\n")

    for lot_num in (1, 50, 121):
        lot = next(item for item in lots if item["lotNumber"] == lot_num)
        result = analyze(lot, fpp, sqft_per_px)
        print(f"=== Lot {result['lotNumber']} ({result['lotType']}, phase {result['phase']}) ===")
        print(f"  Annotated sq ft (plat label): {result['annotatedSqFt']:,}")
        print(f"  areaPx (flood-fill):          {result['areaPx']:,} px")
        print(f"  Computed from areaPx:         {result['computedFromAreaPx']:,} sq ft")
        print(f"  Computed from polygon:        {result['computedFromPolygon']:,} sq ft")
        if result["errorAreaPxPct"] is not None:
            print(f"  Error vs label (areaPx):      {result['errorAreaPxPct']:+.2f}%")
            print(f"  Error vs label (polygon):     {result['errorPolygonPct']:+.2f}%")
        w, d = result["bboxFeet"]
        print(f"  Bbox (axis-aligned):          {w} x {d} ft  (rect area {result['bboxRectSqFt']:,} sq ft)")
        edges = ", ".join(str(e) for e in result["topEdgesFeet"])
        print(f"  Longest edges:                {edges} ft")
        print(f"  Polygon vertices:             {result['vertexCount']}")
        print()


if __name__ == "__main__":
    main()
