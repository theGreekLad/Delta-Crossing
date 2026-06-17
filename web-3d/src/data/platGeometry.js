export const PHASE_COLORS = {
  1: '#c5dcaf',
  2: '#efffc0',
  3: '#ccbc8d',
  4: '#ffefc0',
  5: '#eae3cd',
  6: '#eed2b7',
  7: '#eeeeb7',
};

export function computeFeetPerPixel(lots) {
  const ratios = lots
    .filter((lot) => lot.squareFeet && lot.areaPx)
    .map((lot) => lot.squareFeet / lot.areaPx);
  if (!ratios.length) return 0.22;
  ratios.sort((a, b) => a - b);
  return Math.sqrt(ratios[Math.floor(ratios.length / 2)]);
}

export function createCoordinateTransform(pixelWidth, pixelHeight, feetPerPixel) {
  const originX = pixelWidth / 2;
  const originY = pixelHeight / 2;

  return {
    feetPerPixel,
    originX,
    originY,
    mapWidthFeet: pixelWidth * feetPerPixel,
    mapHeightFeet: pixelHeight * feetPerPixel,

    toWorld([x, y]) {
      return {
        x: (x - originX) * feetPerPixel,
        z: (y - originY) * feetPerPixel,
      };
    },

    polygonToWorld(polygon) {
      const ring = polygon[0]?.[0] === polygon.at(-1)?.[0] && polygon[0]?.[1] === polygon.at(-1)?.[1]
        ? polygon.slice(0, -1)
        : polygon;

      return ring.map(([x, y]) => {
        const world = this.toWorld([x, y]);
        return [world.x, world.z];
      });
    },
  };
}

export function boundsFromPolygons(polygons) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  polygons.forEach((polygon) => {
    polygon.forEach(([x, z]) => {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    });
  });

  return { minX, maxX, minZ, maxZ };
}
