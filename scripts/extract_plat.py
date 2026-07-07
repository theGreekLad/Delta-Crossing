#!/usr/bin/env python3
"""Extract deep-zoom tiles and lot boundary polygons from the plat PDF."""

from __future__ import annotations

import json
import math
import re
import sys
from pathlib import Path

import cv2
import fitz
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PDF_PATH = ROOT / "2023.7.12 Delta Crossings Prelim.pdf"
WEB_DIR = ROOT / "web"
TILE_DIR = WEB_DIR / "tiles"
DATA_DIR = WEB_DIR / "data"

RENDER_SCALE = 3
TILE_SIZE = 256
TILE_OVERLAP = 1
MAP_X_MAX = 2200
SKIP_LAYERS = {
    "TEXT",
    "TBLOCK",
    "DIM-1",
    "DIM-3",
    "DIM-4",
    "LOT NUMBER",
    "LS-Text",
    "PAPERSPACE",
    "CANDG",
}
MIN_LOT_NUMBER = 1
MAX_LOT_NUMBER = 215
LEGACY_LOT_MAX = 120
MIN_LOT_AREA = 500
MAX_LOT_AREA = 250000
COMMERCIAL_PHASE = 2
COMMERCIAL_LABEL = "COMMERCIAL UNITS"
COMMERCIAL_DIVIDER_A = (380.0, 1238.0)
COMMERCIAL_DIVIDER_B = (842.0, 1747.0)
MIN_COMMERCIAL_AREA = 10_000
MAX_COMMERCIAL_AREA = 500_000
PHASE_LEGEND_PAGE_INDEX = 1
PHASE_RGB = {
    1: (197, 220, 175),
    2: (239, 255, 192),
    3: (204, 188, 141),
    4: (255, 239, 192),
    5: (234, 227, 205),
    6: (238, 210, 183),
    7: (238, 238, 183),
}
PHASE_SAMPLE_OFFSETS = (
    (0, 12),
    (12, 0),
    (-12, 0),
    (0, -12),
    (15, 0),
    (0, 15),
    (-15, 0),
    (0, -15),
    (10, 10),
    (-10, 10),
)
SQUARE_FOOTAGE_PATTERN = re.compile(r"^([\d,]+)\s*S\.?\s*F\.?$", re.IGNORECASE)
SQUARE_FOOTAGE_MATCH_RADIUS = 80.0
LOT_TYPE_SINGLE_FAMILY = "single-family"
LOT_TYPE_TOWNHOME = "townhome"
SITE_AREA_LABEL_RULES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"^PICKELBALL$", re.I), "pickleball"),
    (re.compile(r"^POOL$", re.I), "pool"),
    (re.compile(r"PARK/TOT\s+LOT", re.I), "park"),
    (re.compile(r"MELVILLE\s+EAST\s+CANAL", re.I), "canal"),
    (re.compile(r"OPEN\s*SPACE\s*/\s*RETENTION", re.I), "open-space"),
    (re.compile(r"^OPESPACE$", re.I), "open-space"),
    (re.compile(r"FUTURE\s+DEVELOPMENT", re.I), "future-development"),
    (re.compile(r"FUTURE\s+DEV\.?", re.I), "future-development"),
]
MIN_SITE_AREA = 1500
MIN_ROAD_AREA = 2500
MAP_PIXEL_X_MAX = MAP_X_MAX * RENDER_SCALE
SITE_AREA_MATCH_RADIUS = {
    "pickleball": 220.0,
    "pool": 200.0,
    "park": 260.0,
    "future-development": 420.0,
    "open-space": 520.0,
    "canal": 650.0,
}
MAX_SITE_AREA = {
    "pickleball": 120_000,
    "pool": 120_000,
    "park": 250_000,
    "future-development": 900_000,
    "open-space": 900_000,
    "canal": 1_500_000,
    "road": 50_000_000,
}


def pdf_to_image_pixel(
    page: fitz.Page, x: float, y: float, scale: float = RENDER_SCALE
) -> tuple[float, float]:
    """Map PDF user-space coordinates to rendered tile pixel coordinates."""
    point = fitz.Point(x, y) * page.rotation_matrix
    return point.x * scale, point.y * scale


