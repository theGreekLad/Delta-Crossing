#!/usr/bin/env python3
"""Generate code-checked concept layouts for the Delta Crossings south parcel.

The south parcel is the land south of Jasper Drive and west of the Phase 2 commercial line:
Phase 1 Lots 116-118 (Lots 17-19 on the 2023-07-12 preliminary plat), Parcel C (canal buffer),
Harvest Lane south of Jasper, the 3.0-acre "Future Phase" block, and Parcel A (open space /
retention). Geometry comes from the Delta Crossings Phase 1 plat (Reeve & Associates, Nov 2023)
and the 4.800-acre future-phase description (Reeve & Associates, 3-8-2024).

Coordinates are survey feet in a local frame: +X runs east along Jasper Drive (plat bearing
S88°27'43"E) and +Y runs north (N01°32'17"E). The origin is the southwest corner of the
4.800-acre description, where the canal strip meets the north line of Delta Estates.

Outputs, written to web/data/south-parcel/:
  concepts.json            base parcels plus every concept's streets, lots, quantities and checks
  concept-<id>.svg / .png  plan sheet per concept

Usage:  python scripts/south_parcel_concept.py
"""
from __future__ import annotations

import json
import math
import os
from itertools import product as iter_product

from PIL import Image, ImageDraw, ImageFont
from shapely import affinity
from shapely.geometry import LineString, Polygon, box
from shapely.ops import split, unary_union

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'web', 'data', 'south-parcel')

# ---------------------------------------------------------------------------
# Survey control (Phase 1 plat + 3-8-2024 future-phase description)
# ---------------------------------------------------------------------------
JASPER_CL_Y = 257.72          # Jasper Drive centerline east of Harvest Lane
JASPER_S_ROW_Y = 227.72       # south right-of-way line (N88°27'43"W 607.62')
FP_EAST_X = 812.02            # east line of the 4.800-ac description (N01°32'17"E 227.72')
HARVEST_CL_JASPER_X = 172.00  # Harvest Lane / Jasper Drive centerline intersection (C8)
EMERALD_CL_X = HARVEST_CL_JASPER_X + 2 * 276.01  # Moonstone and Emerald are 276.01' apart on Jasper
JASPER_C14_PC_X = EMERALD_CL_X + 118.53          # start of the C14 (R=300) curve toward 460 North
PARCEL_C_WIDTH = 30.0
LOT_LINE_SLOPE = math.tan(math.radians(0.491))  # lot lines bear S88°57'12"E (0.49° off Jasper)
LOTS_116_118 = (  # name, Y at the canal-strip line where the lot starts, plat area
    ('118', 0.00, 12772),
    ('117', 74.87, 11081),
    ('116', 149.65, 9259),
)
PARCEL_A_PLAT_SQFT = 49782
FOUR_POINT_EIGHT_AC_SQFT = 209083

# ---------------------------------------------------------------------------
# Delta City code values used by the layout (citations carried into the JSON)
# ---------------------------------------------------------------------------
HALF_ROW = 30.0         # DCC 16.24.050: 60' minimum right-of-way
PAVEMENT_HALF = 20.5    # ST-02 60' local road: 41' asphalt (12' lanes + 8.5' parking)
CURB_GUTTER = 2.5       # ST-02 type B-1 curb and gutter
SIDEWALK = 5.0          # ST-02 5' sidewalk against the curb, 2' behind walk
CURB_RETURN_R = 25.0    # TMP 2025 §7.5.1: 25' minimum corner radius
R4 = {
    'sf_min_area': 7500,
    'mf_base_area': 7500,
    'mf_per_added_unit': 2000,
    'min_width': 70,
    'corner_min_width': 75,
    'front': 25,
    'side': 10,
    'rear': 10,
    'corner_side': 20,
    'max_height': 35,
    'max_units_per_building': 4,
}
STALLS_PER_UNIT = 3
STALL_W, STALL_D = 9, 18          # Ord. 2022-299 parking area definition (9' x 18')
TOWNHOME_OPEN_SPACE = 500          # DCC 18.64.190.5
TOWNHOME_WALK = 4                  # DCC 18.64.190.7.a
COLLECTOR_BUFFER = 10              # DCC 16.24.090
BLOCK_MIN, BLOCK_MAX = 330, 630    # DCC 16.24.110
RAIN_10YR_24HR_IN = 1.37           # NOAA Atlas 14 PFDS, 39.353 N / 112.565 W (partial-duration)
RUNOFF_C_IMPERVIOUS, RUNOFF_C_PERVIOUS = 0.90, 0.15

ELBOW_RADIUS = 75.0         # Street A to Street B centerline curve
APPROACH_TANGENT = 25.0     # Street A leaves Harvest Lane square for this distance...
APPROACH_RADIUS = 150.0     # ...then curves to run due east

# Footprints (feet). Single-family designs match web-3d/src/data/buildingCatalog.js; the
# townhome unit is widened to 31' so each unit has a 27' three-stall driveway plus its own 4' walk.
SF_DESIGNS = (
    {'id': 'sf-craftsman', 'name': 'Craftsman Cottage', 'width': 44, 'depth': 46, 'livableSqFt': 2375},
    {'id': 'sf-rural-gable', 'name': 'Rural Gable Farmhouse', 'width': 42, 'depth': 48, 'livableSqFt': 2175},
    {'id': 'sf-low-pitch', 'name': 'Low Pitch Modern Rural', 'width': 40, 'depth': 50, 'livableSqFt': 2275},
)
TH_UNIT = {'id': 'th-31', 'name': 'Two-story townhome unit', 'width': 31, 'depth': 38,
           'stories': 2, 'heightFt': 28, 'livableSqFt': 1900}
DRIVEWAY_W = STALLS_PER_UNIT * STALL_W  # 27'

CONCEPTS = (
    {'id': 'A', 'name': 'Single-Family', 'north': 'SF', 'south': 'SF',
     'summary': 'Detached homes on both new tiers.'},
    {'id': 'B', 'name': 'Mixed', 'north': 'TH', 'south': 'SF',
     'summary': 'Townhomes along Jasper Drive (collector buffer); single-family next to Delta Estates.'},
    {'id': 'C', 'name': 'Townhome', 'north': 'TH', 'south': 'TH',
     'summary': 'Townhome buildings on both new tiers for maximum unit count.'},
)

RULES = (
    ('zone', 'Zoning', 'Ord. 23-300; Res. 2023-469', 'Parcel is inside the 49.055-ac M-H to R-4 rezone'),
    ('use', 'Allowed uses', 'DCC 18.16.010 (Ord. 2023-302)', 'R-4 allows SF, two-, three-, four-family and townhomes; max 4 units/building'),
    ('sf_area', 'SF lot area', 'DCC 18.24.040 (Ord. 21-290)', '7,500 SF minimum'),
    ('mf_area', 'Townhome building lot area', 'DCC 18.24.040; 18.64.190.3a', '7,500 SF + 2,000 SF per unit after the first'),
    ('width', 'Lot frontage', 'DCC 18.24.040; 18.64.190.3b', "70' minimum, 75' corner; townhomes measured across the building"),
    ('setbacks', 'Setbacks', 'DCC 18.24.040', "Front 25', side 10', rear 10', corner street side 20'"),
    ('height', 'Height', 'DCC 18.24.040', "35' maximum"),
    ('parking', 'Parking', 'DCC 18.64.050 (Ord. 2022-299)', '3 side-by-side 9x18 stalls per unit; no tandem; garage or driveway, not both'),
    ('th_parking', 'Townhome parking', 'DCC 18.64.190.4', "Stalls on the unit's own lot, fronting the ROW, not shared"),
    ('th_open', 'Townhome open space', 'DCC 18.64.190.5', '500 SF private open space per unit on its own lot'),
    ('th_front', 'Townhome frontage and walks', 'DCC 18.64.190.7', "Every building fronts a public street; 4' walk from each unit to the ROW"),
    ('one_structure', 'One principal structure per lot', 'DCC 18.64.010.A', 'Each building on its own lot; units on their own unit lots'),
    ('street_row', 'Street section', 'DCC 16.24.050; ST-02 (Ord. 2025-317)', "60' ROW; 41' asphalt, 2.5' curb and gutter, 5' walks both sides"),
    ('cul', 'Street pattern', 'DCC 16.24.060 / 16.24.070', 'No alleys, cul-de-sacs or permanent dead ends'),
    ('block', 'Block length', 'DCC 16.24.110', "330'-630' centerline to centerline"),
    ('lot_access', 'Lot access', 'DCC 16.24.120.B, D', "Every lot abuts a 60' public street; side lines square to the street"),
    ('collector', 'Jasper Drive frontage', 'DCC 16.24.090; TMP 2025 §7', "No driveways on Jasper (450 North major collector); 10' rear planting buffer"),
    ('intersection', 'Intersections', 'TMP 2025 §7.5 (Ord. 2025-318)', 'Streets meet at 90° and line up with existing intersections'),
    ('storm', 'Storm drainage', 'DCC 16.28.030.I', 'Hold the 24-hour, 10-year storm on site (NOAA Atlas 14: 1.37 in)'),
    ('ditch', 'Ditches', 'DCC 16.28.030.H; 18.64.040', 'No open ditches within or adjoining the subdivision'),
    ('pue', 'Utility easements', 'DCC 16.24.080; Phase 1 plat', "15' total easement width; 10' PUE along lot fronts"),
)


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------
def polys(geom):
    if geom is None or geom.is_empty:
        return []
    if isinstance(geom, Polygon):
        return [geom]
    out = []
    for part in getattr(geom, 'geoms', []):
        out.extend(polys(part))
    return out


def largest(geom):
    parts = polys(geom)
    return max(parts, key=lambda p: p.area) if parts else Polygon()


def ring(poly, digits=2):
    return [[round(x, digits), round(y, digits)] for x, y in poly.exterior.coords]


