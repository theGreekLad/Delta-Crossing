/**
 * Delta City R-4 residential standards (DCC 18.24.040).
 * Delta Crossings was rezoned M-H → R-4 (Ord. 23-300, effective 2023-04-19).
 */
export const R4_ZONING = {
  zone: 'R-4',
  source: 'Delta City Code 18.24.040 (Single and Multi-Family Residential R-4 Zone)',

  setbacks: {
    front: 25,
    rear: 10,
    side: 10,
    cornerStreetSide: 20,
  },

  maxStructureHeightFt: 35,
  modelHeightFt: 12,

  minLotAreaSqFt: 7500,
  minLotWidthFt: 70,
  minCornerLotWidthFt: 75,

  singleFamily: {
    targetSqFtMin: 2000,
    targetSqFtMax: 2500,
    footprintAspect: 1.35,
  },

  townhome: {
    footprintAspect: 1.2,
  },
};
