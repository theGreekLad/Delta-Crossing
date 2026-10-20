"""Compute Delta Crossings boundary lat/lon from Rezone Legal metes-and-bounds."""

from __future__ import annotations

import json
import math
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "web" / "data" / "boundary-georef.json"

PLSS_QUERY_URL = (
    "https://services1.arcgis.com/99lidPhWCzftIe9K/ArcGIS/rest/services/"
    "UtahPLSSGCDBPoints/FeatureServer/0/query"
)
TOWNSHIP_PLSSID = "UT260170S0060W0"  # T17S R6W Salt Lake Meridian
SITE_REFERENCE = {
    "label": "460 N Highway 6, Delta, UT (approximate)",
    "lat": 39.3522,
    "lon": -112.5772,
}

# Rezone Legal (Reeve & Associates, 3-30-2023). OCR typos corrected.
LEGAL_SEGMENTS = [
    {"kind": "offset", "south_ft": 262.05, "west_ft": 463.82},
    {"kind": "line", "bearing": "N 89°15'00\" W", "distance_ft": 857.50},
    {"kind": "line", "bearing": "N 00°19'54\" E", "distance_ft": 1603.93},
    {
        "kind": "curve",
        "radius_ft": 5384.74,
        "arc_length_ft": 369.47,
        "delta_deg": 3 + 55 / 60 + 53 / 3600,
        "chord_bearing": "S 86°39'19\" E",
        "chord_length_ft": 369.39,
        "turn": "left",
    },
    {"kind": "line", "bearing": "S 00°45'00\" W", "distance_ft": 48.01},
    {"kind": "line", "bearing": "S 84°45'16\" E", "distance_ft": 28.57},
    {"kind": "line", "bearing": "S 71°56'43\" E", "distance_ft": 787.07},
    {"kind": "line", "bearing": "S 78°32'20\" E", "distance_ft": 945.40},
    {"kind": "line", "bearing": "S 47°45'00\" W", "distance_ft": 1652.63},
]

FEET_PER_METER = 3.280839895
METERS_PER_DEG_LAT = 111_320.0


@dataclass
class Point:
    x_ft: float
    y_ft: float

    def to_latlon(self, origin_lat: float, origin_lon: float) -> tuple[float, float]:
        meters_north = self.y_ft / FEET_PER_METER
        meters_east = self.x_ft / FEET_PER_METER
        lat = origin_lat + meters_north / METERS_PER_DEG_LAT
        lon = origin_lon + meters_east / (
            METERS_PER_DEG_LAT * math.cos(math.radians(origin_lat))
        )
        return lat, lon


def parse_bearing(bearing: str) -> float:
    """Convert survey bearing to azimuth degrees clockwise from north."""
    bearing = bearing.strip().upper()
    parts = bearing.replace("°", " ").replace("'", " ").replace('"', " ").split()
    ns = parts[0]
    deg = float(parts[1])
    minutes = float(parts[2]) if len(parts) > 2 else 0.0
    seconds = float(parts[3]) if len(parts) > 3 else 0.0
    ew = parts[-1]
    angle = deg + minutes / 60 + seconds / 3600

    if ns == "N" and ew == "E":
        return angle
    if ns == "S" and ew == "E":
        return 180 - angle
    if ns == "S" and ew == "W":
        return 180 + angle
    if ns == "N" and ew == "W":
        return 360 - angle
    raise ValueError(f"Unsupported bearing: {bearing}")


def move(point: Point, azimuth_deg: float, distance_ft: float) -> Point:
    az = math.radians(azimuth_deg)
    dx = distance_ft * math.sin(az)
    dy = distance_ft * math.cos(az)
    return Point(point.x_ft + dx, point.y_ft + dy)


def fetch_plss_points() -> list[dict]:
    params = {
        "where": f"PLSSID='{TOWNSHIP_PLSSID}'",
        "outFields": "POINTLAB,POINTID,XCOORD,YCOORD",
        "returnGeometry": "true",
        "f": "json",
        "resultRecordCount": "2000",
    }
    url = f"{PLSS_QUERY_URL}?{urllib.parse.urlencode(params)}"
    with urllib.request.urlopen(url, timeout=60) as response:
        payload = json.load(response)
    return payload.get("features", [])


