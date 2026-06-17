import {
  PHASE_COLORS,
  boundsFromPolygons,
  computeFeetPerPixel,
  createCoordinateTransform,
} from './platGeometry';
import { groundTextureUrl, platUrl } from './platUrls';

function mapResidentialLot(lot, transform) {
  return {
    id: lot.id,
    type: lot.lotType === 'townhome' ? 'townhome' : 'single-family',
    label: `Lot ${lot.lotNumber}`,
    lotNumber: lot.lotNumber,
    sqft: lot.squareFeet,
    phase: lot.phase,
    lotType: lot.lotType,
    polygon: transform.polygonToWorld(lot.polygon),
    color: PHASE_COLORS[lot.phase] || '#8fbc8f',
    centroid: lot.centroid,
    bounds: lot.bounds,
    fromPlat: true,
  };
}

function mapSiteArea(area, transform) {
  return {
    id: area.id,
    type: area.type,
    label: area.label,
    polygon: transform.polygonToWorld(area.polygon),
    holes: (area.holes || []).map((hole) => transform.polygonToWorld(hole)),
    areaPx: area.areaPx,
    centroid: area.centroid,
  };
}

function mapCommercialLot(parcel, transform) {
  return {
    id: parcel.id,
    type: 'commercial',
    label: `${parcel.label} ${parcel.blockNumber}`,
    blockNumber: parcel.blockNumber,
    phase: parcel.phase,
    polygon: transform.polygonToWorld(parcel.polygon),
    color: '#c8beb0',
    roofColor: '#6b5344',
    centroid: parcel.centroid,
    bounds: parcel.bounds,
    fromPlat: true,
  };
}

function generateTrees(lots, bounds) {
  const trees = [];
  const padding = 40;

  lots.forEach((lot) => {
    if (lot.type === 'commercial') return;

    const xs = lot.polygon.map(([x]) => x);
    const zs = lot.polygon.map(([, z]) => z);
    const centerX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
    const centerZ = zs.reduce((sum, value) => sum + value, 0) / zs.length;
    const width = Math.max(...xs) - Math.min(...xs);
    const depth = Math.max(...zs) - Math.min(...zs);
    const treeCount = lot.type === 'townhome' ? 1 : 2;

    for (let index = 0; index < treeCount; index += 1) {
      const seed = (lot.lotNumber || 0) * 17 + index * 31;
      const offsetX = ((seed % 100) / 100 - 0.5) * width * 0.45;
      const offsetZ = (((seed >> 3) % 100) / 100 - 0.5) * depth * 0.45;
      trees.push({
        x: centerX + offsetX,
        z: centerZ + offsetZ,
        scale: 0.7 + (seed % 3) * 0.12,
      });
    }
  });

  for (let index = 0; index < 40; index += 1) {
    const seed = index * 7919;
    trees.push({
      x: bounds.minX + padding + (seed % 1000) * ((bounds.maxX - bounds.minX - padding * 2) / 1000),
      z: bounds.minZ + padding + ((seed >> 4) % 1000) * ((bounds.maxZ - bounds.minZ - padding * 2) / 1000),
      scale: 0.75 + (index % 4) * 0.1,
    });
  }

  return trees;
}

export function buildSiteFromPlat({ manifest, sheet, lots, commercial, siteAreas = [] }) {
  const feetPerPixel = computeFeetPerPixel(lots);
  const transform = createCoordinateTransform(sheet.pixelWidth, sheet.pixelHeight, feetPerPixel);

  const residentialLots = lots.map((lot) => mapResidentialLot(lot, transform));
  const commercialLots = commercial.map((parcel) => mapCommercialLot(parcel, transform));
  const mappedSiteAreas = siteAreas.map((area) => mapSiteArea(area, transform));
  const allLots = [...residentialLots, ...commercialLots];
  const bounds = boundsFromPolygons([
    ...allLots.map((lot) => lot.polygon),
    ...mappedSiteAreas.map((area) => area.polygon),
  ]);

  const singleFamilyLots = lots.filter((lot) => lot.lotType === 'single-family').length;
  const townhomeLots = lots.filter((lot) => lot.lotType === 'townhome').length;

  return {
    project: {
      name: manifest.project || 'Delta Crossings',
      phase: sheet.title || 'Plat Map',
      location: 'Delta City, Millard County, Utah',
      disclaimer:
        '3D visualization aligned to the official preliminary plat map. Building models are conceptual; final construction may vary.',
    },
    lots: allLots,
    siteAreas: mappedSiteAreas,
    bounds,
    transform,
    sheet,
    trees: generateTrees(residentialLots, bounds),
    groundTextureUrl: groundTextureUrl(sheet.tileSource),
    stats: {
      totalLots: lots.length,
      singleFamilyLots,
      townhomeLots,
      commercialBlocks: commercial.length,
      siteAreas: mappedSiteAreas.length,
      platAligned: true,
    },
  };
}

export async function loadPlatSite(sheetId = 'sheet1') {
  const manifestResponse = await fetch(platUrl('data/manifest.json'));
  if (!manifestResponse.ok) {
    throw new Error(`Failed to load manifest: ${manifestResponse.status}`);
  }

  const manifest = await manifestResponse.json();
  const sheet = manifest.sheets.find((entry) => entry.id === sheetId);
  if (!sheet) {
    throw new Error(`Sheet not found: ${sheetId}`);
  }

  const lotsResponse = await fetch(platUrl(sheet.lotsFile));
  if (!lotsResponse.ok) {
    throw new Error(`Failed to load lots: ${lotsResponse.status}`);
  }

  const lots = await lotsResponse.json();
  let commercial = [];
  if (sheet.commercialFile) {
    const commercialResponse = await fetch(platUrl(sheet.commercialFile));
    if (commercialResponse.ok) {
      commercial = await commercialResponse.json();
    }
  }

  let siteAreas = [];
  if (sheet.siteAreasFile) {
    const siteAreasResponse = await fetch(platUrl(sheet.siteAreasFile));
    if (siteAreasResponse.ok) {
      siteAreas = await siteAreasResponse.json();
    }
  }

  return buildSiteFromPlat({ manifest, sheet, lots, commercial, siteAreas });
}
