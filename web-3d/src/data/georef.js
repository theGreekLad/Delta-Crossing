export function geoToWorld(lon, lat, alignment) {
  const dx = (lon - alignment.geoOrigin.lon) * alignment.scaleFeetPerDegreeLon;
  const dz = (lat - alignment.geoOrigin.lat) * alignment.scaleFeetPerDegreeLat;
  return {
    x: alignment.worldOrigin.x + dx / alignment.uniformScale,
    z: alignment.worldOrigin.z + dz / alignment.uniformScale,
  };
}

export function worldToGeo(x, z, alignment) {
  const dx = (x - alignment.worldOrigin.x) * alignment.uniformScale;
  const dz = (z - alignment.worldOrigin.z) * alignment.uniformScale;
  return {
    lon: alignment.geoOrigin.lon + dx / alignment.scaleFeetPerDegreeLon,
    lat: alignment.geoOrigin.lat + dz / alignment.scaleFeetPerDegreeLat,
  };
}

export function satelliteOverlayFromGeoref(georef) {
  const { satellite, alignment } = georef;
  const worldBounds = satellite.worldBounds;
  const width = worldBounds.maxX - worldBounds.minX;
  const depth = worldBounds.maxZ - worldBounds.minZ;

  return {
    textureUrl: satellite.image,
    width,
    depth,
    centerX: (worldBounds.minX + worldBounds.maxX) / 2,
    centerZ: (worldBounds.minZ + worldBounds.maxZ) / 2,
    attribution: satellite.attribution,
    bounds: satellite.bounds,
    alignment,
  };
}