def fetch_section7_ne_corner() -> tuple[float, float, str]:
    """Return WGS84 lon/lat for the northeast corner of Section 7, T17S R6W."""
    params = {
        "geometry": json.dumps(
            {"x": -112.571, "y": 39.352, "spatialReference": {"wkid": 4326}}
        ),
        "geometryType": "esriGeometryPoint",
        "inSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": "FRSTDIVNO,LABEL,PLSSID",
        "returnGeometry": "true",
        "outSR": "4326",
        "f": "json",
    }
    url = (
        "https://services1.arcgis.com/99lidPhWCzftIe9K/ArcGIS/rest/services/"
        f"PLSSSections_GCDB/FeatureServer/0/query?{urllib.parse.urlencode(params)}"
    )
    with urllib.request.urlopen(url, timeout=60) as response:
        payload = json.load(response)

    features = payload.get("features", [])
    if not features:
        raise RuntimeError("Section 7 polygon not found in UGRC PLSS sections layer")

    ring = features[0]["geometry"]["rings"][0]
    lats = [point[1] for point in ring]
    lons = [point[0] for point in ring]
    # NE corner = northern edge, eastern edge of section polygon.
    north = max(lats)
    ne_candidates = [point for point in ring if abs(point[1] - north) < 1e-9]
    ne_lon, ne_lat = max(ne_candidates, key=lambda point: point[0])
    label = features[0]["attributes"].get("LABEL", "T17S R6W Section 7")
    return ne_lon, ne_lat, label


def find_section7_ne_corner(points: list[dict]) -> tuple[float, float, str]:
    del points
    return fetch_section7_ne_corner()


def walk_boundary_local(ne_corner_lon: float, ne_corner_lat: float) -> tuple[list[Point], list[tuple[float, float]]]:
    current = Point(0.0, 0.0)
    local = [current]
    latlon = [current.to_latlon(ne_corner_lat, ne_corner_lon)]

    for segment in LEGAL_SEGMENTS:
        if segment["kind"] == "offset":
            current = Point(
                current.x_ft - segment["west_ft"],
                current.y_ft - segment["south_ft"],
            )
        elif segment["kind"] == "line":
            az = parse_bearing(segment["bearing"])
            current = move(current, az, segment["distance_ft"])
        elif segment["kind"] == "curve":
            az = parse_bearing(segment["chord_bearing"])
            current = move(current, az, segment["chord_length_ft"])
        else:
            raise ValueError(f"Unknown segment kind: {segment['kind']}")

        local.append(current)
        latlon.append(current.to_latlon(ne_corner_lat, ne_corner_lon))

    return local, latlon


