import { R4_ZONING } from '../data/zoning';
import {
  clampFootprintToLot,
  footprintInsideLot,
  pointInPolygon,
} from './geometry';

const DEG = Math.PI / 180;
const MIN_CORNER_ROAD_ANGLE_DEG = 35;
const LOT_EDGE_BUFFER_FT = 1;

function subtract([ax, az], [bx, bz]) {
  return [ax - bx, az - bz];
}

function add([ax, az], [bx, bz]) {
  return [ax + bx, az + bz];
}

function scale([x, z], factor) {
  return [x * factor, z * factor];
}

function length([x, z]) {
  return Math.hypot(x, z);
}

function normalize(vector) {
  const len = length(vector);
  if (len < 1e-6) return [0, 1];
  return [vector[0] / len, vector[1] / len];
}

function dot([ax, az], [bx, bz]) {
  return ax * bx + az * bz;
}

function perpendicular([x, z]) {
  return [-z, x];
}

function polygonCentroid(polygon) {
  let cx = 0;
  let cz = 0;
  polygon.forEach(([x, z]) => {
    cx += x;
    cz += z;
  });
  return [cx / polygon.length, cz / polygon.length];
}

function polygonArea(polygon) {
  let area = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const [x1, z1] = polygon[index];
    const [x2, z2] = polygon[(index + 1) % polygon.length];
    area += x1 * z2 - x2 * z1;
  }
  return Math.abs(area) / 2;
}

function roadsToWorld(roads, transform) {
  return (roads || []).map((road) => ({
    name: road.name,
    point: transform.toWorld([road.x, road.y]),
    isHighway: /U\.S\.|HWY|HIGHWAY/i.test(road.name || ''),
  }));
}

function nearestRoadDistance(point, roads) {
  if (!roads.length) return Infinity;
  return Math.min(
    ...roads.map((road) => length(subtract(point, [road.point.x, road.point.z])))
  );
}

function rankRoadsByLot(centroid, roads) {
  return roads
    .map((road) => ({
      ...road,
      distance: length(subtract([road.point.x, road.point.z], centroid)),
    }))
    .sort((a, b) => a.distance - b.distance);
}

function pickFrontRoads(centroid, roads) {
  const ranked = rankRoadsByLot(centroid, roads);
  const localStreets = ranked.filter((road) => !road.isHighway);
  const primary = localStreets[0] || ranked[0];
  if (!primary) {
    return { primary: null, secondary: null, isCornerLot: false, primaryDir: [0, 1] };
  }

  let primaryDir = normalize(subtract([primary.point.x, primary.point.z], centroid));
  const secondaryCandidate = (localStreets[1] || ranked[1]) ?? null;

  if (!secondaryCandidate || secondaryCandidate.name === primary.name) {
    primaryDir = orientFrontDirection(centroid, primaryDir, roads);
    return { primary, secondary: null, isCornerLot: false, primaryDir };
  }

  const secondaryDir = normalize(
    subtract([secondaryCandidate.point.x, secondaryCandidate.point.z], centroid)
  );
  const angle = Math.acos(Math.min(1, Math.abs(dot(primaryDir, secondaryDir)))) / DEG;
  const isCornerLot =
    secondaryCandidate.distance <= primary.distance * 1.75 &&
    angle >= MIN_CORNER_ROAD_ANGLE_DEG;

  primaryDir = orientFrontDirection(centroid, primaryDir, roads);

  return {
    primary,
    secondary: isCornerLot ? secondaryCandidate : null,
    isCornerLot,
    primaryDir,
    secondaryDir,
  };
}

function orientFrontDirection(centroid, frontDir, roads) {
  if (!roads.length) return frontDir;

  const probe = (depth) => add(centroid, scale(frontDir, depth));
  const forwardDist = nearestRoadDistance(probe(120), roads);
  const backwardDist = nearestRoadDistance(probe(-120), roads);

  if (backwardDist < forwardDist) {
    return scale(frontDir, -1);
  }
  return frontDir;
}