def clipped_rings(geom, view, digits=1):
    """Polygon outlines (exterior + holes) clipped to the drawing extent, for the web viewer."""
    out = []
    for p in polys(geom.intersection(view)):
        rings = [p.exterior] + list(p.interiors)
        out.append([[[round(x, digits), round(y, digits)] for x, y in r.coords] for r in rings])
    return out


def harvest_centerline(step=0.5):
    """Harvest Lane centerline samples (x, y, heading) from Days Ave north past Jasper.

    Heading is radians west of north. From the south line: 15.89' tangent, C10 (R=250, 116.98')
    curving west, C9 (R=300, 134.13') curving back, ending on the Jasper centerline at C8.
    """
    samples = [(231.07, -110.0, 0.0), (231.07, 15.89, 0.0)]
    x, y, heading = 231.07, 15.89, 0.0
    for radius, arc_len, turn in ((250.0, 116.98, 1), (300.0, 134.13, -1), (300.0, 3.67, -1)):
        n = max(2, math.ceil(arc_len / step))
        ds = arc_len / n
        for _ in range(n):
            heading += turn * ds / radius / 2
            x -= ds * math.sin(heading)
            y += ds * math.cos(heading)
            heading += turn * ds / radius / 2
            samples.append((x, y, heading))
    samples.append((x - 140 * math.sin(heading), y + 140 * math.cos(heading), heading))
    return samples


def jasper_centerline():
    pts = [(-80.76, 252.78), (-0.78, 254.34), (HARVEST_CL_JASPER_X, JASPER_CL_Y), (JASPER_C14_PC_X, JASPER_CL_Y)]
    cx, cy, r = JASPER_C14_PC_X, JASPER_CL_Y + 300.0, 300.0
    delta = 225.51 / r
    for i in range(1, 41):
        a = -math.pi / 2 + delta * i / 40
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    az = math.pi / 2 - delta
    ex, ey = pts[-1]
    pts.append((ex + 260 * math.sin(az), ey + 260 * math.cos(az)))
    return LineString(pts)


def parcel_a_polygon():
    """Open space / retention parcel east of the Future Phase (Phase 1 plat Parcel A)."""
    cx, cy, r = JASPER_C14_PC_X, JASPER_CL_Y + 300.0, 330.0
    se = (FP_EAST_X + 71.63, 0.0)
    az = math.radians(46.93)  # S48°28'06"W commercial line, rotated into the local frame
    dot = (se[0] + 377.90 * math.sin(az), se[1] + 377.90 * math.cos(az))
    side = (-math.cos(az), math.sin(az))  # N41°31'54"W (Lot 104 side line)
    corner = (dot[0] + 105.50 * side[0], dot[1] + 105.50 * side[1])
    a_end = math.atan2(corner[1] - cy, corner[0] - cx)
    arc_pts = [(cx + r * math.cos(a_end + (-math.pi / 2 - a_end) * i / 40),
                cy + r * math.sin(a_end + (-math.pi / 2 - a_end) * i / 40)) for i in range(41)]
    return Polygon([(FP_EAST_X, 0.0), se, dot] + arc_pts + [(FP_EAST_X, JASPER_S_ROW_Y)])


class Base:
    """Parcels, rights-of-way and context shared by every concept."""

    def __init__(self):
        self.harvest = harvest_centerline()
        self.harvest_cl = LineString([(x, y) for x, y, _ in self.harvest])
        self.jasper_cl = jasper_centerline()
        self.harvest_row = self.harvest_cl.buffer(HALF_ROW, cap_style=2)
        self.jasper_row = self.jasper_cl.buffer(HALF_ROW, cap_style=2)

        self.parcel = Polygon([(0, 0), (FP_EAST_X, 0), (FP_EAST_X, JASPER_CL_Y),
                               (HARVEST_CL_JASPER_X, JASPER_CL_Y), (-0.78, 254.34)])
        south = self.parcel.difference(self.jasper_row)
        self.jasper_half = self.parcel.intersection(self.jasper_row)
        self.harvest_in = south.intersection(self.harvest_row)
        rest = polys(south.difference(self.harvest_row))
        self.future_phase = max(rest, key=lambda p: p.centroid.x)
        west = min(rest, key=lambda p: p.centroid.x)
        self.parcel_c = west.intersection(box(-5, -5, PARCEL_C_WIDTH, 400))
        lots_area = west.difference(self.parcel_c)
        self.existing_lots = []
        for i, (name, y0, plat_area) in enumerate(LOTS_116_118):
            y1 = LOTS_116_118[i + 1][1] if i + 1 < len(LOTS_116_118) else 400.0
            band = Polygon([(PARCEL_C_WIDTH, y0), (400, y0 + 370 * LOT_LINE_SLOPE),
                            (400, y1 + 370 * LOT_LINE_SLOPE), (PARCEL_C_WIDTH, y1)]) if y0 > 0 else \
                Polygon([(PARCEL_C_WIDTH, -5), (400, -5), (400, y1 + 370 * LOT_LINE_SLOPE), (PARCEL_C_WIDTH, y1)])
            self.existing_lots.append({'name': name, 'poly': largest(lots_area.intersection(band)), 'platArea': plat_area})
        self.parcel_a = parcel_a_polygon()
        self.south_line = LineString([(-100, 0), (1300, 0)])

    def street_a_start(self, target_y):
        """Point on Harvest Lane where Street A must start so its east-west run lands on target_y."""
        best = None
        for x, y, heading in self.harvest:
            if not 30 <= y <= 215:
                continue
            az = math.pi / 2 - heading
            pts = [(x, y)]
            px, py = x + APPROACH_TANGENT * math.sin(az), y + APPROACH_TANGENT * math.cos(az)
            pts.append((px, py))
            while az < math.pi / 2 - 1e-9:
                d = min(1.0, (math.pi / 2 - az) * APPROACH_RADIUS)
                mid = az + d / APPROACH_RADIUS / 2
                px += d * math.sin(mid)
                py += d * math.cos(mid)
                az += d / APPROACH_RADIUS
                pts.append((px, py))
            err = abs(py - target_y)
            if best is None or err < best[0]:
                best = (err, pts, heading)
        return best[1], math.degrees(best[2])


# ---------------------------------------------------------------------------
# Street network and tiers for one Street A position
# ---------------------------------------------------------------------------
class Network:
    def __init__(self, base: Base, target_y: float):
        self.base = base
        approach, harvest_skew = base.street_a_start(target_y)
        self.harvest_skew_deg = harvest_skew
        self.y = approach[-1][1]
        ex = EMERALD_CL_X - ELBOW_RADIUS
        elbow = [(ex + ELBOW_RADIUS * math.cos(-math.pi / 2 + math.pi / 2 * i / 24),
                  self.y + ELBOW_RADIUS + ELBOW_RADIUS * math.sin(-math.pi / 2 + math.pi / 2 * i / 24)) for i in range(25)]
        self.cl_a = LineString(approach + elbow)
        self.cl_b = LineString([elbow[-1], (EMERALD_CL_X, JASPER_CL_Y)])
        self.cl = LineString(list(self.cl_a.coords) + [(EMERALD_CL_X, JASPER_CL_Y)])
        self.row_a = self.cl_a.buffer(HALF_ROW, cap_style=2, join_style=1)
        self.row_b = self.cl_b.buffer(HALF_ROW, cap_style=2)
        self.row = unary_union([self.row_a, self.row_b])
        self.side_rows = unary_union([base.harvest_row, self.row_b])

        remaining = polys(base.future_phase.difference(self.row))
        self.north = max((p for p in remaining if p.centroid.y > self.y), key=lambda p: p.area)
        wrap = max((p for p in remaining if p.centroid.y <= self.y + 40 and p is not self.north), key=lambda p: p.area)
        # South of Street A: straight frontage, then the outside of the turn (split radially into
        # corner lots), then open space east of Street B above the turn.
        self.wrap = wrap
        self.elbow_start_x = ex
        self.elbow_center = (ex, self.y + ELBOW_RADIUS)
        self.open_space = largest(wrap.difference(box(-50, -50, 1000, self.elbow_center[1])))
        self.south_split(0)

        a_len = LineString(approach).length + (ex - approach[-1][0]) + ELBOW_RADIUS * math.pi / 4
        self.street_a_len = a_len
        self.street_b_len = self.cl.length - a_len
        self.block_len = EMERALD_CL_X - approach[0][0]

    def south_split(self, corner_reach):
        """Hand `corner_reach` feet of straight Street A frontage to the corner lots at the turn."""
        x = self.elbow_start_x - corner_reach
        self.south = largest(self.wrap.intersection(box(-50, -50, x, 400)))
        self.elbow = largest(self.wrap.intersection(box(x, -50, 1000, self.elbow_center[1])))
        return self.south, self.elbow

    @property
    def tier_depths(self):
        return JASPER_S_ROW_Y - (self.y + HALF_ROW), self.y - HALF_ROW


# ---------------------------------------------------------------------------
# Lot evaluation
# ---------------------------------------------------------------------------
TIER_ANGLES = {'north': 0.0, 'south': 180.0, 'harvest-west': -90.0}


def toward_street_angle(dx, dy):
    """Rotation (degrees) that turns the lot-to-street direction (dx, dy) to face -Y."""
    return -90.0 - math.degrees(math.atan2(dy, dx))


def to_frame(geom, angle):
    return affinity.rotate(geom, angle, origin=(0, 0)) if angle else geom


def from_frame(geom, angle):
    return affinity.rotate(geom, -angle, origin=(0, 0)) if angle else geom


def envelope_for(lot, front_rows, side_rows):
    zones = [lot.exterior.buffer(R4['side'])]
    if not front_rows.is_empty:
        zones.append(front_rows.buffer(R4['front']))
    if not side_rows.is_empty:
        zones.append(side_rows.buffer(R4['corner_side']))
    return largest(lot.difference(unary_union(zones)))


