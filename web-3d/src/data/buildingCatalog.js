/** @typedef {'gable' | 'low-pitch' | 'craftsman-gable'} RoofType */
/** @typedef {'fourplex' | 'single-family'} BuildingCategory */

/**
 * @typedef {Object} BuildingStyle
 * @property {string} bodyLight
 * @property {string} bodyDark
 * @property {string} roof
 * @property {string} stone
 * @property {string} garage
 * @property {string} trim
 * @property {RoofType} roofType
 * @property {number} wallHeight
 */

/**
 * @typedef {Object} BuildingDesign
 * @property {string} id
 * @property {string} name
 * @property {string} shortName
 * @property {BuildingCategory} category
 * @property {number} width
 * @property {number} depth
 * @property {number[]} [unitWidths]
 * @property {string} renderingUrl
 * @property {string} layoutUrl
 * @property {string} [endUnitSqFt]
 * @property {string} [middleUnitSqFt]
 * @property {string} [dwellingSqFt]
 * @property {string} description
 * @property {BuildingStyle} style
 */

/** @type {BuildingDesign[]} */
export const BUILDING_CATALOG = [
  {
    id: 'fourplex-rural-gable',
    name: 'Rural Gable Fourplex',
    shortName: 'Rural Gable',
    category: 'fourplex',
    width: 108,
    depth: 40,
    unitWidths: [30, 24, 24, 30],
    renderingUrl: './building-assets/fourplex-rural-gable-rendering.png',
    layoutUrl: './building-assets/fourplex-rural-gable-layout.png',
    endUnitSqFt: '1,760 – 1,800 SF',
    middleUnitSqFt: '1,380 – 1,450 SF',
    description: 'Modern farmhouse fourplex with white board-and-batten, dark gables, and stone accents.',
    style: {
      bodyLight: '#f2f0ea',
      bodyDark: '#d9cbb8',
      roof: '#3d3a36',
      stone: '#8a857c',
      garage: '#2a2a2a',
      trim: '#5c4a3a',
      roofType: 'gable',
      wallHeight: 16,
    },
  },
  {
    id: 'fourplex-low-pitch',
    name: 'Low Pitch Modern Rural',
    shortName: 'Low Pitch',
    category: 'fourplex',
    width: 108,
    depth: 38,
    unitWidths: [30, 24, 24, 30],
    renderingUrl: './building-assets/fourplex-low-pitch-rendering.png',
    layoutUrl: './building-assets/fourplex-low-pitch-layout.png',
    endUnitSqFt: '1,800 – 1,900 SF',
    middleUnitSqFt: '1,250 – 1,400 SF',
    description: 'Contemporary rural look with grey and wood siding and a low 3:12 roof pitch.',
    style: {
      bodyLight: '#b8b5ae',
      bodyDark: '#8a6f55',
      roof: '#4a4f54',
      stone: '#7a7570',
      garage: '#333333',
      trim: '#6a6e72',
      roofType: 'low-pitch',
      wallHeight: 18,
    },
  },
  {
    id: 'fourplex-craftsman',
    name: 'Craftsman Fourplex',
    shortName: 'Craftsman',
    category: 'fourplex',
    width: 108,
    depth: 40,
    unitWidths: [30, 24, 24, 30],
    renderingUrl: './building-assets/fourplex-craftsman-rendering.png',
    layoutUrl: './building-assets/fourplex-craftsman-layout.png',
    endUnitSqFt: '1,900 – 2,000 SF',
    middleUnitSqFt: '1,200 – 1,300 SF',
    description: 'Craftsman style with multiple gables, shingle accents, and stone porch pedestals.',
    style: {
      bodyLight: '#e0d4c4',
      bodyDark: '#c4a882',
      roof: '#4a3f36',
      stone: '#9a9088',
      garage: '#2c2c2c',
      trim: '#6b5344',
      roofType: 'craftsman-gable',
      wallHeight: 16,
    },
  },
  {
    id: 'sf-rural-gable',
    name: 'Rural Gable Farmhouse',
    shortName: 'Rural Gable',
    category: 'single-family',
    width: 42,
    depth: 48,
    renderingUrl: './building-assets/sf-rural-gable-rendering.png',
    layoutUrl: './building-assets/sf-rural-gable-layout.png',
    dwellingSqFt: '2,100 – 2,250 SF',
    description: 'Modern farmhouse single-family with white board-and-batten, dark gables, and a 2-car garage.',
    style: {
      bodyLight: '#f2f0ea',
      bodyDark: '#e8e4dc',
      roof: '#3d3a36',
      stone: '#8a857c',
      garage: '#2a2a2a',
      trim: '#5c4a3a',
      roofType: 'gable',
      wallHeight: 18,
    },
  },
  {
    id: 'sf-low-pitch',
    name: 'Low Pitch Modern Rural',
    shortName: 'Low Pitch',
    category: 'single-family',
    width: 40,
    depth: 50,
    renderingUrl: './building-assets/sf-low-pitch-rendering.png',
    layoutUrl: './building-assets/sf-low-pitch-layout.png',
    dwellingSqFt: '2,200 – 2,350 SF',
    description: 'Contemporary rural single-family with grey/wood siding and a low-pitch roof.',
    style: {
      bodyLight: '#b8b5ae',
      bodyDark: '#8a6f55',
      roof: '#4a4f54',
      stone: '#7a7570',
      garage: '#333333',
      trim: '#6a6e72',
      roofType: 'low-pitch',
      wallHeight: 18,
    },
  },
  {
    id: 'sf-craftsman',
    name: 'Craftsman Cottage',
    shortName: 'Craftsman',
    category: 'single-family',
    width: 44,
    depth: 46,
    renderingUrl: './building-assets/sf-craftsman-rendering.png',
    layoutUrl: './building-assets/sf-craftsman-layout.png',
    dwellingSqFt: '2,300 – 2,450 SF',
    description: 'Craftsman single-family with multi-gable roof, shingle accents, and stone porch pedestals.',
    style: {
      bodyLight: '#e0d4c4',
      bodyDark: '#c4a882',
      roof: '#4a3f36',
      stone: '#9a9088',
      garage: '#2c2c2c',
      trim: '#6b5344',
      roofType: 'craftsman-gable',
      wallHeight: 18,
    },
  },
];

