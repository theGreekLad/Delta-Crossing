"""Download public Esri World Imagery for the Delta Crossings georef bounds."""

from __future__ import annotations

import json
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GEOREF_PATH = ROOT / "web" / "data" / "boundary-georef.json"
OUTPUT_PATH = ROOT / "web" / "assets" / "satellite.jpg"
EXPORT_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export"
IMAGE_SIZE = 2048


def main() -> None:
    georef = json.loads(GEOREF_PATH.read_text(encoding="utf-8"))
    bounds = georef["satellite"]["bounds"]
    bbox = f"{bounds['minLon']},{bounds['minLat']},{bounds['maxLon']},{bounds['maxLat']}"

    params = {
        "bbox": bbox,
        "bboxSR": "4326",
        "imageSR": "4326",
        "size": f"{IMAGE_SIZE},{IMAGE_SIZE}",
        "format": "jpg",
        "f": "image",
    }
    url = f"{EXPORT_URL}?{urllib.parse.urlencode(params)}"
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    request = urllib.request.Request(url, headers={"User-Agent": "plat-satellite-fetch/1.0"})
    with urllib.request.urlopen(request, timeout=120) as response:
        OUTPUT_PATH.write_bytes(response.read())

    georef["satellite"]["image"] = "assets/satellite.jpg"
    georef["satellite"]["imageWidth"] = IMAGE_SIZE
    georef["satellite"]["imageHeight"] = IMAGE_SIZE
    georef["satellite"]["attribution"] = "Esri, Maxar, Earthstar Geographics, and the GIS User Community"
    GEOREF_PATH.write_text(json.dumps(georef, indent=2), encoding="utf-8")

    print(f"Wrote {OUTPUT_PATH}")
    print(f"Bounds: {bbox}")


if __name__ == "__main__":
    main()