function projectPolygon(polygon, centroid, frontDir, sideDir) {
  let minDepth = Infinity;
  let maxDepth = -Infinity;
  let minWidth = Infinity;
  let maxWidth = -Infinity;

  polygon.forEach(([x, z]) => {
    const local = subtract([x, z], centroid);
    const depth = dot(local, frontDir);
    const width = dot(local, sideDir);
    minDepth = Math.min(minDepth, depth);
    maxDepth = Math.max(maxDepth, depth);
    minWidth = Math.min(minWidth, width);
    maxWidth = Math.max(maxWidth, width);
  });

  return { minDepth, maxDepth, minWidth, maxWidth };
}

function targetSingleFamilySqFt(lotNumber) {
  const { targetSqFtMin, targetSqFtMax } = R4_ZONING.singleFamily;
  const span = targetSqFtMax - targetSqFtMin;
  const seed = Math.abs(lotNumber || 1);
  return targetSqFtMin + (seed % (span / 50 + 1)) * 50;
}

function fitRectangle(targetSqFt, aspect, maxWidth, maxDepth) {
  let width = Math.sqrt(targetSqFt * aspect);
  let depth = targetSqFt / width;

  if (width > maxWidth || depth > maxDepth) {
    const scaleFactor = Math.min(maxWidth / width, maxDepth / depth);
    width *= scaleFactor;
    depth *= scaleFactor;
  }

  return {
    width: Math.max(width, 0),
    depth: Math.max(depth, 0),
    sqft: width * depth,
  };
}

function resolveCenterInsideLot(polygon, centroid, frontDir, sideDir, centerDepth, centerWidth) {
  let center = add(centroid, add(scale(frontDir, centerDepth), scale(sideDir, centerWidth)));
  if (pointInPolygon(center, polygon)) return center;

  // Fall back to the polygon centroid if setback center lands outside (irregular lots).
  if (pointInPolygon(centroid, polygon)) return centroid;

  // Last resort: nudge toward interior.
  for (let radius = 0; radius <= 40; radius += 2) {
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
      const candidate = [
        centroid[0] + Math.cos(angle) * radius,
        centroid[1] + Math.sin(angle) * radius,
      ];
      if (pointInPolygon(candidate, polygon)) return candidate;
    }
  }

  return centroid;
}

/**
 * Compute an ordinance-aware building pad inside the lot polygon.
 * Setbacks are measured from lot boundary edges via oriented envelope + containment check.
 */