def extract_lot_labels(page: fitz.Page) -> dict[int, tuple[float, float]]:
    candidates: dict[int, list[tuple[float, float, fitz.Rect]]] = {}

    for annot in page.annots() or []:
        content = (annot.info.get("content") or "").strip()
        if not re.fullmatch(r"\d+", content):
            continue
        lot_number = int(content)
        if not MIN_LOT_NUMBER <= lot_number <= MAX_LOT_NUMBER:
            continue
        rect = annot.rect
        center = ((rect.x0 + rect.x1) / 2, (rect.y0 + rect.y1) / 2)
        candidates.setdefault(lot_number, []).append((center[0], center[1], rect))

    labels: dict[int, tuple[float, float]] = {}
    for lot_number, entries in candidates.items():
        map_entries = [
            entry
            for entry in entries
            if entry[2].x0 >= 300 and entry[2].y0 <= 2050 and entry[2].x0 <= MAP_X_MAX
        ]
        chosen = map_entries[0] if map_entries else entries[0]
        labels[lot_number] = (chosen[0], chosen[1])

    return labels


def extract_road_labels(page: fitz.Page) -> list[dict]:
    roads: list[dict] = []
    seen: set[str] = set()
    road_pattern = re.compile(
        r"(ST\.|STREET|HWY|HIGHWAY|ROAD|DR\.|DRIVE|AVE\.|AVENUE|BLVD|WAY|LOOP)",
        re.IGNORECASE,
    )
    for annot in page.annots() or []:
        content = (annot.info.get("content") or "").strip()
        if not content or content in seen or not road_pattern.search(content):
            continue
        rect = annot.rect
        if rect.x0 > MAP_X_MAX:
            continue
        seen.add(content)
        image_x, image_y = pdf_to_image_pixel(page, (rect.x0 + rect.x1) / 2, (rect.y0 + rect.y1) / 2)
        roads.append({"name": content, "x": round(image_x, 2), "y": round(image_y, 2)})
    return roads


def classify_site_area_label(content: str) -> str | None:
    for pattern, area_type in SITE_AREA_LABEL_RULES:
        if pattern.search(content):
            return area_type
    return None