def fit_rect(env, width, depth):
    """Lowest position (front = -Y in the frame) where a width x depth box fits inside env."""
    minx, miny, maxx, maxy = env.bounds
    y0 = miny
    while y0 + depth <= maxy + 1e-6:
        left, right = minx - 1, maxx + 1
        for k in range(9):
            y = y0 + depth * k / 8
            seg = env.intersection(LineString([(minx - 5, y), (maxx + 5, y)]))
            pieces = [g for g in getattr(seg, 'geoms', [seg]) if not g.is_empty and g.length > 0]
            if not pieces:
                left, right = 1, 0
                break
            span = max(pieces, key=lambda g: g.length).bounds
            left, right = max(left, span[0]), min(right, span[2])
        if right - left >= width - 1e-6:
            return left, right, y0
        y0 += 1.0
    return None


def lot_width_at_setback(lot, front_rows):
    """Length of the front-setback line (25' from the street, following curves) inside the lot."""
    return front_rows.buffer(R4['front']).boundary.intersection(lot).length


def analyze_lot(lot, spec, tier, front_rows, side_rows, design=None, rear_on_collector=False, flip=False, angle=None):
    """Check one building lot against R-4 and townhome rules and place its building.

    The lot is rotated so its street side faces -Y; `angle` overrides the tier default for lots
    on a curve. Lots that fail area or frontage are returned without a building.
    """
    angle = TIER_ANGLES[tier] if angle is None else angle
    units = spec['units']
    is_th = spec['type'] == 'TH'
    min_area = R4['mf_base_area'] + R4['mf_per_added_unit'] * (units - 1) if is_th else R4['sf_min_area']
    frontage = lot.boundary.intersection(front_rows.buffer(0.05)).length
    side_frontage = lot.boundary.intersection(side_rows.buffer(0.05)).length if not side_rows.is_empty else 0.0
    corner = side_frontage > 5
    min_width = R4['corner_min_width'] if corner else R4['min_width']
    width_at_setback = lot_width_at_setback(lot, front_rows)
    result = {
        'type': spec['type'], 'units': units, 'areaSqFt': round(lot.area), 'minAreaSqFt': min_area,
        'frontageFt': round(frontage, 1), 'widthAtSetbackFt': round(width_at_setback, 1),
        'minFrontageFt': min_width, 'corner': corner, 'rearOnCollector': rear_on_collector, 'polygon': lot,
        'frameAngle': round(angle, 1),
    }
    checks = {
        'area': lot.area >= min_area - 0.5,
        'frontage': frontage >= min_width - 0.05 and width_at_setback >= min_width - 0.05,
    }
    if not (checks['area'] and checks['frontage']):
        checks['fits'] = False
        result.update(checks=checks, ok=False, design=None, envelope=Polygon(), footprints=[], driveways=[], walks=[],
                      unitLots=[], livableSqFt=0)
        return result

    env = envelope_for(lot, front_rows, side_rows)
    lot_f, env_f = to_frame(lot, angle), to_frame(env, angle)
    side_street_side = None
    if corner:
        contact = to_frame(lot.boundary.intersection(side_rows.buffer(0.05)), angle)
        side_street_side = 'left' if contact.centroid.x < lot_f.centroid.x else 'right'

    if is_th:
        chosen = TH_UNIT
        fp_w, fp_d = TH_UNIT['width'] * units, TH_UNIT['depth']
        fit = fit_rect(env_f, fp_w, fp_d)
    else:
        order = sorted(SF_DESIGNS, key=lambda d: d['id'] != design)
        chosen, fit = order[0], None
        for cand in order:
            fit = fit_rect(env_f, cand['width'], cand['depth'])
            if fit:
                chosen = cand
                break
        fp_w, fp_d = chosen['width'], chosen['depth']
    result.update(design=chosen['id'], envelope=env)
    checks['fits'] = fit is not None
    unit_records, footprints, drives, walks = [], [], [], []
    if fit:
        left, right, y0 = fit
        if is_th or side_street_side is None:
            x0 = (left + right - fp_w) / 2
        else:
            x0 = right - fp_w if side_street_side == 'left' else left
        lot_miny = lot_f.bounds[1]
        if is_th:
            party_lines = [x0 + TH_UNIT['width'] * i for i in range(1, units)]
            edges = [lot_f.bounds[0] - 1] + party_lines + [lot_f.bounds[2] + 1]
            for i in range(units):
                ux = x0 + TH_UNIT['width'] * i
                fp = box(ux, y0, ux + TH_UNIT['width'], y0 + fp_d)
                drive_left = i % 2 == 0
                dx = ux if drive_left else ux + TOWNHOME_WALK
                wx = ux + DRIVEWAY_W if drive_left else ux
                drive = box(dx, lot_miny - 2, dx + DRIVEWAY_W, y0).intersection(lot_f)
                walk = box(wx, lot_miny - 2, wx + TOWNHOME_WALK, y0).intersection(lot_f)
                unit_lot = lot_f.intersection(box(edges[i], lot_miny - 5, edges[i + 1], lot_f.bounds[3] + 5))
                open_space = unit_lot.area - fp.area - drive.area - walk.area
                depth = y0 - lot_f.intersection(LineString([(dx + 13.5, lot_miny - 5), (dx + 13.5, y0)])).bounds[1]
                stalls = int(DRIVEWAY_W // STALL_W) if depth >= STALL_D else 0
                unit_records.append({
                    'id': 'ABCD'[i], 'polygon': from_frame(unit_lot, angle), 'areaSqFt': round(unit_lot.area),
                    'openSpaceSqFt': round(open_space), 'stalls': stalls,
                    'frontsRow': unit_lot.intersection(to_frame(front_rows, angle).buffer(0.1)).area > 1,
                    'footprint': from_frame(fp, angle), 'driveway': from_frame(drive, angle), 'walk': from_frame(walk, angle),
                })
                footprints.append(fp)
                drives.append(drive)
                walks.append(walk)
            unit_records.sort(key=lambda u: u['footprint'].centroid.x)
            for k, rec in enumerate(unit_records):
                rec['id'] = 'ABCD'[k]
            checks['openSpace'] = all(u['openSpaceSqFt'] >= TOWNHOME_OPEN_SPACE for u in unit_records)
            checks['parking'] = all(u['stalls'] >= STALLS_PER_UNIT for u in unit_records)
            checks['unitFrontage'] = all(u['frontsRow'] for u in unit_records)
        else:
            fp = box(x0, y0, x0 + fp_w, y0 + fp_d)
            garage_right = (side_street_side == 'left') if side_street_side else not flip
            dx = x0 + fp_w - DRIVEWAY_W if garage_right else x0
            drive = box(dx, lot_miny - 2, dx + DRIVEWAY_W, y0).intersection(lot_f)
            depth = y0 - lot_f.intersection(LineString([(dx + 13.5, lot_miny - 5), (dx + 13.5, y0)])).bounds[1]
            stalls = int(DRIVEWAY_W // STALL_W) if depth >= STALL_D else 0
            footprints.append(fp)
            drives.append(drive)
            checks['parking'] = stalls >= STALLS_PER_UNIT
            result['stalls'] = stalls
            if side_street_side:
                side_edge = lot_f.bounds[0] if side_street_side == 'left' else lot_f.bounds[2]
                result['drivewayToSideStreetFt'] = round(min(abs(dx - side_edge), abs(dx + DRIVEWAY_W - side_edge)), 1)
        result['setbackOk'] = all(f.within(env_f.buffer(0.05)) for f in footprints)
        checks['setbacks'] = result['setbackOk']
    result['footprints'] = [from_frame(f, angle) for f in footprints]
    result['driveways'] = [from_frame(d, angle) for d in drives]
    result['walks'] = [from_frame(w, angle) for w in walks]
    result['unitLots'] = unit_records
    result['checks'] = checks
    result['ok'] = all(checks.values())
    result['livableSqFt'] = chosen['livableSqFt'] * (units if is_th else 1)
    return result


# ---------------------------------------------------------------------------
# Tier subdivision
# ---------------------------------------------------------------------------
def cumulative_area_fn(tier_poly):
    minx, miny, maxx, maxy = tier_poly.bounds
    xs, areas = [], []
    x = minx
    while x <= maxx + 0.5:
        xs.append(x)
        areas.append(tier_poly.intersection(box(minx - 1, miny - 1, x, maxy + 1)).area)
        x += 0.5

    def x_at(target):
        for i in range(1, len(xs)):
            if areas[i] >= target:
                a0, a1 = areas[i - 1], areas[i]
                return xs[i - 1] + (xs[i] - xs[i - 1]) * ((target - a0) / (a1 - a0) if a1 > a0 else 0)
        return xs[-1]
    return x_at, areas[-1]


def candidate_sequences(product, total_area):
    if product == 'SF':
        top = int(total_area // R4['sf_min_area'])
        return [[{'type': 'SF', 'units': 1}] * n for n in range(top, 0, -1)]
    seqs = []
    for count in range(1, 6):
        for sizes in iter_product((4, 3, 2), repeat=count):
            need = sum(R4['mf_base_area'] + R4['mf_per_added_unit'] * (s - 1) for s in sizes)
            if need <= total_area:
                seqs.append([{'type': 'TH', 'units': s} for s in sizes])
    seqs.sort(key=lambda s: (-sum(u['units'] for u in s), len(s), -min(u['units'] for u in s)))
    return seqs


def subdivide(tier_poly, product, tier, front_rows, side_rows, rear_on_collector):
    x_at, total = cumulative_area_fn(tier_poly)
    minx, miny, maxx, maxy = tier_poly.bounds
    for seq in candidate_sequences(product, total):
        need = [R4['mf_base_area'] + R4['mf_per_added_unit'] * (s['units'] - 1) if s['type'] == 'TH'
                else R4['sf_min_area'] for s in seq]
        weights = [1.0] * len(seq)
        for _ in range(10):
            scaled = [n * w for n, w in zip(need, weights)]
            cuts, acc = [minx - 1], 0.0
            for share in scaled[:-1]:
                acc += total * share / sum(scaled)
                cuts.append(x_at(acc))
            cuts.append(maxx + 1)
            lots = []
            for i, spec in enumerate(seq):
                piece = largest(tier_poly.intersection(box(cuts[i], miny - 1, cuts[i + 1], maxy + 1)))
                lots.append(analyze_lot(piece, spec, tier, front_rows, side_rows,
                                        design=SF_DESIGNS[i % len(SF_DESIGNS)]['id'],
                                        rear_on_collector=rear_on_collector, flip=i % 2 == 1))
            if all(l['ok'] for l in lots):
                return lots
            for i, l in enumerate(lots):
                if not l['ok']:
                    weights[i] *= 1.04
        # try next sequence
    return []


def curved_lot(piece, net, design):
    """Analyze a lot fronting the turn, trying house orientations within 40° of facing the curve."""
    cx, cy = net.elbow_center
    contact = piece.boundary.intersection(net.row_a.buffer(0.05))
    if contact.is_empty:
        return None
    mid = contact.centroid
    facing = toward_street_angle(cx - mid.x, cy - mid.y)
    rec = None
    for offset in (0, 10, -10, 20, -20, 30, -30, 40, -40):
        rec = analyze_lot(piece, {'type': 'SF', 'units': 1}, 'south', net.row_a, Polygon(), design=design, angle=facing + offset)
        if rec['ok']:
            break
    return rec


def elbow_lots(net):
    """Single-family lots on the outside of the Street A/B turn, split on a radial line (DCC 16.24.120.D)."""
    cx, cy = net.elbow_center
    best = None
    for deg in range(-30, -80, -5):
        ray = LineString([(cx, cy), (cx + 800 * math.cos(math.radians(deg)), cy + 800 * math.sin(math.radians(deg)))])
        halves = sorted(polys(split(net.elbow, ray)), key=lambda p: p.centroid.y)
        if len(halves) != 2 or min(h.area for h in halves) < R4['sf_min_area']:
            continue
        lots = [curved_lot(h, net, SF_DESIGNS[(i + 1) % 3]['id']) for i, h in enumerate(halves)]
        if all(l and l['ok'] for l in lots):
            imbalance = abs(halves[0].area - halves[1].area)
            if best is None or imbalance < best[0]:
                best = (imbalance, lots)
    if best:
        return best[1]
    single = curved_lot(net.elbow, net, SF_DESIGNS[0]['id'])
    return [single] if single and single['ok'] else []


# ---------------------------------------------------------------------------
# Concept assembly
# ---------------------------------------------------------------------------
def existing_lot_records(base):
    """Phase 1 Lots 116-118 front Harvest Lane; Lot 116 is a corner lot on Jasper Drive."""
    records = []
    for i, item in enumerate(base.existing_lots):
        lot = item['poly']
        side = base.jasper_row if item['name'] == '116' else Polygon()
        rec = analyze_lot(lot, {'type': 'SF', 'units': 1}, 'harvest-west', base.harvest_row, side,
                          design=SF_DESIGNS[i % 3]['id'], flip=i % 2 == 1)
        rec['id'] = item['name']
        rec['platAreaSqFt'] = item['platArea']
        rec['existing'] = True
        rec['tier'] = 'harvest-west'
        records.append(rec)
    return records


def build_concept(base, cfg):
    best = None
    for target in range(104, 125, 4):
        net = Network(base, target)
        north_depth, south_depth = net.tier_depths
        if north_depth < 70 or south_depth < 70:
            continue
        north = subdivide(net.north, cfg['north'], 'north', net.row_a, net.side_rows, True)
        if not north:
            continue
        for reach in (0, 25, 50):
            south_poly, _ = net.south_split(reach)
            south = subdivide(south_poly, cfg['south'], 'south', net.row_a, Polygon(), False)
            if not south:
                continue
            corner = elbow_lots(net)
            lots = north + south + corner
            units = sum(l['units'] for l in lots)
            slack = min(l['areaSqFt'] - l['minAreaSqFt'] for l in lots)
            score = (units, len(corner), round(slack / 250), -abs(north_depth - south_depth))
            if best is None or score > best[0]:
                best = (score, target, reach, north, south, corner)
    _, target, reach, north, south, corner = best
    net = Network(base, target)
    net.south_split(reach)
    if not corner:
        net.open_space = unary_union([net.open_space, net.elbow])
    south = south + corner
    lots = []
    for tier_name, tier_lots, start in (('north', north, 201), ('south', south, 201 + len(north))):
        for i, lot in enumerate(tier_lots):
            lot['id'] = str(start + i)
            lot['tier'] = tier_name
            lot['existing'] = False
            lots.append(lot)
    return net, lots


def street_surfaces(base, net):
    cls = [net.cl, base.harvest_cl, base.jasper_cl]
    asphalt = unary_union([c.buffer(PAVEMENT_HALF, cap_style=2) for c in cls])
    asphalt = asphalt.buffer(CURB_RETURN_R).buffer(-CURB_RETURN_R)
    curb = unary_union([c.buffer(PAVEMENT_HALF + CURB_GUTTER, cap_style=2) for c in cls])
    curb = curb.buffer(CURB_RETURN_R + CURB_GUTTER).buffer(-(CURB_RETURN_R + CURB_GUTTER))
    walk_outer = unary_union([c.buffer(PAVEMENT_HALF + CURB_GUTTER + SIDEWALK, cap_style=2) for c in cls])
    walk_outer = walk_outer.buffer(CURB_RETURN_R + 7.5).buffer(-(CURB_RETURN_R + 7.5))
    row = unary_union([net.row, base.harvest_row, base.jasper_row])
    return {
        'row': row,
        'asphalt': asphalt.intersection(row.buffer(0.1)),
        'curb': curb.difference(asphalt).intersection(row.buffer(0.1)),
        'sidewalk': walk_outer.difference(curb).intersection(row.buffer(0.1)),
    }


def quantities(base, net, lots, surfaces):
    """Takeoff for the new project's streets and utilities (Jasper Drive excluded)."""
    new_row_in = net.row.intersection(base.future_phase.buffer(0.1))
    harvest_cl_in = base.harvest_cl.intersection(box(-50, 0, 400, JASPER_S_ROW_Y))
    streets_in = unary_union([new_row_in, base.harvest_in])
    asphalt = surfaces['asphalt'].intersection(streets_in)
    curb = surfaces['curb'].intersection(streets_in)
    walk = surfaces['sidewalk'].intersection(streets_in)
    new_len = net.cl.intersection(base.future_phase.buffer(HALF_ROW)).length
    new_len = min(new_len, net.cl.length - HALF_ROW)
    harvest_len = harvest_cl_in.length
    units = sum(l['units'] for l in lots)
    utility_len = new_len + harvest_len
    q = {
        'newStreetCenterlineFt': round(new_len, 1),
        'harvestLaneCenterlineFt': round(harvest_len, 1),
        'newStreetRowSqFt': round(new_row_in.area),
        'harvestLaneRowSqFt': round(base.harvest_in.area),
        'asphaltSqFt': round(asphalt.area),
        'curbGutterLf': round(curb.area / CURB_GUTTER, 1),
        'sidewalkSqFt': round(walk.area),
        'waterMainLf': round(utility_len, 1),
        'sewerMainLf': round(utility_len, 1),
        'stormDrainLf': round(new_len + 60, 1),
        'dryUtilityTrenchLf': round(utility_len, 1),
        'sewerManholes': 3 + math.ceil(utility_len / 400),
        'stormManholes': 2 + math.ceil(new_len / 400),
        'catchBasins': 2 * math.ceil(new_len / 300) + 2,
        'fireHydrants': max(2, math.ceil(utility_len / 400)),
        'streetLights': 3 + math.ceil(new_len / 250),
        'waterLaterals': units,
        'sewerLaterals': units,
        'ditchPipeLf': round(LOTS_116_118[-1][1] + 75.28, 1),
        'notes': [
            'Harvest Lane south of Jasper (dedicated on the Phase 1 plat) and Lots 116-118 are carried in the South Parcel '
            'proforma and removed from the main Delta Crossings proforma.',
            "Jasper Drive (incl. its south curb, gutter and walk) is treated as built by Phase 1.",
            'ditchPipeLf is only needed if the double line shown in Parcel C on the preliminary plat is a live ditch.',
        ],
    }
    return q


def stormwater(base, net, lots, surfaces):
    area = base.parcel.difference(base.jasper_row)
    roofs = unary_union([f for l in lots for f in l['footprints']])
    paved_lots = unary_union([d for l in lots for d in l['driveways'] + l['walks']])
    street_hard = unary_union([surfaces['asphalt'], surfaces['curb'], surfaces['sidewalk']]).intersection(area)
    impervious = unary_union([roofs, paved_lots, street_hard]).intersection(area)
    pervious = area.area - impervious.area
    c_weighted = (RUNOFF_C_IMPERVIOUS * impervious.area + RUNOFF_C_PERVIOUS * pervious) / area.area
    volume = RAIN_10YR_24HR_IN / 12 * (RUNOFF_C_IMPERVIOUS * impervious.area + RUNOFF_C_PERVIOUS * pervious)
    basin_floor = 0.7 * (PARCEL_A_PLAT_SQFT + net.open_space.area)
    return {
        'designStorm': '24-hour, 10-year (DCC 16.28.030.I)',
        'rainfallIn': RAIN_10YR_24HR_IN,
        'rainfallSource': 'NOAA Atlas 14 PFDS, 39.353 N / 112.565 W',
        'contributingSqFt': round(area.area),
        'imperviousSqFt': round(impervious.area),
        'imperviousPct': round(100 * impervious.area / area.area, 1),
        'runoffCoefficient': round(c_weighted, 3),
        'requiredVolumeCf': round(volume),
        'requiredVolumeAcFt': round(volume / 43560, 3),
        'basinFloorSqFt': round(basin_floor),
        'addedDepthIn': round(12 * volume / basin_floor, 1),
        'note': 'Parcel A already receives the Phase 1 30" storm drain. This volume is the extra storage for the '
                'south parcel, spread over Parcel A plus the new open space (70% of area as basin floor).',
    }


def compliance(base, net, lots, existing, storm):
    new = lots
    th = [l for l in new if l['type'] == 'TH']
    th_units = [u for l in th for u in l['unitLots']]
    status = {}

    def put(key, ok, detail, level=None):
        status[key] = {'status': level or ('pass' if ok else 'fail'), 'detail': detail}

    put('zone', True, 'R-4 per Ord. 23-300 (effective 2023-04-19)')
    put('use', all(l['units'] <= R4['max_units_per_building'] for l in new),
        'Largest building: %d units' % max(l['units'] for l in new))
    sf = [l for l in new + existing if l['type'] == 'SF']
    put('sf_area', all(l['checks']['area'] for l in sf), 'Smallest SF lot %s SF' % f"{min(l['areaSqFt'] for l in sf):,}")
    if th:
        put('mf_area', all(l['checks']['area'] for l in th),
            'Tightest building lot %s SF over minimum' % f"{min(l['areaSqFt'] - l['minAreaSqFt'] for l in th):,}")
        put('th_parking', all(u['stalls'] >= STALLS_PER_UNIT for u in th_units), '27\' driveway (3 stalls) on every unit lot')
        put('th_open', all(u['openSpaceSqFt'] >= TOWNHOME_OPEN_SPACE for u in th_units),
            'Smallest unit open space %s SF' % f"{min(u['openSpaceSqFt'] for u in th_units):,}")
        put('th_front', all(u['frontsRow'] for u in th_units), "Each unit lot touches the ROW; own 4' walk")
    else:
        for key in ('mf_area', 'th_parking', 'th_open', 'th_front'):
            put(key, True, 'No townhomes in this concept', 'n/a')
    put('width', all(l['checks']['frontage'] for l in new),
        "Narrowest new frontage %.1f'" % min(l['frontageFt'] for l in new))
    put('setbacks', all(l['checks']['setbacks'] for l in new + existing), 'Every footprint inside its setback envelope')
    put('height', True, "SF 1-2 story; townhomes 2 story (~28')")
    put('parking', all(l['checks']['parking'] for l in new + existing), '3 driveway stalls per unit; garages not counted')
    put('one_structure', True, 'One building per lot; townhome units on unit lots')
    put('street_row', True, "Street A/B: 60' ROW, ST-02 section")
    put('cul', True, 'Street A/B loops Harvest Lane to Jasper Drive')
    put('block', BLOCK_MIN <= net.block_len <= BLOCK_MAX, "Harvest to Street B: %.0f'" % net.block_len)
    put('lot_access', True, 'All lots front Harvest Lane or Street A')
    put('collector', True, "North-tier lots back onto Jasper with a 10' rear buffer; needs LUA approval as double-frontage lots")
    put('intersection', True, "Street A leaves Harvest at 90°; Street B lines up with Emerald Way (4-way)")
    put('storm', True, '%s CF (%.2f ac-ft) extra storage; about %.1f in. over the basin' % (
        f"{storm['requiredVolumeCf']:,}", storm['requiredVolumeAcFt'], storm['addedDepthIn']), 'check')
    put('ditch', True, 'Pipe the Parcel C ditch if it is live (about %d LF)' % round(LOTS_116_118[-1][1] + 75.28), 'check')
    put('pue', True, "10' front PUE inside the 25' setback; 7.5' rear/side easements as needed")
    out = []
    for key, label, cite, req in RULES:
        rec = status[key]
        out.append({'id': key, 'label': label, 'citation': cite, 'requirement': req, **rec})
    return out


# ---------------------------------------------------------------------------
# Drawing
# ---------------------------------------------------------------------------
FONT_DIR = os.path.join(os.environ.get('WINDIR', r'C:\Windows'), 'Fonts')
COLORS = {
    'bg': (247, 245, 239), 'context': (233, 230, 222), 'context_line': (186, 182, 172),
    'row': (226, 223, 214), 'asphalt': (92, 96, 103), 'curb': (190, 186, 178), 'sidewalk': (214, 210, 201),
    'sf': (238, 226, 196), 'th': (214, 229, 204), 'existing': (232, 222, 212),
    'sf_bldg': (139, 104, 70), 'th_bldg': (92, 112, 82), 'drive': (200, 196, 188),
    'open': (166, 201, 140), 'retention': (126, 176, 120), 'canal': (184, 214, 170),
    'ink': (43, 43, 43), 'muted': (110, 108, 102), 'lot_line': (70, 64, 56), 'envelope': (160, 70, 50),
    'pass': (46, 140, 70), 'fail': (196, 52, 40), 'check': (214, 150, 30), 'na': (150, 150, 150),
    'panel': (255, 255, 255), 'accent': (40, 92, 60),
}


class Sheet:
    """Records drawing primitives once, then writes matching SVG and PNG files."""

    def __init__(self, width, height):
        self.w, self.h = width, height
        self.items = []

    def poly(self, geom, fill=None, stroke=None, width=1.0, dash=None, alpha=255):
        for p in polys(geom):
            rings = [list(p.exterior.coords)] + [list(r.coords) for r in p.interiors]
            self.items.append(('poly', rings, fill, stroke, width, dash, alpha))

    def line(self, pts, stroke, width=1.0, dash=None):
        self.items.append(('line', list(pts), stroke, width, dash))

    def text(self, x, y, s, size=14, color=COLORS['ink'], anchor='middle', bold=False, rotate=0.0):
        self.items.append(('text', x, y, s, size, color, anchor, bold, rotate))

    # -- SVG -------------------------------------------------------------
    def to_svg(self):
        def rgb(c):
            return 'rgb(%d,%d,%d)' % c[:3]
        out = ['<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">' % (self.w, self.h, self.w, self.h),
               '<rect width="100%%" height="100%%" fill="%s"/>' % rgb(COLORS['bg'])]
        for it in self.items:
            if it[0] == 'poly':
                _, rings, fill, stroke, width, dash, alpha = it
                d = ' '.join('M' + ' L'.join('%.1f %.1f' % pt for pt in r) + ' Z' for r in rings)
                attrs = ['d="%s"' % d, 'fill-rule="evenodd"', 'fill="%s"' % (rgb(fill) if fill else 'none')]
                if fill and alpha < 255:
                    attrs.append('fill-opacity="%.2f"' % (alpha / 255))
                if stroke:
                    attrs += ['stroke="%s"' % rgb(stroke), 'stroke-width="%.2f"' % width]
                    if dash:
                        attrs.append('stroke-dasharray="%s"' % ','.join(str(v) for v in dash))
                out.append('<path %s/>' % ' '.join(attrs))
            elif it[0] == 'line':
                _, pts, stroke, width, dash = it
                attrs = ['points="%s"' % ' '.join('%.1f,%.1f' % p for p in pts), 'fill="none"',
                         'stroke="%s"' % rgb(stroke), 'stroke-width="%.2f"' % width]
                if dash:
                    attrs.append('stroke-dasharray="%s"' % ','.join(str(v) for v in dash))
                out.append('<polyline %s/>' % ' '.join(attrs))
            else:
                _, x, y, s, size, color, anchor, bold, rotate = it
                anchor_svg = {'middle': 'middle', 'left': 'start', 'right': 'end'}[anchor]
                lines = str(s).split('\n')
                tf = ' transform="rotate(%.1f %.1f %.1f)"' % (rotate, x, y) if rotate else ''
                y0 = y - (len(lines) - 1) * size * 0.6 + size * 0.35
                spans = ''.join('<tspan x="%.1f" y="%.1f">%s</tspan>' % (
                    x, y0 + i * size * 1.2, ln.replace('&', '&amp;').replace('<', '&lt;')) for i, ln in enumerate(lines))
                out.append('<text font-family="Arial, Helvetica, sans-serif" font-size="%.1f" fill="%s" text-anchor="%s"%s%s>%s</text>' % (
                    size, rgb(color), anchor_svg, ' font-weight="bold"' if bold else '', tf, spans))
        out.append('</svg>')
        return '\n'.join(out)

    # -- PNG -------------------------------------------------------------
    def to_png(self, path, ss=2):
        img = Image.new('RGB', (self.w * ss, self.h * ss), COLORS['bg'])
        fonts = {}

        def font(size, bold):
            key = (round(size * ss), bold)
            if key not in fonts:
                name = 'arialbd.ttf' if bold else 'arial.ttf'
                try:
                    fonts[key] = ImageFont.truetype(os.path.join(FONT_DIR, name), key[0])
                except OSError:
                    fonts[key] = ImageFont.load_default()
            return fonts[key]

        def dashed(draw, pts, color, width, dash):
            on, off = dash[0] * ss, dash[1] * ss
            for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
                seg = math.hypot(x1 - x0, y1 - y0)
                if seg == 0:
                    continue
                t = 0.0
                while t < seg:
                    t1 = min(seg, t + on)
                    draw.line([(x0 + (x1 - x0) * t / seg, y0 + (y1 - y0) * t / seg),
                               (x0 + (x1 - x0) * t1 / seg, y0 + (y1 - y0) * t1 / seg)], fill=color, width=width)
                    t = t1 + off

        draw = ImageDraw.Draw(img)
        for it in self.items:
            if it[0] == 'poly':
                _, rings, fill, stroke, width, dash, alpha = it
                scaled = [[(x * ss, y * ss) for x, y in r] for r in rings]
                if fill:
                    mask = Image.new('L', img.size, 0)
                    md = ImageDraw.Draw(mask)
                    md.polygon(scaled[0], fill=alpha)
                    for hole in scaled[1:]:
                        md.polygon(hole, fill=0)
                    img.paste(Image.new('RGB', img.size, fill[:3]), (0, 0), mask)
                    draw = ImageDraw.Draw(img)
                if stroke:
                    w = max(1, round(width * ss))
                    for r in scaled:
                        if dash:
                            dashed(draw, r, stroke[:3], w, dash)
                        else:
                            draw.line(r, fill=stroke[:3], width=w, joint='curve')
            elif it[0] == 'line':
                _, pts, stroke, width, dash = it
                w = max(1, round(width * ss))
                scaled = [(x * ss, y * ss) for x, y in pts]
                if dash:
                    dashed(draw, scaled, stroke[:3], w, dash)
                else:
                    draw.line(scaled, fill=stroke[:3], width=w, joint='curve')
            else:
                _, x, y, s, size, color, anchor, bold, rotate = it
                f = font(size, bold)
                lines = str(s).split('\n')
                lh = size * 1.2 * ss
                widths = [draw.textlength(ln, font=f) for ln in lines]
                tw, th = max(widths) + 4, lh * len(lines) + 4
                layer = Image.new('RGBA', (int(tw) + 2, int(th) + 2), (0, 0, 0, 0))
                ld = ImageDraw.Draw(layer)
                for i, ln in enumerate(lines):
                    lx = {'middle': (tw - widths[i]) / 2, 'left': 2, 'right': tw - widths[i] - 2}[anchor]
                    ld.text((lx, 2 + i * lh), ln, font=f, fill=color[:3] + (255,))
                if rotate:
                    layer = layer.rotate(-rotate, expand=True, resample=Image.BICUBIC)
                px, py = x * ss, y * ss
                ox = {'middle': layer.width / 2, 'left': 0, 'right': layer.width}[anchor] if not rotate else layer.width / 2
                img.paste(layer, (int(px - ox), int(py - layer.height / 2)), layer)
                draw = ImageDraw.Draw(img)
        img = img.resize((self.w, self.h), Image.LANCZOS)
        img.save(path, optimize=True)


VIEW_BOUNDS = (-70.0, -100.0, 1215.0, 385.0)
PHASE1_CONTEXT_LOTS = (  # Phase 1 plat lots on the north side of Jasper Drive: x0, x1, lot
    (30, 142.8, '115'), (202.0, 310.0, '114'), (310.0, 418.0, '113'),
    (478.0, 586.0, '112'), (586.0, 694.0, '111'), (754.0, 842.8, '110'),
)


def context_geometry(base):
    """Neighboring land drawn around the parcel (not part of the project)."""
    x_min, y_min, x_max, y_max = VIEW_BOUNDS
    base_rows = unary_union([base.harvest_row, base.jasper_row])
    north_y = JASPER_CL_Y + HALF_ROW
    return {
        'deltaEstates': box(x_min, y_min, x_max, 0).difference(base_rows),
        'phase1Band': box(x_min, north_y, x_max, y_max).difference(base_rows),
        'phase1Lots': [(name, box(x0, north_y, x1, north_y + 76).difference(base_rows)) for x0, x1, name in PHASE1_CONTEXT_LOTS],
        'commercial': Polygon([(FP_EAST_X + 71.63, 0), (x_max, 0), (x_max, 240), (1160, 258)])
        .difference(base.parcel_a).difference(base_rows).intersection(box(*VIEW_BOUNDS)),
    }


def render_sheet(base, net, cfg, lots, existing, surfaces, q, storm, checks, summary, path_stem):
    scale = 2.15
    x_min, y_min, x_max, y_max = VIEW_BOUNDS
    title_h = 92
    plan_h = (y_max - y_min) * scale
    panel_top = title_h + plan_h + 18
    width = 2900
    height = int(panel_top + 760)
    sh = Sheet(width, height)
    ox = (width - (x_max - x_min) * scale) / 2

    def P(geom):
        return affinity.affine_transform(geom, [scale, 0, 0, -scale, ox - x_min * scale, title_h + y_max * scale])

    def pt(x, y):
        return ox + (x - x_min) * scale, title_h + (y_max - y) * scale

    view = box(x_min, y_min, x_max, y_max)

    # Context: Delta Estates, Phase 1 lots north of Jasper, commercial future phase
    ctx = context_geometry(base)
    sh.poly(P(ctx['deltaEstates']), fill=COLORS['context'])
    for x0 in (-70, 40, 201.07, 261.07, 340, 430, 520, 610, 700, 790, 880, 970, 1060, 1150):
        sh.line([pt(x0, 0), pt(x0, -70)], COLORS['context_line'], 0.8, dash=(6, 5))
    sh.text(*pt(560, -55), 'DELTA ESTATES  (existing single-family)', size=15, color=COLORS['muted'], bold=True)
    sh.text(*pt(231.07, -80), 'DAYS AVE.', size=13, color=COLORS['muted'], bold=True, rotate=-90)
    sh.poly(P(ctx['phase1Band'].intersection(view)), fill=COLORS['context'])
    for name, lot in ctx['phase1Lots']:
        sh.poly(P(lot), fill=(241, 238, 230), stroke=COLORS['context_line'], width=1)
        c = lot.centroid
        sh.text(*pt(c.x, c.y), name, size=13, color=COLORS['muted'])
    sh.text(*pt(330, JASPER_CL_Y + 105), 'PHASE 1 LOTS (Delta Crossings Phase 1 plat)', size=13, color=COLORS['muted'])
    sh.poly(P(ctx['commercial']), fill=COLORS['context'])
    sh.text(*pt(1080, 70), 'PHASE 2 / COMMERCIAL\n(not part of this project)', size=13, color=COLORS['muted'], bold=True)

    # Streets
    sh.poly(P(surfaces['row'].intersection(view)), fill=COLORS['row'])
    sh.poly(P(surfaces['sidewalk'].intersection(view)), fill=COLORS['sidewalk'])
    sh.poly(P(surfaces['curb'].intersection(view)), fill=COLORS['curb'])
    sh.poly(P(surfaces['asphalt'].intersection(view)), fill=COLORS['asphalt'])
    for cl in (net.cl, base.harvest_cl.intersection(view), base.jasper_cl.intersection(view)):
        for part in getattr(cl, 'geoms', [cl]):
            sh.line([pt(*c) for c in part.coords], (236, 214, 120), 1.2, dash=(14, 8))

    # Open space
    sh.poly(P(base.parcel_a), fill=COLORS['retention'], stroke=COLORS['accent'], width=1.6)
    hatch = [LineString([(FP_EAST_X - 50 + k * 14, -10), (FP_EAST_X + 300 + k * 14, 350)]) for k in range(-40, 60)]
    for hl in hatch:
        seg = hl.intersection(base.parcel_a)
        for s in getattr(seg, 'geoms', [seg]):
            if not s.is_empty and s.length > 1:
                sh.line([pt(*c) for c in s.coords], (104, 156, 98), 0.8)
    sh.poly(P(net.open_space), fill=COLORS['open'], stroke=COLORS['accent'], width=1.2)
    sh.poly(P(base.parcel_c), fill=COLORS['canal'], stroke=COLORS['accent'], width=1.2)
    pa = base.parcel_a.centroid
    sh.text(*pt(pa.x - 25, pa.y - 20), 'PARCEL A\nOPEN SPACE / RETENTION\n(Phase 1 basin, keep)\n%s SF per plat' % f"{PARCEL_A_PLAT_SQFT:,}",
            size=13, bold=True, color=(30, 70, 40))
    osc = net.open_space.representative_point()
    sh.text(*pt(osc.x, osc.y), 'OS-1\nopen space /\nstorm\n%s SF' % f"{round(net.open_space.area):,}", size=11, color=(30, 70, 40), bold=True)
    sh.text(*pt(15, 112), 'PARCEL C  canal buffer  %s SF' % f"{round(base.parcel_c.area):,}", size=11, color=(30, 70, 40), bold=True, rotate=-90)

    # Lots
    for lot in existing + lots:
        fill = COLORS['existing'] if lot.get('existing') else (COLORS['th'] if lot['type'] == 'TH' else COLORS['sf'])
        sh.poly(P(lot['polygon']), fill=fill, stroke=COLORS['lot_line'], width=1.8)
        for env in polys(lot['envelope']):
            sh.poly(P(env), stroke=COLORS['envelope'], width=0.9, dash=(5, 4))
        for d in lot['driveways'] + lot['walks']:
            sh.poly(P(d), fill=COLORS['drive'])
        bcol = COLORS['th_bldg'] if lot['type'] == 'TH' else COLORS['sf_bldg']
        for f in lot['footprints']:
            sh.poly(P(f), fill=bcol, stroke=(40, 36, 30), width=1)
        if lot['type'] == 'TH':
            for u in lot['unitLots']:
                sh.poly(P(u['polygon']), stroke=COLORS['lot_line'], width=0.8, dash=(3, 3))
                fc = u['footprint'].centroid
                sh.text(*pt(fc.x, fc.y), u['id'], size=12, color=(255, 255, 255), bold=True)
        c = lot['polygon'].representative_point()
        if lot['type'] == 'TH':
            fp_all = unary_union(lot['footprints'])
            label_y = fp_all.bounds[3] + 12 if lot['tier'] == 'north' else fp_all.bounds[1] - 12
            sh.text(*pt(fp_all.centroid.x, label_y), 'Lot %s  %d-unit townhome  %s SF' % (lot['id'], lot['units'], f"{lot['areaSqFt']:,}"),
                    size=12, bold=True)
        elif lot.get('existing'):
            fc = lot['footprints'][0].centroid if lot['footprints'] else c
            sh.text(*pt(fc.x, fc.y), lot['id'], size=15, color=(255, 255, 255), bold=True)
            sh.text(*pt(lot['footprints'][0].bounds[0] - 26, fc.y), 'Ph. 1 lot\n%s SF' % f"{lot['areaSqFt']:,}", size=11)
        else:
            fc = lot['footprints'][0].centroid if lot['footprints'] else c
            sh.text(*pt(fc.x, fc.y), '%s' % lot['id'], size=15, color=(255, 255, 255), bold=True)
            label_y = lot['footprints'][0].bounds[3] + 10 if lot['tier'] == 'north' else lot['footprints'][0].bounds[1] - 10
            sh.text(*pt(fc.x, label_y), "%s SF · %.0f' front" % (f"{lot['areaSqFt']:,}", lot['frontageFt']), size=11)

    # Street labels
    sh.text(*pt(560, JASPER_CL_Y - 3), 'JASPER DRIVE  (450 North extension · major collector · built with Phase 1)', size=14,
            color=(255, 255, 255), bold=True)
    hx, hy = 196, 196
    sh.text(*pt(hx, hy), 'HARVEST LANE', size=13, color=(255, 255, 255), bold=True, rotate=-81)
    run_y = net.y
    sh.text(*pt(470, run_y - 3), "STREET A  (60' ROW · ST-02)", size=13, color=(255, 255, 255), bold=True)
    sh.text(*pt(EMERALD_CL_X + 2, (net.y + ELBOW_RADIUS + JASPER_S_ROW_Y) / 2 + 4), 'STREET B', size=11,
            color=(255, 255, 255), bold=True, rotate=-90)
    sh.text(*pt(EMERALD_CL_X, JASPER_CL_Y + 70), 'EMERALD\nWAY', size=11, color=COLORS['muted'], bold=True)
    sh.text(*pt(HARVEST_CL_JASPER_X + 276.01, JASPER_CL_Y + 70), 'MOONSTONE\nDR.', size=11, color=COLORS['muted'], bold=True)

    # Dimensions (tier depths)
    nd, sd = net.tier_depths

    def first_side_line(tier):
        tier_lots = sorted((l for l in lots if l['tier'] == tier), key=lambda l: l['polygon'].centroid.x)
        return tier_lots[0]['polygon'].bounds[2] + 5

    x_north, x_south = first_side_line('north'), first_side_line('south')
    white = (255, 255, 255)
    for dim_x, y0, y1, label, ink in ((x_north, net.y + HALF_ROW, JASPER_S_ROW_Y, "%.1f'" % nd, COLORS['ink']),
                                      (x_south, 0, net.y - HALF_ROW, "%.1f'" % sd, COLORS['ink']),
                                      (x_north, net.y - HALF_ROW, net.y + HALF_ROW, "60' ROW", white)):
        sh.line([pt(dim_x, y0), pt(dim_x, y1)], ink, 0.9)
        sh.line([pt(dim_x - 4, y0), pt(dim_x + 4, y0)], ink, 0.9)
        sh.line([pt(dim_x - 4, y1), pt(dim_x + 4, y1)], ink, 0.9)
        sh.text(*pt(dim_x - 6, (y0 + y1) / 2), label, size=11, bold=True, rotate=-90, color=ink)

    # Boundary of the 4.8-ac description + Parcel A
    sh.poly(P(base.parcel.difference(base.jasper_row).union(base.parcel_a)), stroke=(20, 20, 20), width=2.6)

    # North arrow and scale bar
    nx, ny = pt(1170, 360)
    sh.line([(nx, ny + 26), (nx - 0.7, ny - 26)], COLORS['ink'], 2)
    sh.poly(Polygon([(nx - 0.7, ny - 34), (nx - 8, ny - 14), (nx + 6, ny - 14)]), fill=COLORS['ink'])
    sh.text(nx, ny + 40, 'N', size=14, bold=True)
    sx, sy = pt(-55, 372)
    for i, ft in enumerate((0, 50, 100, 200)):
        if i:
            prev = (0, 50, 100, 200)[i - 1]
            sh.poly(box(sx + prev * scale, sy, sx + ft * scale, sy + 7), fill=COLORS['ink'] if i % 2 else (255, 255, 255),
                    stroke=COLORS['ink'], width=1)
        sh.text(sx + ft * scale, sy + 18, "%d'" % ft, size=11)

    # Title band
    sh.poly(box(0, 0, width, title_h), fill=COLORS['accent'])
    sh.text(36, 34, 'DELTA CROSSINGS — SOUTH PARCEL  ·  CONCEPT %s: %s' % (cfg['id'], cfg['name'].upper()), size=30,
            color=(255, 255, 255), bold=True, anchor='left')
    sh.text(36, 70, cfg['summary'] + '  Delta City R-4 · land south of Jasper Drive, west of the commercial line.', size=16,
            color=(220, 236, 224), anchor='left')
    sh.text(width - 36, 34, '%d units  ·  %d single-family  ·  %d townhome' % (summary['units'], summary['sfUnits'], summary['thUnits']),
            size=24, color=(255, 255, 255), bold=True, anchor='right')
    sh.text(width - 36, 70, 'Concept only — not for construction · generated %s' % summary['generated'], size=14,
            color=(220, 236, 224), anchor='right')

    # Panels
    panel_y = panel_top
    sh.poly(box(24, panel_y, width - 24, height - 20), fill=COLORS['panel'], stroke=(210, 206, 196), width=1)
    col1, col2, col3 = 48, 860, 2190
    sh.text(col1, panel_y + 28, 'SITE DATA', size=18, bold=True, anchor='left', color=COLORS['accent'])
    rows = summary['siteData']
    for i, (k, v) in enumerate(rows):
        yy = panel_y + 62 + i * 25
        sh.text(col1, yy, k, size=14, anchor='left', color=COLORS['muted'])
        sh.text(col2 - 40, yy, v, size=14, anchor='right', bold=True)
    sh.text(col2, panel_y + 28, 'CODE COMPLIANCE CHECK', size=18, bold=True, anchor='left', color=COLORS['accent'])
    for i, rec in enumerate(checks):
        yy = panel_y + 62 + i * 31
        dot = COLORS.get(rec['status'], COLORS['na']) if rec['status'] != 'n/a' else COLORS['na']
        sh.poly(Polygon([(col2 + 6 + 6 * math.cos(a / 8 * math.pi), yy + 6 * math.sin(a / 8 * math.pi)) for a in range(16)]), fill=dot)
        sh.text(col2 + 20, yy - 6, '%s — %s' % (rec['label'], rec['requirement']), size=13, anchor='left', bold=True)
        sh.text(col2 + 20, yy + 9, '%s   [%s]' % (rec['detail'], rec['citation']), size=11.5, anchor='left', color=COLORS['muted'])
    sh.text(col3, panel_y + 28, 'LEGEND', size=18, bold=True, anchor='left', color=COLORS['accent'])
    legend = [(COLORS['sf'], 'New single-family lot'), (COLORS['th'], 'New townhome building lot (dashed = unit lots)'),
              (COLORS['existing'], 'Phase 1 Lots 116-118 (prelim Lots 17-19)'), (COLORS['sf_bldg'], 'Single-family footprint'),
              (COLORS['th_bldg'], 'Townhome footprint (A-D units)'), (COLORS['drive'], "Driveway: 27' = three 9x18 stalls"),
              (COLORS['retention'], 'Parcel A retention basin (kept)'), (COLORS['open'], 'New open space / storm'),
              (COLORS['asphalt'], "41' asphalt (ST-02)"), (COLORS['sidewalk'], "5' sidewalk")]
    for i, (col, label) in enumerate(legend):
        yy = panel_y + 58 + i * 26
        sh.poly(box(col3, yy - 8, col3 + 26, yy + 8), fill=col, stroke=(120, 116, 108), width=0.8)
        sh.text(col3 + 36, yy, label, size=13, anchor='left')
    yy = panel_y + 58 + len(legend) * 26 + 6
    sh.line([(col3, yy), (col3 + 26, yy)], COLORS['envelope'], 1.2, dash=(5, 4))
    sh.text(col3 + 36, yy, 'Setback envelope (25 / 10 / 10 / 20 corner)', size=13, anchor='left')
    notes = summary['notes']
    for i, n in enumerate(notes):
        sh.text(col3, yy + 34 + i * 19, n, size=11.5, anchor='left', color=COLORS['muted'])

    with open(path_stem + '.svg', 'w', encoding='utf-8') as f:
        f.write(sh.to_svg())
    sh.to_png(path_stem + '.png')


# ---------------------------------------------------------------------------
# JSON serialization
# ---------------------------------------------------------------------------
def lot_json(lot):
    out = {k: lot[k] for k in ('id', 'tier', 'type', 'units', 'areaSqFt', 'minAreaSqFt', 'frontageFt', 'widthAtSetbackFt',
                               'minFrontageFt', 'corner', 'design', 'livableSqFt', 'rearOnCollector', 'existing', 'checks', 'ok')}
    for k in ('platAreaSqFt', 'stalls', 'drivewayToSideStreetFt'):
        if k in lot:
            out[k] = lot[k]
    out['polygon'] = ring(lot['polygon'])
    out['envelope'] = [ring(p) for p in polys(lot['envelope'])]
    out['footprints'] = [ring(f) for f in lot['footprints']]
    out['driveways'] = [ring(p) for d in lot['driveways'] for p in polys(d)]
    out['unitLots'] = [{
        'id': u['id'], 'areaSqFt': u['areaSqFt'], 'openSpaceSqFt': u['openSpaceSqFt'], 'stalls': u['stalls'],
        'polygon': ring(largest(u['polygon'])), 'footprint': ring(u['footprint']),
    } for u in lot['unitLots']]
    return out


def sheet_transform():
    """Least-squares affine from local feet to sheet-1 pixels of the 2023-07-12 prelim (web viewer space)."""
    pairs = [((0, 0), (603.8, 1339.7)), ((FP_EAST_X, 0), (1181.6, 1347.2)), ((FP_EAST_X, JASPER_S_ROW_Y), (1183.8, 1179.6)),
             ((PARCEL_C_WIDTH, 0), (631.8, 1340.0)), ((261.07, 0), (790.1, 1342.1)), ((201.07, 0), (746.9, 1341.5)),
             ((PARCEL_C_WIDTH, 224.94), (634.0, 1176.4))]
    import numpy as np
    a = np.array([[x, y, 1] for (x, y), _ in pairs])
    bx = np.array([u * 3 for _, (u, _v) in pairs])
    by = np.array([v * 3 for _, (_u, v) in pairs])
    cx = np.linalg.lstsq(a, bx, rcond=None)[0]
    cy = np.linalg.lstsq(a, by, rcond=None)[0]
    resid = max(math.hypot(a[i] @ cx - bx[i], a[i] @ cy - by[i]) for i in range(len(pairs)))
    return {'matrix': [[round(v, 6) for v in cx], [round(v, 6) for v in cy]], 'maxResidualPx': round(float(resid), 1),
            'note': 'pixel = M @ [x_ft, y_ft, 1]; sheet1 is 7776x5184 px (2023-07-12 prelim at 3x).'}


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    from datetime import date
    today = date.today().isoformat()
    base = Base()
    existing = existing_lot_records(base)
    out = {
        'project': 'Delta Crossings — South Parcel',
        'generated': today,
        'generator': 'scripts/south_parcel_concept.py',
        'coordinateSystem': 'Local survey feet: +X along Jasper Drive (S88°27\'43"E), +Y north (N01°32\'17"E); '
                            'origin = SW corner of the 4.800-ac future-phase description.',
        'sources': [
            'Delta Crossings Phase 1 plat, Reeve & Associates (Nov 2023; file 2024.3.14 Delta Crossing Phase 1.pdf)',
            'Future-phase metes and bounds, Reeve & Associates 3-8-2024 (4.800 ac)',
            '2023.7.12 Delta Crossings Prelim.pdf (lot numbering 17-19, Harvest Lane, open space/retention)',
            'Delta City Code via Ords. 21-290, 2022-299, 2023-302, 23-300, Revised Title 16, 2025-317 (ST-02), 2025-318 (TMP)',
            'NOAA Atlas 14 PFDS for 39.353 N, 112.565 W',
        ],
        'toSheetPixels': sheet_transform(),
        'base': {
            'fourPointEightAcSqFt': round(base.parcel.area), 'fourPointEightAcPlatSqFt': FOUR_POINT_EIGHT_AC_SQFT,
            'futurePhaseSqFt': round(base.future_phase.area), 'parcelCSqFt': round(base.parcel_c.area),
            'harvestRowSqFt': round(base.harvest_in.area), 'jasperHalfRowSqFt': round(base.jasper_half.area),
            'parcelASqFtPlat': PARCEL_A_PLAT_SQFT, 'parcelASqFtDrawn': round(base.parcel_a.area),
            'polygons': {
                'parcel48ac': ring(base.parcel), 'futurePhase': ring(base.future_phase), 'parcelC': ring(base.parcel_c),
                'parcelA': ring(base.parcel_a), 'harvestRow': [ring(p) for p in polys(base.harvest_in)],
            },
            'existingLots': [lot_json(l) for l in existing],
        },
        'concepts': [],
    }
    view = box(*VIEW_BOUNDS)
    ctx = context_geometry(base)
    out['base']['context'] = {
        'view': list(VIEW_BOUNDS),
        'jasperRow': clipped_rings(base.jasper_row, view),
        'harvestRow': clipped_rings(base.harvest_row, view),
        'deltaEstates': clipped_rings(ctx['deltaEstates'], view),
        'phase1Band': clipped_rings(ctx['phase1Band'], view),
        'phase1Lots': [{'id': name, 'polygon': ring(largest(lot))} for name, lot in ctx['phase1Lots']],
        'commercial': clipped_rings(ctx['commercial'], view),
        'projectBoundary': clipped_rings(base.parcel.difference(base.jasper_row).union(base.parcel_a), view),
        'emeraldX': round(EMERALD_CL_X, 2),
        'moonstoneX': round(HARVEST_CL_JASPER_X + 276.01, 2),
    }
    for cfg in CONCEPTS:
        net, lots = build_concept(base, cfg)
        surfaces = street_surfaces(base, net)
        q = quantities(base, net, lots, surfaces)
        storm = stormwater(base, net, existing + lots, surfaces)
        checks = compliance(base, net, lots, existing, storm)
        sf_units = sum(1 for l in lots + existing if l['type'] == 'SF')
        th_units = sum(l['units'] for l in lots if l['type'] == 'TH')
        units = sf_units + th_units
        lot_area = sum(l['polygon'].area for l in lots)
        gross = base.parcel.area + PARCEL_A_PLAT_SQFT
        nd, sd = net.tier_depths
        summary = {
            'units': units, 'sfUnits': sf_units, 'thUnits': th_units, 'generated': today,
            'grossAcres': round(gross / 43560, 2), 'densityPerGrossAcre': round(units / (gross / 43560), 2),
            'thBuildings': [l['units'] for l in lots if l['type'] == 'TH'],
            'livableSqFt': sum(l['livableSqFt'] for l in lots + existing),
            'streetAY': round(net.y, 2), 'tierDepthsFt': [round(nd, 2), round(sd, 2)],
            'harvestSkewDeg': round(net.harvest_skew_deg, 1),
        }
        th_buildings = summary['thBuildings']
        summary['siteData'] = [
            ('Gross area (4.80-ac description + Parcel A)', '%.2f ac' % summary['grossAcres']),
            ('Phase 1 Lots 116-118 (single-family, existing plat)', '3 lots'),
            ('New single-family lots', '%d' % (sf_units - 3)),
            ('New townhome buildings / units', ('%d / %d  (%s)' % (len(th_buildings), th_units, '+'.join(map(str, th_buildings)))) if th_buildings else '—'),
            ('Total dwelling units', '%d  (%.1f per gross ac)' % (units, summary['densityPerGrossAcre'])),
            ('New lot area', '%s SF (%.2f ac)' % (f"{round(lot_area):,}", lot_area / 43560)),
            ("Street A + B centerline (60' ROW)", "%.0f LF" % q['newStreetCenterlineFt']),
            ('Harvest Lane south of Jasper (dedicated Ph. 1)', "%.0f LF" % q['harvestLaneCenterlineFt']),
            ("Tier depths north / south of Street A", "%.1f' / %.1f'" % (nd, sd)),
            ('Asphalt / curb & gutter / sidewalk', "%s SF / %s LF / %s SF" % (f"{q['asphaltSqFt']:,}", f"{round(q['curbGutterLf']):,}", f"{q['sidewalkSqFt']:,}")),
            ('Off-street stalls (3 per unit, driveways)', '%d' % (3 * units)),
            ('Open space: Parcel A / new OS-1 / Parcel C', '%s / %s / %s SF' % (f"{PARCEL_A_PLAT_SQFT:,}", f"{round(net.open_space.area):,}", f"{round(base.parcel_c.area):,}")),
            ('Storm volume to hold (10-yr, 24-hr)', '%s CF (%.2f ac-ft)' % (f"{storm['requiredVolumeCf']:,}", storm['requiredVolumeAcFt'])),
            ('Livable area for sale (est.)', '%s SF' % f"{summary['livableSqFt']:,}"),
        ]
        summary['notes'] = [
            'Geometry: Phase 1 plat (Nov 2023) + 4.800-ac description (3-8-2024).',
            'Lots 116-118 and Harvest Lane (Phase 1 plat) are carried here',
            '  and removed from the main proforma.',
            'Street B lines up with Emerald Way, so no new access point on Jasper.',
            "Townhome units are 31' wide: 27' three-stall driveway + 4' walk.",
            'Double-frontage lots on Jasper need LUA approval (16.24.090).',
            'Parcel A area per plat; drawn outline is from plat bearings.',
            'Verify whether the Parcel C ditch is live before final design.',
        ]
        stem = os.path.join(OUT_DIR, 'concept-%s' % cfg['id'])
        render_sheet(base, net, cfg, lots, existing, surfaces, q, storm, checks, summary, stem)
        out['concepts'].append({
            'id': cfg['id'], 'name': cfg['name'], 'summary': cfg['summary'],
            'stats': {k: v for k, v in summary.items() if k not in ('siteData', 'notes', 'generated')},
            'streets': {
                'streetA': {'centerline': [[round(x, 2), round(y, 2)] for x, y in net.cl_a.coords], 'lengthFt': round(net.street_a_len, 1)},
                'streetB': {'centerline': [[round(x, 2), round(y, 2)] for x, y in net.cl_b.coords], 'lengthFt': round(net.street_b_len, 1)},
                'rowPolygons': [ring(p) for p in polys(net.row.intersection(base.future_phase.buffer(0.1)))],
                'blockLengthFt': round(net.block_len, 1),
                'section': "ST-02 60' local road: 2' + 5' walk + 2.5' C&G + 41' asphalt + 2.5' C&G + 5' walk + 2'",
            },
            'openSpace': {'os1': [ring(p) for p in polys(net.open_space)], 'os1SqFt': round(net.open_space.area)},
            'surfaces': {key: clipped_rings(surfaces[key], view) for key in ('row', 'sidewalk', 'curb', 'asphalt')},
            'centerlines': [
                [[round(x, 2), round(y, 2)] for x, y in part.coords]
                for line in (net.cl, base.harvest_cl.intersection(view), base.jasper_cl.intersection(view))
                for part in getattr(line, 'geoms', [line])
            ],
            'lots': [lot_json(l) for l in lots],
            'quantities': q,
            'stormwater': storm,
            'compliance': checks,
            'sheet': {'svg': 'concept-%s.svg' % cfg['id'], 'png': 'concept-%s.png' % cfg['id']},
        })
        print('Concept %s (%s): %d units = %d SF + %d TH %s | Street A y=%.1f, tiers %.1f/%.1f | fails: %s' % (
            cfg['id'], cfg['name'], units, sf_units, th_units, th_buildings, net.y, nd, sd,
            [c['id'] for c in checks if c['status'] == 'fail'] or 'none'))
    with open(os.path.join(OUT_DIR, 'concepts.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f, indent=1)
    print('Wrote', OUT_DIR)


if __name__ == '__main__':
    main()
