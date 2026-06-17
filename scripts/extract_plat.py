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


def process_sheet(doc: fitz.Document, page_index: int, *, skip_tiles: bool = False) -> dict:
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
    roads = extract_road_labels(page)
    if skip_tiles:
        pixel_width = int(page.rect.width * RENDER_SCALE)
        pixel_height = int(page.rect.height * RENDER_SCALE)
    else:
        pixel_width, pixel_height = render_sheet(page, sheet_id)

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    lots_path.write_text(json.dumps(lots, indent=2), encoding="utf-8")

    print(
        f"  kept {len(preserved_lots)} legacy lots, extracted {len(new_lots)} townhome lots, "
        f"{len(roads)} road labels"
    )
    return {
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
        "lotCount": len(lots),
    }


def main() -> None:
    skip_tiles = "--skip-tiles" in sys.argv

    if not PDF_PATH.exists():
        raise SystemExit(f"PDF not found: {PDF_PATH}")

    doc = fitz.open(PDF_PATH)
    sheets = [process_sheet(doc, index, skip_tiles=skip_tiles) for index in range(doc.page_count)]
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
