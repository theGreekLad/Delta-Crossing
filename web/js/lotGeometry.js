import * as THREE from "three";

export const PHASE_COLORS = {
  1: 0xc5dcaf,
  2: 0xefffc0,
  3: 0xccbc8d,
  4: 0xffefc0,
  5: 0xeae3cd,
  6: 0xeed2b7,
  7: 0xeeeeb7,
};

const SF_WALL_PALETTE = [0xf5f0e8, 0xe8e0d4, 0xddd4c8, 0xf0ebe3];
const SF_ROOF_PALETTE = [0x4a5568, 0x5c4033, 0x3d4f5f, 0x6b4423];
const TH_WALL_PALETTE = [0xd4cfc7, 0xc8c2b8, 0xb8b0a4, 0xe0dbd3];
const TH_ACCENT_PALETTE = [0x8b4513, 0x556b2f, 0x704214, 0x2f4f4f];

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

    polygonToShape(polygon) {
      const shape = new THREE.Shape();
      polygon.slice(0, -1).forEach(([x, y], index) => {
        const world = this.toWorld([x, y]);
        // Shape Y becomes -world Z after extrude + rotateX(-π/2); negate so footprint matches toWorld.
        if (index === 0) shape.moveTo(world.x, -world.z);
        else shape.lineTo(world.x, -world.z);
      });
      return shape;
    },

    polygonBounds(polygon) {
      const points = polygon.slice(0, -1).map((point) => this.toWorld(point));
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      let sumX = 0;
      let sumZ = 0;

      points.forEach(({ x, z }) => {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
        sumX += x;
        sumZ += z;
      });

      return {
        centerX: sumX / points.length,
        centerZ: sumZ / points.length,
        width: maxX - minX,
        depth: maxZ - minZ,
        minX,
        maxX,
        minZ,
        maxZ,
      };
    },
  };
}

function pickPalette(palette, seed) {
  return palette[Math.abs(seed) % palette.length];
}

function createMaterial(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.82,
    metalness: options.metalness ?? 0.04,
    flatShading: false,
    ...options,
  });
}

function addGabledRoof(group, bounds, wallHeight, roofColor, ridgeAlongX) {
  const roofHeight = Math.min(bounds.width, bounds.depth) * 0.28;
  const overhang = 1.8;
  const width = (ridgeAlongX ? bounds.width : bounds.depth) + overhang * 2;
  const depth = (ridgeAlongX ? bounds.depth : bounds.width) + overhang * 2;

  const roofGeom = new THREE.ConeGeometry(Math.max(width, depth) * 0.55, roofHeight, 4, 1, false, Math.PI / 4);
  const roof = new THREE.Mesh(roofGeom, createMaterial(roofColor, { roughness: 0.92 }));
  roof.castShadow = true;
  roof.position.set(bounds.centerX, wallHeight + roofHeight * 0.42, bounds.centerZ);
  roof.rotation.y = ridgeAlongX ? 0 : Math.PI / 2;
  group.add(roof);
}

function addFacadeDetails(group, bounds, wallHeight, lotNumber, isTownhome) {
  const stripeCount = isTownhome ? 4 : 2;
  const stripeWidth = bounds.width / (stripeCount * 2.5);
  const stripeDepth = 0.15;
  const stripeHeight = wallHeight * 0.55;
  const material = createMaterial(0x3d4852, { roughness: 0.95, metalness: 0.02 });

  for (let index = 0; index < stripeCount; index += 1) {
    const offset = (index - (stripeCount - 1) / 2) * (bounds.width / stripeCount);
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(stripeWidth, stripeHeight, stripeDepth),
      material
    );
    stripe.position.set(
      bounds.centerX + offset,
      stripeHeight * 0.55,
      bounds.maxZ + stripeDepth * 0.6
    );
    stripe.castShadow = true;
    group.add(stripe);
  }

  if (!isTownhome && lotNumber % 3 === 0) {
    const porch = new THREE.Mesh(
      new THREE.BoxGeometry(bounds.width * 0.35, 0.35, 3.5),
      createMaterial(0x8b7355, { roughness: 0.88 })
    );
    porch.position.set(bounds.centerX, 0.18, bounds.maxZ + 1.75);
    porch.receiveShadow = true;
    group.add(porch);
  }
}

function addChimney(group, bounds, wallHeight, lotNumber) {
  if (lotNumber % 4 !== 0) return;
  const chimney = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 3.2, 1.4),
    createMaterial(0x8a8078, { roughness: 0.9 })
  );
  chimney.position.set(bounds.centerX + bounds.width * 0.25, wallHeight + 1.6, bounds.centerZ - bounds.depth * 0.2);
  chimney.castShadow = true;
  group.add(chimney);
}

export function createSingleFamilyHome(lot, transform) {
  const group = new THREE.Group();
  group.userData = { parcelId: lot.id, lotType: "single-family" };

  const shape = transform.polygonToShape(lot.polygon);
  const bounds = transform.polygonBounds(lot.polygon);
  const sqft = lot.squareFeet || lot.areaPx * transform.feetPerPixel ** 2;
  const stories = sqft > 6500 ? 2 : 1.5;
  const wallHeight = stories * 10;

  const wallColor = pickPalette(SF_WALL_PALETTE, lot.lotNumber);
  const roofColor = pickPalette(SF_ROOF_PALETTE, lot.lotNumber + 3);

  const wallGeom = new THREE.ExtrudeGeometry(shape, { depth: wallHeight, bevelEnabled: false });
  wallGeom.rotateX(-Math.PI / 2);
  const walls = new THREE.Mesh(wallGeom, createMaterial(wallColor));
  walls.castShadow = true;
  walls.receiveShadow = true;
  group.add(walls);

  const ridgeAlongX = bounds.width >= bounds.depth;
  addGabledRoof(group, bounds, wallHeight, roofColor, ridgeAlongX);
  addFacadeDetails(group, bounds, wallHeight, lot.lotNumber, false);
  addChimney(group, bounds, wallHeight, lot.lotNumber);

  return group;
}

