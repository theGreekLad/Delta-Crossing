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

export function polygonShape(polygon) {
  const shape = new THREE.Shape();
  polygon.forEach(([x, z], index) => {
    if (index === 0) shape.moveTo(x, z);
    else shape.lineTo(x, z);
  });
  shape.closePath();
  return shape;
}

export function cameraTargetFromBounds(bounds) {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
  return { cx, cz, span };
}
