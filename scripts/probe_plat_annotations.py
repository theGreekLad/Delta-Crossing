#!/usr/bin/env python3
"""Probe plat PDF for lot sqft vs road dimension annotations."""

from __future__ import annotations

import math
import re
import sys
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import extract_plat as ep  # noqa: E402


def main() -> None:
    pdf = ROOT / "2023.7.12 Delta Crossings Prelim.pdf"
    doc = fitz.open(pdf)
    page = doc[0]

    annots: list[tuple[str, float, float]] = []
    for annot in page.annots() or []:
        content = (annot.info.get("content") or "").strip()
        if not content:
            continue
        rect = annot.rect
        if rect.x0 > ep.MAP_X_MAX:
            continue
        annots.append((content, rect.x0, rect.y0))

    print(f"PDF: {pdf.name}")
    print(f"Total map annotations: {len(annots)}")
    print()

    patterns: list[tuple[str, re.Pattern[str]]] = [
        ("sqft lot labels", re.compile(r"^[\d,]+\s*(?:sq\.?\s*ft\.?|SF)?$", re.I)),
        ("feet dimensions (N')", re.compile(r"\d+'")),
        ("length x width", re.compile(r"\d+'\s*[xX×]\s*\d+'")),
        ("road/street names", re.compile(r"ST\.|STREET|ROAD|DR\.|DRIVE|AVE|HWY|WAY|LOOP|BLVD", re.I)),
        ("centerline / ROW", re.compile(r"centerline|ROW|R\.O\.W|r/w", re.I)),
        ("radius curves", re.compile(r"R\s*=\s*\d+", re.I)),
        ("lot numbers only", re.compile(r"^\d+$")),
    ]

    sqft_pat = patterns[0][1]
    for name, pattern in patterns:
        matches = [item for item in annots if pattern.search(item[0])]
        print(f"{name}: {len(matches)}")
        for content, x, y in matches[:10]:
            print(f"  {content!r} @ ({x:.1f}, {y:.1f})")
        if len(matches) > 10:
            print(f"  ... +{len(matches) - 10} more")
        print()

    # Feet-only annotations (likely road segments)
    feet_only = [
        item
        for item in annots
        if not sqft_pat.fullmatch(item[0]) and re.search(r"\d+'", item[0])
    ]
    print(f"Annotations with feet marks (non-sqft): {len(feet_only)}")
    for content, x, y in feet_only[:30]:
        print(f"  {content!r} @ ({x:.1f}, {y:.1f})")
    if len(feet_only) > 30:
        print(f"  ... +{len(feet_only) - 30} more")
    print()

    # Also scan page text (not just annots) for road dimension tables
    text = page.get_text("text")
    road_lines = [
        line.strip()
        for line in text.splitlines()
        if line.strip() and re.search(r"\d+'|\bROW\b|centerline|ST\.|STREET|ROAD", line, re.I)
    ]
    print(f"Page text lines with road/dimension keywords: {len(road_lines)}")
    for line in road_lines[:40]:
        print(f"  {line}")
    if len(road_lines) > 40:
        print(f"  ... +{len(road_lines) - 40} more")
    print()

    # Check drawings text for 30' / 60' / 50' ROW
    for keyword in ["30'", "60'", "50'", "24'", "ROW", "CENTERLINE", "centerline"]:
        count = text.upper().count(keyword.upper()) if "'" not in keyword else text.count(keyword)
        print(f"Page text occurrences of {keyword!r}: {count}")

    roads = ep.extract_road_labels(page)
    print()
    print(f"extract_road_labels found: {len(roads)} names")
    for road in roads[:15]:
        print(f"  {road['name']!r} @ ({road['x']}, {road['y']})")
    if len(roads) > 15:
        print(f"  ... +{len(roads) - 15} more")

    sqft_annots = ep.extract_square_footage_annotations(page)
    print()
    print(f"Real sqft annotations (N S.F. pattern): {len(sqft_annots)}")
    for entry in sqft_annots[:10]:
        print(f"  {entry['squareFeet']:,} S.F. @ ({entry['x']:.1f}, {entry['y']:.1f})")
    if sqft_annots:
        values = [entry["squareFeet"] for entry in sqft_annots]
        print(f"  Range: {min(values):,} - {max(values):,}")

    width_annots: list[tuple[str, float, float]] = []
    for annot in page.annots() or []:
        content = (annot.info.get("content") or "").strip()
        if not content or annot.rect.x0 > ep.MAP_X_MAX:
            continue
        if re.fullmatch(r"30\.?0*'|60\.?0*'|30'|60'", content):
            width_annots.append((content, annot.rect.x0, annot.rect.y0))

    print()
    print(f"Exact 30'/60' width annotations: {len(width_annots)}")
    for content, x, y in width_annots[:20]:
        print(f"  {content!r} @ ({x:.1f}, {y:.1f})")

    # Repeated segment lengths along what may be ROW dimensions
    length_counts: dict[str, int] = {}
    for content, _, _ in annots:
        if re.fullmatch(r"\d+(?:\.\d+)?'", content):
            length_counts[content] = length_counts.get(content, 0) + 1
    common_lengths = sorted(length_counts.items(), key=lambda item: (-item[1], item[0]))
    print()
    print("Most common standalone length annotations:")
    for length, count in common_lengths[:15]:
        print(f"  {length}: {count}x")

    print()
    print("Annotations near '= CENTERLINE' (1381, 1857):")
    center_x, center_y = 1381.0, 1857.0
    nearby: list[tuple[float, str, float, float]] = []
    for annot in page.annots() or []:
        content = (annot.info.get("content") or "").strip()
        if not content or annot.rect.x0 > ep.MAP_X_MAX:
            continue
        rect = annot.rect
        x = (rect.x0 + rect.x1) / 2
        y = (rect.y0 + rect.y1) / 2
        distance = math.hypot(x - center_x, y - center_y)
        if distance < 250:
            nearby.append((distance, content, x, y))
    nearby.sort()
    for distance, content, x, y in nearby[:25]:
        print(f"  d={distance:.0f} {content!r} @ ({x:.1f}, {y:.1f})")


if __name__ == "__main__":
    main()