export function createTownhome(lot, transform) {
  const group = new THREE.Group();
  group.userData = { parcelId: lot.id, lotType: "townhome" };

  const shape = transform.polygonToShape(lot.polygon);
  const bounds = transform.polygonBounds(lot.polygon);
  const wallHeight = 32;

  const wallColor = pickPalette(TH_WALL_PALETTE, lot.lotNumber);
  const accentColor = pickPalette(TH_ACCENT_PALETTE, lot.lotNumber + 7);

  const wallGeom = new THREE.ExtrudeGeometry(shape, { depth: wallHeight, bevelEnabled: false });
  wallGeom.rotateX(-Math.PI / 2);
  const walls = new THREE.Mesh(wallGeom, createMaterial(wallColor));
  walls.castShadow = true;
  walls.receiveShadow = true;
  group.add(walls);

  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(bounds.width + 2.4, 1.2, bounds.depth + 2.4),
    createMaterial(accentColor, { roughness: 0.78 })
  );
  cap.position.set(bounds.centerX, wallHeight + 0.6, bounds.centerZ);
  cap.castShadow = true;
  group.add(cap);

  addFacadeDetails(group, bounds, wallHeight, lot.lotNumber, true);

  const unitCount = Math.max(2, Math.round(bounds.width / 22));
  for (let index = 1; index < unitCount; index += 1) {
    const divider = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, wallHeight, bounds.depth + 0.5),
      createMaterial(0x706860, { roughness: 0.85 })
    );
    const offset = bounds.minX + (bounds.width / unitCount) * index;
    divider.position.set(offset, wallHeight / 2, bounds.centerZ);
    divider.castShadow = true;
    group.add(divider);
  }

  return group;
}

export function createCommercialBuilding(parcel, transform) {
  const group = new THREE.Group();
  group.userData = { parcelId: parcel.id, lotType: "commercial" };

  const shape = transform.polygonToShape(parcel.polygon);
  const bounds = transform.polygonBounds(parcel.polygon);
  const wallHeight = 28 + parcel.blockNumber * 2;

  const wallGeom = new THREE.ExtrudeGeometry(shape, { depth: wallHeight, bevelEnabled: false });
  wallGeom.rotateX(-Math.PI / 2);
  const walls = new THREE.Mesh(
    wallGeom,
    createMaterial(0xd4c4a8, { roughness: 0.75, metalness: 0.08 })
  );
  walls.castShadow = true;
  walls.receiveShadow = true;
  group.add(walls);

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(bounds.width + 1.5, 0.8, bounds.depth + 1.5),
    createMaterial(0x6b5344, { roughness: 0.88 })
  );
  roof.position.set(bounds.centerX, wallHeight + 0.4, bounds.centerZ);
  roof.castShadow = true;
  group.add(roof);

  return group;
}

export function createLotPad(lot, transform) {
  const shape = transform.polygonToShape(lot.polygon);
  const phaseColor = PHASE_COLORS[lot.phase] ?? 0xdde3d0;
  const padGeom = new THREE.ExtrudeGeometry(shape, { depth: 0.25, bevelEnabled: false });
  padGeom.rotateX(-Math.PI / 2);

  const pad = new THREE.Mesh(
    padGeom,
    createMaterial(phaseColor, { roughness: 0.95, metalness: 0 })
  );
  pad.position.y = -0.05;
  pad.receiveShadow = true;
  pad.userData = { parcelId: lot.id, isPad: true };
  return pad;
}

export function createTree(x, z, seed) {
  const group = new THREE.Group();
  const trunkHeight = 4 + (seed % 3);
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.5, trunkHeight, 6),
    createMaterial(0x6b4423, { roughness: 0.95 })
  );
  trunk.position.y = trunkHeight / 2;
  trunk.castShadow = true;
  group.add(trunk);

  const foliage = new THREE.Mesh(
    new THREE.ConeGeometry(2.8 + (seed % 2), 7 + (seed % 4), 8),
    createMaterial(0x3d7a4a, { roughness: 0.88 })
  );
  foliage.position.y = trunkHeight + 3;
  foliage.castShadow = true;
  group.add(foliage);

  group.position.set(x, 0, z);
  return group;
}

export function addTreesForLot(group, lot, transform) {
  if (lot.lotType === "commercial") return;
  const bounds = transform.polygonBounds(lot.polygon);
  const treeCount = lot.lotType === "townhome" ? 1 : 2;
  for (let index = 0; index < treeCount; index += 1) {
    const seed = lot.lotNumber * 17 + index * 31;
    const offsetX = ((seed % 100) / 100 - 0.5) * bounds.width * 0.45;
    const offsetZ = (((seed >> 3) % 100) / 100 - 0.5) * bounds.depth * 0.45;
    group.add(createTree(bounds.centerX + offsetX, bounds.centerZ + offsetZ, seed));
  }
}