def load_plat_world_bounds() -> dict:
    lots_path = ROOT / "web" / "data" / "sheet1-lots.json"
    commercial_path = ROOT / "web" / "data" / "sheet1-commercial.json"
    manifest_path = ROOT / "web" / "data" / "manifest.json"

    lots = json.loads(lots_path.read_text(encoding="utf-8"))
    commercial = json.loads(commercial_path.read_text(encoding="utf-8"))
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    sheet = next(item for item in manifest["sheets"] if item["id"] == "sheet1")

    ratios = [
        lot["squareFeet"] / lot["areaPx"]
        for lot in lots
        if lot.get("squareFeet") and lot.get("areaPx")
    ]
    ratios.sort()
    feet_per_pixel = math.sqrt(ratios[len(ratios) // 2]) if ratios else 0.22
    origin_x = sheet["pixelWidth"] / 2
    origin_y = sheet["pixelHeight"] / 2

    def to_world(polygon):
        world = []
        for x, y in polygon:
            if isinstance(x, list):
                world.extend(to_world(x))
                continue
            world.append(
                (
                    (x - origin_x) * feet_per_pixel,
                    (y - origin_y) * feet_per_pixel,
                )
            )
        return world

    points = []
    for lot in lots + commercial:
        points.extend(to_world(lot["polygon"]))

    xs = [point[0] for point in points]
    zs = [point[1] for point in points]
    return {
        "minX": min(xs),
        "maxX": max(xs),
        "minZ": min(zs),
        "maxZ": max(zs),
        "centerX": (min(xs) + max(xs)) / 2,
        "centerZ": (min(zs) + max(zs)) / 2,
        "feetPerPixel": feet_per_pixel,
    }


def compute_alignment(plat_bounds: dict, geo_bounds: dict, geo_center_lat: float) -> dict:
    plat_width = plat_bounds["maxX"] - plat_bounds["minX"]
    plat_depth = plat_bounds["maxZ"] - plat_bounds["minZ"]
    feet_per_deg_lat = METERS_PER_DEG_LAT * FEET_PER_METER
    feet_per_deg_lon = feet_per_deg_lat * math.cos(math.radians(geo_center_lat))

    geo_width_ft = (geo_bounds["maxLon"] - geo_bounds["minLon"]) * feet_per_deg_lon
    geo_depth_ft = (geo_bounds["maxLat"] - geo_bounds["minLat"]) * feet_per_deg_lat

    scale_x = geo_width_ft / plat_width
    scale_z = geo_depth_ft / plat_depth
    scale = (scale_x + scale_z) / 2

    return {
        "method": "legal-scale-site-anchor",
        "platBounds": plat_bounds,
        "geoBounds": geo_bounds,
        "siteReference": SITE_REFERENCE,
        "rotationDeg": 0,
        "scaleFeetPerDegreeLat": feet_per_deg_lat,
        "scaleFeetPerDegreeLon": feet_per_deg_lon,
        "uniformScale": scale,
        "worldOrigin": {
            "x": plat_bounds["centerX"],
            "z": plat_bounds["centerZ"],
        },
        "geoOrigin": {
            "lon": SITE_REFERENCE["lon"],
            "lat": SITE_REFERENCE["lat"],
        },
    }


def world_to_geo(x: float, z: float, alignment: dict) -> tuple[float, float]:
    dx = (x - alignment["worldOrigin"]["x"]) * alignment["uniformScale"]
    dz = (z - alignment["worldOrigin"]["z"]) * alignment["uniformScale"]
    lon = alignment["geoOrigin"]["lon"] + dx / alignment["scaleFeetPerDegreeLon"]
    lat = alignment["geoOrigin"]["lat"] + dz / alignment["scaleFeetPerDegreeLat"]
    return lon, lat


def geo_to_world(lon: float, lat: float, alignment: dict) -> tuple[float, float]:
    dx = (lon - alignment["geoOrigin"]["lon"]) * alignment["scaleFeetPerDegreeLon"]
    dz = (lat - alignment["geoOrigin"]["lat"]) * alignment["scaleFeetPerDegreeLat"]
    x = alignment["worldOrigin"]["x"] + dx / alignment["uniformScale"]
    z = alignment["worldOrigin"]["z"] + dz / alignment["uniformScale"]
    return x, z


def polygon_bounds(coords: list[tuple[float, float]]) -> dict:
    lats = [lat for lat, _ in coords]
    lons = [lon for _, lon in coords]
    return {
        "minLat": min(lats),
        "maxLat": max(lats),
        "minLon": min(lons),
        "maxLon": max(lons),
        "centerLat": sum(lats) / len(lats),
        "centerLon": sum(lons) / len(lons),
    }


def main() -> None:
    points = fetch_plss_points()
    ne_lon, ne_lat, anchor_label = find_section7_ne_corner(points)
    local_vertices, latlon_vertices = walk_boundary_local(ne_lon, ne_lat)
    bounds = polygon_bounds(latlon_vertices)
    plat_bounds = load_plat_world_bounds()
    alignment = compute_alignment(plat_bounds, bounds, bounds["centerLat"])

    # Satellite imagery should cover the plat extent mapped into geographic space.
    corner_world = [
        (plat_bounds["minX"], plat_bounds["minZ"]),
        (plat_bounds["minX"], plat_bounds["maxZ"]),
        (plat_bounds["maxX"], plat_bounds["minZ"]),
        (plat_bounds["maxX"], plat_bounds["maxZ"]),
    ]
    corner_geo = [world_to_geo(x, z, alignment) for x, z in corner_world]
    corner_lons = [lon for lon, _ in corner_geo]
    corner_lats = [lat for _, lat in corner_geo]

    pad_lat = (max(corner_lats) - min(corner_lats)) * 0.12
    pad_lon = (max(corner_lons) - min(corner_lons)) * 0.12
    satellite_bounds = {
        "minLat": min(corner_lats) - pad_lat,
        "maxLat": max(corner_lats) + pad_lat,
        "minLon": min(corner_lons) - pad_lon,
        "maxLon": max(corner_lons) + pad_lon,
    }

    sw_x, sw_z = geo_to_world(satellite_bounds["minLon"], satellite_bounds["minLat"], alignment)
    ne_x, ne_z = geo_to_world(satellite_bounds["maxLon"], satellite_bounds["maxLat"], alignment)

    payload = {
        "source": "Supporting Docs/Delta/Reports/Rezone Legal.pdf",
        "anchor": {
            "description": "Northeast corner of Section 7, T17S R6W SLM",
            "sectionLabel": anchor_label,
            "longitude": ne_lon,
            "latitude": ne_lat,
        },
        "acres": 49.055,
        "verticesLatLon": [{"lat": lat, "lon": lon} for lat, lon in latlon_vertices],
        "verticesLocalFeet": [
            {"x": point.x_ft, "y": point.y_ft} for point in local_vertices
        ],
        "bounds": bounds,
        "alignment": alignment,
        "satellite": {
            "provider": "Esri World Imagery",
            "bounds": satellite_bounds,
            "worldBounds": {
                "minX": min(sw_x, ne_x),
                "maxX": max(sw_x, ne_x),
                "minZ": min(sw_z, ne_z),
                "maxZ": max(sw_z, ne_z),
            },
            "image": "assets/satellite.jpg",
        },
        "segments": LEGAL_SEGMENTS,
        "disclaimer": (
            "Computed from rezone legal metes-and-bounds anchored to UGRC GCDB "
            "section corner. For mapping only; not a legal survey."
        ),
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote {OUTPUT}")
    print(f"NE corner ({anchor_label}): {ne_lat:.8f}, {ne_lon:.8f}")
    print(
        "Bounds: "
        f"lat {bounds['minLat']:.6f}..{bounds['maxLat']:.6f}, "
        f"lon {bounds['minLon']:.6f}..{bounds['maxLon']:.6f}"
    )
    print(f"Vertices: {len(latlon_vertices)}")


if __name__ == "__main__":
    main()