def extract_site_area_seeds(page: fitz.Page) -> list[dict]:
    seeds: list[dict] = []
    seen: set[tuple[str, int, int]] = set()

    for annot in page.annots() or []:
        content = (annot.info.get("content") or "").strip()
        area_type = classify_site_area_label(content)
        if not area_type:
            continue
        rect = annot.rect
        if rect.x0 > MAP_X_MAX:
            continue
        image_x, image_y = pdf_to_image_pixel(page, (rect.x0 + rect.x1) / 2, (rect.y0 + rect.y1) / 2)
        key = (area_type, int(image_x // 8), int(image_y // 8))
        if key in seen:
            continue
        seen.add(key)
        seeds.append(
            {
                "type": area_type,
                "label": content,
                "x": round(image_x, 2),
                "y": round(image_y, 2),
            }
        )

    return seeds


def fill_polygons_mask(mask: np.ndarray, polygons: list[list[list[float]]], value: int = 255) -> None:
    for polygon in polygons:
        if len(polygon) < 4:
            continue
        points = np.array(
            [[int(round(point[0])), int(round(point[1]))] for point in polygon[:-1]],
            dtype=np.int32,
        )
        cv2.fillPoly(mask, [points], value)


def mask_to_site_area_record(
    area_type: str,
    label: str | None,
    region_mask: np.ndarray,
    area_id: str,
) -> dict | None:
    area = int(np.count_nonzero(region_mask))
    if area < MIN_SITE_AREA:
        return None

    contours, _ = cv2.findContours(
        region_mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )
    if not contours:
        return None

    contour = max(contours, key=cv2.contourArea)
    polygon = contour_to_polygon(contour)
    if len(polygon) < 4:
        return None

    xs = [point[0] for point in polygon]
    ys = [point[1] for point in polygon]
    if sum(xs) / len(xs) > MAP_PIXEL_X_MAX:
        return None

    return {
        "id": area_id,
        "type": area_type,
        "label": label,
        "centroid": [round(sum(xs) / len(xs), 2), round(sum(ys) / len(ys), 2)],
        "bounds": [round(min(xs), 2), round(min(ys), 2), round(max(xs), 2), round(max(ys), 2)],
        "polygon": polygon,
        "areaPx": area,
    }


def flood_fill_region(
    free_space: np.ndarray,
    seed: tuple[int, int],
    fill_value: int = 64,
) -> np.ndarray | None:
    height, width = free_space.shape
    if not (0 <= seed[0] < width and 0 <= seed[1] < height):
        return None
    if free_space[seed[1], seed[0]] <= 128:
        return None

    work = free_space.copy()
    flood_mask = np.zeros((height + 2, width + 2), np.uint8)
    cv2.floodFill(work, flood_mask, seed, fill_value, loDiff=0, upDiff=0)
    region = work == fill_value
    if not np.any(region):
        return None
    return region


def flood_fill_limited_region(
    free_space: np.ndarray,
    assigned: np.ndarray,
    seed_x: float,
    seed_y: float,
    max_radius: float,
) -> np.ndarray | None:
    point = find_seed_point(free_space, int(seed_x), int(seed_y))
    if point is None:
        return None

    work = free_space.copy()
    work[assigned > 0] = 0
    region = flood_fill_region(work, point)
    if region is None:
        return None

    ys, xs = np.where(region)
    radius_sq = max_radius * max_radius
    keep = (xs - seed_x) ** 2 + (ys - seed_y) ** 2 <= radius_sq
    region[ys[~keep], xs[~keep]] = False
    region[assigned > 0] = False
    if not np.any(region):
        return None
    return region


MIN_AREA_BY_TYPE = {
    "pickleball": 350,
    "pool": 350,
    "park": 800,
    "canal": 1500,
    "open-space": 1500,
    "future-development": 1500,
    "road": MIN_ROAD_AREA,
}


def contour_to_site_area(
    contour: np.ndarray,
    area_type: str,
    label: str | None,
    area_id: str,
) -> dict | None:
    area = cv2.contourArea(contour)
    min_area = MIN_AREA_BY_TYPE.get(area_type, MIN_SITE_AREA)
    if area < min_area:
        return None

    polygon = contour_to_polygon(contour)
    if len(polygon) < 4:
        return None

    xs = [point[0] for point in polygon]
    ys = [point[1] for point in polygon]
    centroid_x = sum(xs) / len(xs)
    centroid_y = sum(ys) / len(ys)
    if centroid_x > MAP_PIXEL_X_MAX:
        return None

    max_area = MAX_SITE_AREA.get(area_type, 50_000_000)
    if area > max_area:
        return None

    return {
        "id": area_id,
        "type": area_type,
        "label": label,
        "centroid": [round(centroid_x, 2), round(centroid_y, 2)],
        "bounds": [round(min(xs), 2), round(min(ys), 2), round(max(xs), 2), round(max(ys), 2)],
        "polygon": polygon,
        "areaPx": int(area),
    }


def compute_feet_per_pixel(lots: list[dict]) -> float:
    ratios = [
        math.sqrt(lot["squareFeet"] / lot["areaPx"])
        for lot in lots
        if lot.get("squareFeet") and lot.get("areaPx")
    ]
    if not ratios:
        return 0.22
    ratios.sort()
    return ratios[len(ratios) // 2]


def build_plat_bbox_mask(
    lots: list[dict],
    commercial: list[dict],
    page_width: int,
    page_height: int,
    *,
    padding: int = 120,
) -> np.ndarray:
    """Clip road extraction to the plat footprint (lots + commercial bounds)."""
    mask = np.zeros((page_height, page_width), np.uint8)
    xs: list[float] = []
    ys: list[float] = []
    for entry in [*lots, *commercial]:
        polygon = entry.get("polygon") or []
        for point in polygon:
            xs.append(point[0])
            ys.append(point[1])
    if not xs:
        mask[:, :] = 255
        return mask

    min_x = max(0, int(min(xs) - padding))
    max_x = min(page_width, int(max(xs) + padding))
    min_y = max(0, int(min(ys) - padding))
    max_y = min(page_height, int(max(ys) + padding))
    mask[min_y:max_y, min_x:max_x] = 255
    return mask


def extract_site_areas(page: fitz.Page, lots: list[dict], commercial: list[dict]) -> list[dict]:
    page_width = int(page.rect.width * RENDER_SCALE)
    page_height = int(page.rect.height * RENDER_SCALE)
    free_space = build_linework_mask(page, page_width, page_height)
    plat_mask = build_plat_bbox_mask(lots, commercial, page_width, page_height)
    free_space = cv2.bitwise_and(free_space, plat_mask)
    feet_per_pixel = compute_feet_per_pixel(lots)

    claimed = np.zeros((page_height, page_width), np.uint8)
    lot_polygons = [lot["polygon"] for lot in lots if lot.get("polygon")]
    commercial_polygons = [unit["polygon"] for unit in commercial if unit.get("polygon")]
    fill_polygons_mask(claimed, lot_polygons)
    fill_polygons_mask(claimed, commercial_polygons)
    free_space[claimed > 0] = 0

    assigned = np.zeros((page_height, page_width), np.uint8)
    seeds = extract_site_area_seeds(page)
    seed_priority = ["pickleball", "pool", "park", "open-space", "future-development", "canal"]
    ordered_seeds = sorted(
        seeds,
        key=lambda seed: (
            seed_priority.index(seed["type"]) if seed["type"] in seed_priority else len(seed_priority),
            seed["y"],
            seed["x"],
        ),
    )

    areas: list[dict] = []
    type_counters: dict[str, int] = {}

    for seed in ordered_seeds:
        radius = SITE_AREA_MATCH_RADIUS.get(seed["type"], 400.0)
        region = flood_fill_limited_region(free_space, assigned, seed["x"], seed["y"], radius)
        if region is None:
            continue

        type_counters[seed["type"]] = type_counters.get(seed["type"], 0) + 1
        region_mask = region.astype(np.uint8) * 255
        contours, _ = cv2.findContours(region_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            continue

        contour = max(contours, key=cv2.contourArea)
        record = contour_to_site_area(
            contour,
            seed["type"],
            seed["label"],
            f"site-{seed['type']}-{type_counters[seed['type']]}",
        )
        if record:
            areas.append(record)
            assigned[region] = 255

    road_mask = ((free_space > 128) & (assigned == 0)).astype(np.uint8) * 255
    contours, _ = cv2.findContours(road_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for contour in contours:
        area = cv2.contourArea(contour)
        if area < MIN_ROAD_AREA:
            continue

        type_counters["road"] = type_counters.get("road", 0) + 1
        record = contour_to_site_area(
            contour,
            "road",
            None,
            f"site-road-{type_counters['road']}",
        )
        if record:
            area_sqft = int(area * feet_per_pixel * feet_per_pixel)
            record["squareFeet"] = area_sqft
            record["pavementWidthFt"] = 24
            record["estimatedLengthFt"] = round(area_sqft / 24) if area_sqft else 0
            areas.append(record)

    areas.sort(key=lambda entry: (-entry["areaPx"], entry["type"], entry["id"]))
    return areas


def build_linework_mask(page: fitz.Page, width: int, height: int) -> np.ndarray:
    canvas = np.full((height, width), 255, dtype=np.uint8)

    for drawing in page.get_drawings():
        layer = drawing.get("layer") or ""
        rect = drawing.get("rect")
        if not rect or rect.x0 > MAP_X_MAX:
            continue
        if layer in SKIP_LAYERS:
            continue

        for item in drawing.get("items", []):
            op = item[0]
            if op == "l" and len(item) == 3:
                p1 = pdf_to_image_pixel(page, item[1].x, item[1].y)
                p2 = pdf_to_image_pixel(page, item[2].x, item[2].y)
                cv2.line(
                    canvas,
                    (int(p1[0]), int(p1[1])),
                    (int(p2[0]), int(p2[1])),
                    0,
                    1,
                )
            elif op == "c" and len(item) == 5:
                points = [pdf_to_image_pixel(page, item[i].x, item[i].y) for i in range(1, 5)]
                for idx in range(len(points) - 1):
                    cv2.line(
                        canvas,
                        (int(points[idx][0]), int(points[idx][1])),
                        (int(points[idx + 1][0]), int(points[idx + 1][1])),
                        0,
                        1,
                    )

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    walls = cv2.dilate(255 - canvas, kernel, iterations=1)
    return 255 - walls


def find_seed_point(free_space: np.ndarray, x: int, y: int) -> tuple[int, int] | None:
    height, width = free_space.shape
    if 0 <= x < width and 0 <= y < height and free_space[y, x] > 128:
        return x, y

    for radius in range(1, 20):
        for dx in range(-radius, radius + 1):
            for dy in range(-radius, radius + 1):
                sx, sy = x + dx, y + dy
                if 0 <= sx < width and 0 <= sy < height and free_space[sy, sx] > 128:
                    return sx, sy
    return None


def contour_to_polygon(contour: np.ndarray) -> list[list[float]]:
    simplified = cv2.approxPolyDP(contour, 2.0, True)
    polygon: list[list[float]] = []
    for point in simplified:
        x, y = point[0]
        polygon.append([round(float(x), 2), round(float(y), 2)])
    if len(polygon) >= 3 and polygon[0] != polygon[-1]:
        polygon.append(polygon[0])
    return polygon


def extract_lot_polygons(page: fitz.Page, labels: dict[int, tuple[float, float]]) -> list[dict]:
    page_width = int(page.rect.width * RENDER_SCALE)
    page_height = int(page.rect.height * RENDER_SCALE)
    free_space = build_linework_mask(page, page_width, page_height)
    lots: list[dict] = []

    for lot_number in sorted(labels):
        label_x, label_y = labels[lot_number]
        seed_x, seed_y = pdf_to_image_pixel(page, label_x, label_y)
        seed = find_seed_point(free_space, int(seed_x), int(seed_y))
        if seed is None:
            print(f"  warning: could not locate boundary for lot {lot_number}", file=sys.stderr)
            continue

        work = free_space.copy()
        mask = np.zeros((page_height + 2, page_width + 2), np.uint8)
        cv2.floodFill(work, mask, seed, 64, loDiff=0, upDiff=0)
        region = (work == 64).astype(np.uint8) * 255
        area = int(np.count_nonzero(region))

        if area < MIN_LOT_AREA or area > MAX_LOT_AREA:
            print(
                f"  warning: lot {lot_number} area {area}px outside expected bounds",
                file=sys.stderr,
            )
            continue

        contours, _ = cv2.findContours(region, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            continue

        contour = max(contours, key=cv2.contourArea)
        polygon = contour_to_polygon(contour)
        if len(polygon) < 4:
            continue

        xs = [point[0] for point in polygon]
        ys = [point[1] for point in polygon]
        label_px = pdf_to_image_pixel(page, label_x, label_y)

        lots.append(
            {
                "id": f"lot-{lot_number}",
                "lotNumber": lot_number,
                "label": str(lot_number),
                "labelPosition": [round(label_px[0], 2), round(label_px[1], 2)],
                "centroid": [round(sum(xs) / len(xs), 2), round(sum(ys) / len(ys), 2)],
                "bounds": [round(min(xs), 2), round(min(ys), 2), round(max(xs), 2), round(max(ys), 2)],
                "polygon": polygon,
                "areaPx": area,
                "rendering": None,
            }
        )

    return lots


def extract_commercial_block_labels(page: fitz.Page) -> list[dict[str, float]]:
    blocks: list[dict[str, float]] = []

    for annot in page.annots() or []:
        content = (annot.info.get("content") or "").strip()
        if content != COMMERCIAL_LABEL:
            continue
        rect = annot.rect
        if rect.x0 > MAP_X_MAX:
            continue
        label_x = (rect.x0 + rect.x1) / 2
        label_y = (rect.y0 + rect.y1) / 2
        label_px = pdf_to_image_pixel(page, label_x, label_y)
        blocks.append(
            {
                "labelX": label_x,
                "labelY": label_y,
                "labelPxX": label_px[0],
                "labelPxY": label_px[1],
            }
        )

    blocks.sort(key=lambda block: (block["labelY"], block["labelX"]))
    return blocks


def build_commercial_clip_mask(page: fitz.Page, width: int, height: int) -> np.ndarray:
    """Keep the commercial side of the divider line opposite the 149-164 row."""
    start = pdf_to_image_pixel(page, *COMMERCIAL_DIVIDER_A)
    end = pdf_to_image_pixel(page, *COMMERCIAL_DIVIDER_B)
    ax, ay = start
    bx, by = end

    xx, yy = np.meshgrid(np.arange(width), np.arange(height))
    side = (bx - ax) * (yy - ay) - (by - ay) * (xx - ax) > 0
    return side.astype(np.uint8) * 255


def mask_to_unit_record(
    page: fitz.Page,
    block_number: int,
    block: dict[str, float],
    unit_mask: np.ndarray,
) -> dict | None:
    area = int(np.count_nonzero(unit_mask))
    if area < MIN_COMMERCIAL_AREA or area > MAX_COMMERCIAL_AREA:
        print(
            f"  warning: commercial block {block_number} area {area}px outside expected bounds",
            file=sys.stderr,
        )
        return None

    contours, _ = cv2.findContours(unit_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    contour = max(contours, key=cv2.contourArea)
    polygon = contour_to_polygon(contour)
    if len(polygon) < 4:
        return None

    xs = [point[0] for point in polygon]
    ys = [point[1] for point in polygon]

    return {
        "id": f"commercial-{block_number}",
        "type": "commercial",
        "blockNumber": block_number,
        "phase": COMMERCIAL_PHASE,
        "label": COMMERCIAL_LABEL,
        "labelPosition": [round(block["labelPxX"], 2), round(block["labelPxY"], 2)],
        "centroid": [round(sum(xs) / len(xs), 2), round(sum(ys) / len(ys), 2)],
        "bounds": [round(min(xs), 2), round(min(ys), 2), round(max(xs), 2), round(max(ys), 2)],
        "polygon": polygon,
        "areaPx": area,
        "rendering": None,
    }


def extract_commercial_units(page: fitz.Page) -> list[dict]:
    blocks = extract_commercial_block_labels(page)
    if not blocks:
        return []

    page_width = int(page.rect.width * RENDER_SCALE)
    page_height = int(page.rect.height * RENDER_SCALE)
    clip_mask = build_commercial_clip_mask(page, page_width, page_height)
    free_space = cv2.bitwise_and(build_linework_mask(page, page_width, page_height), clip_mask)

    seed = find_seed_point(free_space, int(blocks[0]["labelPxX"]), int(blocks[0]["labelPxY"]))
    if seed is None:
        print("  warning: could not locate commercial envelope", file=sys.stderr)
        return []

    work = free_space.copy()
    flood_mask = np.zeros((page_height + 2, page_width + 2), np.uint8)
    cv2.floodFill(work, flood_mask, seed, 64, loDiff=0, upDiff=0)
    envelope = work == 64

    ys_idx, xs_idx = np.where(envelope)
    if len(xs_idx) == 0:
        print("  warning: commercial envelope was empty", file=sys.stderr)
        return []

    points = np.array([[block["labelPxX"], block["labelPxY"]] for block in blocks], dtype=np.float32)
    pixels = np.stack([xs_idx, ys_idx], axis=1).astype(np.float32)
    assignments = np.argmin(np.linalg.norm(pixels[:, None, :] - points[None, :, :], axis=2), axis=1)

    units: list[dict] = []
    for index, block in enumerate(blocks, start=1):
        unit_mask = np.zeros((page_height, page_width), np.uint8)
        selected = assignments == (index - 1)
        unit_mask[ys_idx[selected], xs_idx[selected]] = 255
        record = mask_to_unit_record(page, index, block, unit_mask)
        if record:
            units.append(record)

    return units


def nearest_phase_for_rgb(rgb: tuple[int, int, int]) -> int:
    return min(
        PHASE_RGB,
        key=lambda phase: math.sqrt(sum((rgb[index] - PHASE_RGB[phase][index]) ** 2 for index in range(3))),
    )


def sample_map_rgb(page: fitz.Page, pixmap: fitz.Pixmap, pdf_x: float, pdf_y: float) -> tuple[int, int, int]:
    pixel_x, pixel_y = pdf_to_image_pixel(page, pdf_x, pdf_y)
    image_x, image_y = int(pixel_x), int(pixel_y)
    if not (0 <= image_x < pixmap.width and 0 <= image_y < pixmap.height):
        return (255, 255, 255)
    index = (image_y * pixmap.width + image_x) * 3
    return pixmap.samples[index], pixmap.samples[index + 1], pixmap.samples[index + 2]


def sample_lot_phase_rgb(page: fitz.Page, pixmap: fitz.Pixmap, pdf_x: float, pdf_y: float) -> tuple[int, int, int]:
    for offset_x, offset_y in PHASE_SAMPLE_OFFSETS:
        rgb = sample_map_rgb(page, pixmap, pdf_x + offset_x, pdf_y + offset_y)
        if sum(rgb) > 90 and rgb != (255, 255, 255):
            return rgb
    return sample_map_rgb(page, pixmap, pdf_x, pdf_y)


def lot_type_for_number(lot_number: int) -> str:
    return LOT_TYPE_TOWNHOME if lot_number > LEGACY_LOT_MAX else LOT_TYPE_SINGLE_FAMILY


def extract_square_footage_annotations(page: fitz.Page) -> list[dict[str, float]]:
    annotations: list[dict[str, float]] = []

    for annot in page.annots() or []:
        content = (annot.info.get("content") or "").strip()
        match = SQUARE_FOOTAGE_PATTERN.fullmatch(content)
        if not match:
            continue
        rect = annot.rect
        if rect.x0 > MAP_X_MAX:
            continue
        annotations.append(
            {
                "squareFeet": int(match.group(1).replace(",", "")),
                "x": (rect.x0 + rect.x1) / 2,
                "y": (rect.y0 + rect.y1) / 2,
            }
        )

    return annotations


def match_square_footage_to_lots(
    labels: dict[int, tuple[float, float]],
    annotations: list[dict[str, float]],
) -> dict[int, int]:
    pairs: list[tuple[float, int, int]] = []

    for lot_number, (label_x, label_y) in labels.items():
        for index, annotation in enumerate(annotations):
            distance = math.hypot(annotation["x"] - label_x, annotation["y"] - label_y)
            if distance <= SQUARE_FOOTAGE_MATCH_RADIUS:
                pairs.append((distance, lot_number, index))

    pairs.sort(key=lambda entry: entry[0])
    matched: dict[int, int] = {}
    used_annotations: set[int] = set()

    for _, lot_number, annotation_index in pairs:
        if lot_number in matched or annotation_index in used_annotations:
            continue
        matched[lot_number] = annotations[annotation_index]["squareFeet"]
        used_annotations.add(annotation_index)

    return matched


def square_feet_per_pixel(lots: list[dict], annotated_square_feet: dict[int, int]) -> float | None:
    ratios: list[float] = []
    for lot in lots:
        lot_number = lot.get("lotNumber")
        area_px = lot.get("areaPx")
        if lot_number not in annotated_square_feet or not isinstance(area_px, int) or area_px <= 0:
            continue
        ratios.append(annotated_square_feet[lot_number] / area_px)

    if not ratios:
        return None

    ratios.sort()
    middle = len(ratios) // 2
    if len(ratios) % 2:
        return ratios[middle]
    return (ratios[middle - 1] + ratios[middle]) / 2


def assign_lot_square_footage(plat_page: fitz.Page, lots: list[dict]) -> None:
    """Assign lot type and square footage using plat-map annotations and polygon area."""
    if not lots:
        return

    labels = extract_lot_labels(plat_page)
    annotations = extract_square_footage_annotations(plat_page)
    annotated_square_feet = match_square_footage_to_lots(labels, annotations)
    sqft_per_px = square_feet_per_pixel(lots, annotated_square_feet)

    for lot in lots:
        lot_number = lot.get("lotNumber")
        if not isinstance(lot_number, int):
            continue

        lot["lotType"] = lot_type_for_number(lot_number)
        if lot_number in annotated_square_feet:
            lot["squareFeet"] = annotated_square_feet[lot_number]
        elif sqft_per_px is not None and isinstance(lot.get("areaPx"), int):
            lot["squareFeet"] = round(lot["areaPx"] * sqft_per_px)
        else:
            lot.pop("squareFeet", None)


def assign_lot_phases(doc: fitz.Document, lots: list[dict]) -> None:
    """Assign each lot a phase using the page 2 phasing legend color fills."""
    if not lots:
        return

    page = doc[PHASE_LEGEND_PAGE_INDEX]
    matrix = fitz.Matrix(RENDER_SCALE, RENDER_SCALE)
    pixmap = page.get_pixmap(matrix=matrix, alpha=False)

    label_positions: dict[int, tuple[float, float]] = {}
    for annot in page.annots() or []:
        content = (annot.info.get("content") or "").strip()
        if not re.fullmatch(r"\d+", content):
            continue
        lot_number = int(content)
        if not MIN_LOT_NUMBER <= lot_number <= MAX_LOT_NUMBER:
            continue
        if annot.rect.x0 > MAP_X_MAX:
            continue
        if lot_number in label_positions:
            continue
        rect = annot.rect
        label_positions[lot_number] = ((rect.x0 + rect.x1) / 2, (rect.y0 + rect.y1) / 2)

    for lot in lots:
        lot_number = lot.get("lotNumber")
        if lot_number not in label_positions:
            continue
        label_x, label_y = label_positions[lot_number]
        rgb = sample_lot_phase_rgb(page, pixmap, label_x, label_y)
        lot["phase"] = nearest_phase_for_rgb(rgb)


def load_preserved_lots(lots_path: Path) -> list[dict]:
    """Keep the original 1-120 extraction when refreshing townhome lots."""
    if not lots_path.exists():
        return []

    extra_fields = {"clickBounds", "clickPolygon", "townhomeGroupSize"}
    existing = json.loads(lots_path.read_text(encoding="utf-8"))
    preserved = [
        {key: value for key, value in lot.items() if key not in extra_fields}
        for lot in existing
        if isinstance(lot.get("lotNumber"), int) and lot["lotNumber"] <= LEGACY_LOT_MAX
    ]
    preserved.sort(key=lambda lot: lot["lotNumber"])
    return preserved


def save_dzi(image: Image.Image, prefix: Path, tile_size: int = TILE_SIZE, overlap: int = TILE_OVERLAP) -> None:
    width, height = image.size
    max_level = int(math.ceil(math.log2(max(width, height))))
    files_dir = Path(f"{prefix}_files")
    files_dir.mkdir(parents=True, exist_ok=True)

    for level in range(max_level + 1):
        scale = 2 ** (max_level - level)
        level_width = max(1, int(math.ceil(width / scale)))
        level_height = max(1, int(math.ceil(height / scale)))
        level_image = image.resize((level_width, level_height), Image.Resampling.LANCZOS)
        level_dir = files_dir / str(level)
        level_dir.mkdir(parents=True, exist_ok=True)

        cols = int(math.ceil(level_width / tile_size))
        rows = int(math.ceil(level_height / tile_size))

        for row in range(rows):
            for col in range(cols):
                left = max(0, col * tile_size - overlap)
                top = max(0, row * tile_size - overlap)
                right = min(level_width, (col + 1) * tile_size + overlap)
                bottom = min(level_height, (row + 1) * tile_size + overlap)
                tile = level_image.crop((left, top, right, bottom))
                tile.save(level_dir / f"{col}_{row}.jpg", quality=88, optimize=True)

    dzi_path = Path(f"{prefix}.dzi")
    dzi_path.write_text(
        "\n".join(
            [
                '<?xml version="1.0" encoding="UTF-8"?>',
                f'<Image TileSize="{tile_size}" Overlap="{overlap}" Format="jpg" '
                'xmlns="http://schemas.microsoft.com/deepzoom/2008">',
                f'  <Size Width="{width}" Height="{height}"/>',
                "</Image>",
            ]
        ),
        encoding="utf-8",
    )


def render_sheet(page: fitz.Page, sheet_id: str) -> tuple[int, int]:
    matrix = fitz.Matrix(RENDER_SCALE, RENDER_SCALE)
    pixmap = page.get_pixmap(matrix=matrix, alpha=False)
    image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
    prefix = TILE_DIR / sheet_id
    TILE_DIR.mkdir(parents=True, exist_ok=True)
    save_dzi(image, prefix)
    return pixmap.width, pixmap.height


def process_sheet(
    doc: fitz.Document,
    page_index: int,
    plat_page: fitz.Page,
    *,
    skip_tiles: bool = False,
) -> dict:
    page = doc[page_index]
    sheet_number = page_index + 1
    sheet_id = f"sheet{sheet_number}"
    print(f"Processing {sheet_id}...")

    labels = extract_lot_labels(page)
    lots_path = DATA_DIR / f"{sheet_id}-lots.json"
    preserved_lots = load_preserved_lots(lots_path)
    townhome_labels = {
        lot_number: position
        for lot_number, position in labels.items()
        if lot_number > LEGACY_LOT_MAX
    }
    new_lots = extract_lot_polygons(page, townhome_labels)
    lots = preserved_lots + new_lots
    lots.sort(key=lambda lot: lot["lotNumber"])
    assign_lot_phases(doc, lots)
    assign_lot_square_footage(plat_page, lots)
    roads = extract_road_labels(page)
    commercial_units: list[dict] = []
    commercial_path = DATA_DIR / f"{sheet_id}-commercial.json"
    if sheet_number == 1:
        commercial_units = extract_commercial_units(page)
    site_areas = extract_site_areas(page, lots, commercial_units)
    if skip_tiles:
        pixel_width = int(page.rect.width * RENDER_SCALE)
        pixel_height = int(page.rect.height * RENDER_SCALE)
    else:
        pixel_width, pixel_height = render_sheet(page, sheet_id)

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    lots_path.write_text(json.dumps(lots, indent=2), encoding="utf-8")
    if sheet_number == 1:
        commercial_path.write_text(json.dumps(commercial_units, indent=2), encoding="utf-8")
    site_areas_path = DATA_DIR / f"{sheet_id}-site-areas.json"
    site_areas_path.write_text(json.dumps(site_areas, indent=2), encoding="utf-8")

    print(
        f"  kept {len(preserved_lots)} legacy lots, extracted {len(new_lots)} townhome lots, "
        f"{len(commercial_units)} phase {COMMERCIAL_PHASE} commercial units, "
        f"{len(roads)} road labels, {len(site_areas)} site areas"
    )
    sheet_meta = {
        "id": sheet_id,
        "title": "Plat Map" if sheet_number == 1 else "Utilities Plan",
        "sheetNumber": sheet_number,
        "width": round(page.rect.width, 2),
        "height": round(page.rect.height, 2),
        "pageRotation": page.rotation,
        "pixelWidth": pixel_width,
        "pixelHeight": pixel_height,
        "coordinateSpace": "imagePixels",
        "tileSource": f"tiles/{sheet_id}.dzi",
        "lotsFile": f"data/{sheet_id}-lots.json",
        "roads": roads,
        "siteAreasFile": f"data/{sheet_id}-site-areas.json",
        "siteAreaCount": len(site_areas),
        "lotCount": len(lots),
    }
    if sheet_number == 1:
        sheet_meta["commercialFile"] = f"data/{sheet_id}-commercial.json"
        sheet_meta["commercialCount"] = len(commercial_units)
        sheet_meta["commercialPhase"] = COMMERCIAL_PHASE
    return sheet_meta


def main() -> None:
    skip_tiles = "--skip-tiles" in sys.argv

    if not PDF_PATH.exists():
        raise SystemExit(f"PDF not found: {PDF_PATH}")

    doc = fitz.open(PDF_PATH)
    plat_page = doc[0]
    sheets = [
        process_sheet(doc, index, plat_page, skip_tiles=skip_tiles) for index in range(doc.page_count)
    ]
    doc.close()

    manifest = {
        "project": "Delta Crossings",
        "sourcePdf": PDF_PATH.name,
        "renderScale": RENDER_SCALE,
        "coordinateSpace": "imagePixels",
        "sheets": sheets,
    }
    manifest_path = DATA_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Wrote manifest to {manifest_path}")


if __name__ == "__main__":
    main()
