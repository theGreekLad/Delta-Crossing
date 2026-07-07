import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeFeetPerPixel, createCoordinateTransform } from '../src/data/platGeometry.js';
import { computeBuildingEnvelope } from '../src/utils/buildingEnvelope.js';
import { footprintCorners, pointInPolygon, minDistanceToPolygonBoundary } from '../src/utils/geometry.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const lots = JSON.parse(readFileSync(resolve(root, 'web/data/sheet1-lots.json'), 'utf8'));
const commercial = JSON.parse(readFileSync(resolve(root, 'web/data/sheet1-commercial.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(resolve(root, 'web/data/manifest.json'), 'utf8'));
const sheet = manifest.sheets.find((entry) => entry.id === 'sheet1');
const feetPerPixel = computeFeetPerPixel(lots);
const transform = createCoordinateTransform(sheet.pixelWidth, sheet.pixelHeight, feetPerPixel);
const roads = sheet.roads || [];

let failures = 0;
let checked = 0;

function validateLot(lot, type) {
  const mapped = {
    id: lot.id,
    type,
    lotNumber: lot.lotNumber,
    blockNumber: lot.blockNumber,
    polygon: transform.polygonToWorld(lot.polygon),
  };
  const building = computeBuildingEnvelope(mapped, { roads, transform });
  if (building.width <= 1 || building.depth <= 1) return;

  checked += 1;
  const corners = footprintCorners(building.center, building.width, building.depth, building.rotation);
  const inside = corners.every((corner) => pointInPolygon(corner, mapped.polygon));
  const buffered = corners.every(
    (corner) => minDistanceToPolygonBoundary(corner, mapped.polygon) >= 0.9
  );

  if (!inside || !buffered || !building.insideLot) {
    failures += 1;
    console.log(
      `FAIL lot ${lot.lotNumber ?? lot.blockNumber}: inside=${inside} buffered=${buffered} envelopeInside=${building.insideLot}`
    );
  }
}

lots.forEach((lot) => {
  const type = lot.lotType === 'townhome' ? 'townhome' : 'single-family';
  validateLot(lot, type);
});
commercial.forEach((parcel) => validateLot(parcel, 'commercial'));

console.log(`Checked ${checked} footprints, failures=${failures}`);
process.exit(failures > 0 ? 1 : 0);