export function computeBuildingEnvelope(lot, { roads = [], transform = null } = {}) {
  const polygon = lot.polygon;
  const centroid = polygonCentroid(polygon);
  const lotAreaSqFt = polygonArea(polygon);
  const worldRoads = transform ? roadsToWorld(roads, transform) : [];

  const { primary, secondary, isCornerLot, primaryDir, secondaryDir } = pickFrontRoads(
    centroid,
    worldRoads
  );

  const frontDir = primaryDir || [0, 1];
  const sideDir = perpendicular(frontDir);

  let leftSetback = R4_ZONING.setbacks.side;
  let rightSetback = R4_ZONING.setbacks.side;

  if (isCornerLot && secondaryDir) {
    if (dot(secondaryDir, sideDir) > 0.25) {
      rightSetback = R4_ZONING.setbacks.cornerStreetSide;
    }
    if (dot(secondaryDir, scale(sideDir, -1)) > 0.25) {
      leftSetback = R4_ZONING.setbacks.cornerStreetSide;
    }
  }

  const { minDepth, maxDepth, minWidth, maxWidth } = projectPolygon(
    polygon,
    centroid,
    frontDir,
    sideDir
  );

  const buildMinDepth = minDepth + R4_ZONING.setbacks.rear;
  const buildMaxDepth = maxDepth - R4_ZONING.setbacks.front;
  const buildMinWidth = minWidth + leftSetback;
  const buildMaxWidth = maxWidth - rightSetback;

  const buildableWidth = buildMaxWidth - buildMinWidth;
  const buildableDepth = buildMaxDepth - buildMinDepth;
  const buildableSqFt = Math.max(buildableWidth, 0) * Math.max(buildableDepth, 0);

  const isSingleFamily = lot.type === 'single-family';
  const targetSqFt = isSingleFamily ? targetSingleFamilySqFt(lot.lotNumber) : null;

  let footprint = { width: 0, depth: 0, sqft: 0 };
  let complianceNote = null;

  const centerDepth = (buildMinDepth + buildMaxDepth) / 2;
  const centerWidth = (buildMinWidth + buildMaxWidth) / 2;
  const center = resolveCenterInsideLot(
    polygon,
    centroid,
    frontDir,
    sideDir,
    centerDepth,
    centerWidth
  );
  const rotation = Math.atan2(frontDir[0], frontDir[1]);

  if (buildableWidth > 0 && buildableDepth > 0) {
    if (isSingleFamily) {
      footprint = fitRectangle(
        targetSqFt,
        R4_ZONING.singleFamily.footprintAspect,
        buildableWidth,
        buildableDepth
      );
    } else if (lot.type === 'townhome') {
      footprint = fitRectangle(
        Math.min(buildableSqFt * 0.85, 8500),
        R4_ZONING.townhome.footprintAspect,
        buildableWidth,
        buildableDepth
      );
    } else {
      footprint = {
        width: buildableWidth * 0.92,
        depth: buildableDepth * 0.92,
        sqft: buildableWidth * buildableDepth * 0.92 * 0.92,
      };
    }

    const clamped = clampFootprintToLot(
      polygon,
      center,
      rotation,
      footprint.width,
      footprint.depth,
      LOT_EDGE_BUFFER_FT
    );

    if (clamped.sqft > 0) {
      footprint = clamped;
    } else {
      footprint = { width: 0, depth: 0, sqft: 0 };
      complianceNote = 'Building footprint could not be placed fully inside lot boundaries with required setbacks.';
    }

    if (
      isSingleFamily &&
      footprint.sqft > 0 &&
      footprint.sqft < R4_ZONING.singleFamily.targetSqFtMin - 1
    ) {
      complianceNote = `Lot geometry limits footprint to ~${Math.round(footprint.sqft)} sq ft (target ${R4_ZONING.singleFamily.targetSqFtMin}–${R4_ZONING.singleFamily.targetSqFtMax}).`;
    }
  } else {
    complianceNote = 'Setbacks exceed lot geometry; footprint could not be placed.';
  }

  const wallHeight = R4_ZONING.modelHeightFt;
  const heightCompliant = wallHeight <= R4_ZONING.maxStructureHeightFt + 0.5;

  const insideLot =
    footprint.width > 0 &&
    footprintInsideLot(polygon, center, footprint.width, footprint.depth, rotation, LOT_EDGE_BUFFER_FT);

  return {
    center,
    rotation,
    width: footprint.width,
    depth: footprint.depth,
    dwellingSqFt: isSingleFamily ? Math.round(footprint.sqft) : null,
    targetSqFt: isSingleFamily ? targetSqFt : null,
    buildableSqFt: Math.round(buildableSqFt),
    lotAreaSqFt: Math.round(lotAreaSqFt),
    wallHeight,
    roofHeight: 0,
    frontStreet: primary?.name || null,
    secondaryStreet: secondary?.name || null,
    isCornerLot,
    insideLot,
    setbacks: {
      front: R4_ZONING.setbacks.front,
      rear: R4_ZONING.setbacks.rear,
      left: leftSetback,
      right: rightSetback,
    },
    zoning: R4_ZONING.zone,
    heightCompliant,
    complianceNote,
    ordinanceRef: R4_ZONING.source,
  };
}
