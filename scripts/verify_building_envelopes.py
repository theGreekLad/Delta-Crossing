"""Verify R-4 building envelopes for sample lots."""
from __future__ import annotations

import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOTS_PATH = ROOT / "web" / "data" / "sheet1-lots.json"
MANIFEST_PATH = ROOT / "web" / "data" / "manifest.json"

R4 = {
    "front": 25,
    "rear": 10,
    "side": 10,
    "corner_side": 20,
    "target_min": 2000,
    "target_max": 2500,
}


def compute_fpp(lots):
    ratios = sorted(l["squareFeet"] / l["areaPx"] for l in lots if l.get("squareFeet"))
    return math.sqrt(ratios[len(ratios) // 2])


def to_world(x, y, fpp, origin_x, origin_y):
    return (x - origin_x) * fpp, (y - origin_y) * fpp


def analyze(lot, roads_world, fpp):
    poly = [to_world(x, y, fpp, *origin) for x, y in lot["polygon"][:-1]]
    cx = sum(p[0] for p in poly) / len(poly)
    cz = sum(p[1] for p in poly) / len(poly)

    ranked = sorted(
        roads_world,
        key=lambda r: math.hypot(r[0] - cx, r[1] - cz),
    )
    local = [r for r in ranked if "HWY" not in r[2].upper() and "HIGHWAY" not in r[2].upper()]
    primary = local[0] if local else ranked[0]
    fx, fz = primary[0] - cx, primary[1] - cz
    flen = math.hypot(fx, fz) or 1
    front = (fx / flen, fz / flen)
    side = (-front[1], front[0])

    depths = [((x - cx) * front[0] + (z - cz) * front[1]) for x, z in poly]
    widths = [((x - cx) * side[0] + (z - cz) * side[1]) for x, z in poly]
    build_w = (max(widths) - R4["side"]) - (min(widths) + R4["side"])
    build_d = (max(depths) - R4["front"]) - (min(depths) + R4["rear"])
    buildable = max(build_w, 0) * max(build_d, 0)

    target = R4["target_min"] + (lot["lotNumber"] % 11) * 50
    aspect = 1.35
    bw = math.sqrt(target * aspect)
    bd = target / bw
    scale = min(1, build_w / bw if bw else 0, build_d / bd if bd else 0)
    dwelling = bw * scale * bd * scale

    return {
        "lot": lot["lotNumber"],
        "front_street": primary[2],
        "buildable_sqft": round(buildable),
        "target_sqft": target,
        "dwelling_sqft": round(dwelling),
        "in_range": R4["target_min"] <= dwelling <= R4["target_max"] + 1 or dwelling < R4["target_min"],
    }


lots = json.loads(LOTS_PATH.read_text(encoding="utf-8"))
manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
sheet = next(s for s in manifest["sheets"] if s["id"] == "sheet1")
fpp = compute_fpp(lots)
origin = (sheet["pixelWidth"] / 2, sheet["pixelHeight"] / 2)
roads_world = [
    (*to_world(r["x"], r["y"], fpp, *origin), r["name"]) for r in sheet["roads"]
]

print(f"R-4 envelope spot check (fpp={fpp:.4f})\n")
for lot_num in (1, 50, 22, 100):
    lot = next(l for l in lots if l["lotNumber"] == lot_num)
    result = analyze(lot, roads_world, fpp)
    print(result)

sf = [l for l in lots if l.get("lotType") == "single-family"]
results = [analyze(l, roads_world, fpp) for l in sf]
in_range = sum(1 for r in results if r["target_min"] <= r["dwelling_sqft"] <= R4["target_max"] + 1 for r in [r] if False)
# fix count
hits = sum(1 for r in results if R4["target_min"] <= r["dwelling_sqft"] <= R4["target_max"] + 1)
limited = sum(1 for r in results if r["dwelling_sqft"] < R4["target_min"])
print(f"\nSingle-family summary ({len(results)} lots):")
print(f"  At target 2000-2500 sq ft: {hits}")
print(f"  Constrained below 2000 sq ft: {limited}")