export const MIN_FOURPLEX_WIDTH = 100;
export const MIN_SF_WIDTH = 36;

/**
 * @param {string} designId
 * @returns {BuildingDesign | undefined}
 */
export function getDesignById(designId) {
  return BUILDING_CATALOG.find((design) => design.id === designId);
}

/**
 * @param {{ type?: string } | null | undefined} lot
 * @returns {BuildingDesign[]}
 */
export function getCatalogForLot(lot) {
  if (!lot || lot.type === 'commercial') return [];
  if (lot.type === 'townhome') {
    return BUILDING_CATALOG.filter((design) => design.category === 'fourplex');
  }
  if (lot.type === 'single-family') {
    return BUILDING_CATALOG.filter((design) => design.category === 'single-family');
  }
  return BUILDING_CATALOG;
}

/**
 * @param {{ building?: { width?: number }; type?: string } | null | undefined} lot
 * @returns {boolean}
 */
export function lotFitsFourplex(lot) {
  if (!lot?.building) return false;
  if (lot.type === 'commercial') return false;
  return lot.building.width >= MIN_FOURPLEX_WIDTH;
}

/**
 * @param {{ building?: { width?: number }; type?: string } | null | undefined} lot
 * @returns {boolean}
 */
export function lotFitsSingleFamily(lot) {
  if (!lot?.building) return false;
  if (lot.type !== 'single-family') return false;
  return lot.building.width >= MIN_SF_WIDTH;
}

/**
 * Soft fit warning for the selected lot / catalog category.
 * @param {{ building?: { width?: number }; type?: string } | null | undefined} lot
 * @returns {string | null}
 */
export function getFitWarning(lot) {
  if (!lot?.building || lot.type === 'commercial') return null;
  if (lot.type === 'townhome' && !lotFitsFourplex(lot)) {
    return "Buildable pad may be narrow for a 108' fourplex — placement is allowed but verify setbacks.";
  }
  if (lot.type === 'single-family' && !lotFitsSingleFamily(lot)) {
    return "Buildable pad may be tight for this single-family footprint — placement is allowed but verify setbacks.";
  }
  return null;
}
