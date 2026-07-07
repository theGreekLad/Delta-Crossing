import * as THREE from 'three';

export function polygonCentroid(polygon) {
  let cx = 0;
  let cz = 0;
  polygon.forEach(([x, z]) => {
    cx += x;
    cz += z;
  });
  return [cx / polygon.length, cz / polygon.length];
}

/**
 * Build a THREE.Shape from world X/Z coordinates for meshes rotated rotateX(-π/2).
 * Shape Y maps to -world Z after that rotation (see lotGeometry.js in web/js).
 */
export function polygonShapeOnGround(polygon) {
  const shape = new THREE.Shape();
  polygon.forEach(([x, z], index) => {
    const sx = x;
    const sy = -z;
    if (index === 0) shape.moveTo(sx, sy);
    else shape.lineTo(sx, sy);
  });
  shape.closePath();
  return shape;
}

/** @deprecated Use polygonShapeOnGround for horizontal lot/site meshes. */
export function polygonShape(polygon) {
  return polygonShapeOnGround(polygon);
}

export function pointInPolygon([px, pz], polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, zi] = polygon[i];
    const [xj, zj] = polygon[j];
    const intersects =
      zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi + 0.0000001) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function distancePointToSegment([px, pz], [ax, az], [bx, bz]) {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq < 1e-8) return Math.hypot(px - ax, pz - az);

  let t = ((px - ax) * dx + (pz - az) * dz) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cz = az + t * dz;
  return Math.hypot(px - cx, pz - cz);
}

export function minDistanceToPolygonBoundary(point, polygon) {
  let min = Infinity;
  for (let i = 0; i < polygon.length; i += 1) {
    const j = (i + 1) % polygon.length;
    min = Math.min(min, distancePointToSegment(point, polygon[i], polygon[j]));
  }
  return min;
}

export function localToWorld(localX, localZ, center, rotation) {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return [
    center[0] + localX * cos + localZ * sin,
    center[1] - localX * sin + localZ * cos,
  ];
}

export function footprintCorners(center, width, depth, rotation) {
  const halfW = width / 2;
  const halfD = depth / 2;
  return [
    [-halfW, -halfD],
    [halfW, -halfD],
    [halfW, halfD],
    [-halfW, halfD],
  ].map(([lx, lz]) => localToWorld(lx, lz, center, rotation));
}

export function footprintInsideLot(polygon, center, width, depth, rotation, edgeBuffer = 0.5) {
  const corners = footprintCorners(center, width, depth, rotation);
  return corners.every(
    (corner) =>
      pointInPolygon(corner, polygon) &&
      minDistanceToPolygonBoundary(corner, polygon) >= edgeBuffer
  );
}

export function clampFootprintToLot(polygon, center, rotation, width, depth, edgeBuffer = 0.5) {
  let fitWidth = width;
  let fitDepth = depth;

  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (footprintInsideLot(polygon, center, fitWidth, fitDepth, rotation, edgeBuffer)) {
      return { width: fitWidth, depth: fitDepth, sqft: fitWidth * fitDepth };
    }
    fitWidth *= 0.94;
    fitDepth *= 0.94;
  }

  return { width: 0, depth: 0, sqft: 0 };
}

export function cameraTargetFromBounds(bounds) {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
  return { cx, cz, span };
}
