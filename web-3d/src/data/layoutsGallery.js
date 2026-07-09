import { BUILDING_CATALOG } from './buildingCatalog';

/** Extra layout sheets beyond the primary catalog pairs. */
export const ADDITIONAL_LAYOUT_SHEETS = [
  {
    id: 'layout-townhome-option-2',
    title: 'Townhome Design Option 2',
    subtitle: 'Product summary + floor plans',
    imageUrl: './building-assets/layout-townhome-option-2.png',
    category: 'fourplex',
  },
  {
    id: 'layout-townhome-option-3',
    title: 'Townhome Design Option 3',
    subtitle: 'Modern rural farmhouse fourplex',
    imageUrl: './building-assets/layout-townhome-option-3.png',
    category: 'fourplex',
  },
  {
    id: 'layout-fourplex-option-1-alt',
    title: 'Townhome Design Option 1 (Alt)',
    subtitle: 'Rural gable fourplex sheet',
    imageUrl: './building-assets/layout-fourplex-option-1-alt.png',
    category: 'fourplex',
  },
  {
    id: 'layout-fourplex-zoning-sheet',
    title: 'R-4 Zoning Fourplex Options',
    subtitle: 'Three styles + setback diagram',
    imageUrl: './building-assets/layout-fourplex-zoning-sheet.png',
    category: 'fourplex',
  },
  {
    id: 'layout-sheet-extra-1',
    title: 'Recommended Fourplex Concept',
    subtitle: 'Rural gable · width diagram + plans',
    imageUrl: './building-assets/layout-sheet-extra-1.png',
    category: 'fourplex',
  },
  {
    id: 'layout-sheet-extra-2',
    title: 'Recommended Fourplex Concept (Detail)',
    subtitle: 'Target unit program + floor plans',
    imageUrl: './building-assets/layout-sheet-extra-2.png',
    category: 'fourplex',
  },
  {
    id: 'layout-sheet-extra-3',
    title: 'Fourplex Concepts Overview',
    subtitle: 'Three options + R-4 zoning notes',
    imageUrl: './building-assets/layout-sheet-extra-3.png',
    category: 'fourplex',
  },
];

export function getPrimaryDesignLayouts() {
  return BUILDING_CATALOG.map((design) => ({
    id: design.id,
    name: design.name,
    shortName: design.shortName,
    category: design.category,
    width: design.width,
    depth: design.depth,
    description: design.description,
    renderingUrl: design.renderingUrl,
    layoutUrl: design.layoutUrl,
    summary:
      design.category === 'single-family'
        ? `${design.width}' × ${design.depth}' · ${design.dwellingSqFt}`
        : `${design.width}' × ${design.depth}' · End ${design.endUnitSqFt} · Middle ${design.middleUnitSqFt}`,
  }));
}
