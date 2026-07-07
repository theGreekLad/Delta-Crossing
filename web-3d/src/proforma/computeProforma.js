import { computeBuildingEnvelope } from '../utils/buildingEnvelope';
import { computeFeetPerPixel, createCoordinateTransform } from '../data/platGeometry';
import { getAssumptionMap } from './assumptions';

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function getValue(map, id, fallback = 0) {
  const value = map[id];
  return Number.isFinite(value) ? value : fallback;
}

function estimateDwellingSqFt(lot, roads, transform) {
  const mapped = {
    id: lot.id,
    type: lot.lotType === 'townhome' ? 'townhome' : 'single-family',
    lotNumber: lot.lotNumber,
    polygon: transform.polygonToWorld(lot.polygon),
  };
  const envelope = computeBuildingEnvelope(mapped, { roads, transform });
  if (envelope.dwellingSqFt) return envelope.dwellingSqFt;
  if (envelope.targetSqFt) return envelope.targetSqFt;
  return lot.lotType === 'townhome' ? 1525 : 2200;
}

function phaseSortKey(phase, phaseOrder) {
  const index = phaseOrder.indexOf(phase);
  return index === -1 ? phaseOrder.length + phase : index;
}

function applyRentReservations(homeRows, phaseOrder, map) {
  const sfReserve = Math.max(0, Math.round(getValue(map, 'sf_reserved_for_rent', 0)));
  const thReserve = Math.max(0, Math.round(getValue(map, 'townhome_reserved_for_rent', 0)));

  const byType = {
    'single-family': [...homeRows.filter((row) => row.lotType === 'single-family')].sort(
      (a, b) =>
        phaseSortKey(a.phase, phaseOrder) - phaseSortKey(b.phase, phaseOrder) ||
        a.lotNumber - b.lotNumber,
    ),
    townhome: [...homeRows.filter((row) => row.lotType === 'townhome')].sort(
      (a, b) =>
        phaseSortKey(a.phase, phaseOrder) - phaseSortKey(b.phase, phaseOrder) ||
        a.lotNumber - b.lotNumber,
    ),
  };

  const rentIds = new Set();
  if (sfReserve > 0) {
    byType['single-family'].slice(-sfReserve).forEach((row) => rentIds.add(row.lotNumber));
  }
  if (thReserve > 0) {
    byType.townhome.slice(-thReserve).forEach((row) => rentIds.add(row.lotNumber));
  }

  return homeRows.map((row) => ({
    ...row,
    disposition: rentIds.has(row.lotNumber) ? 'rent' : 'sale',
  }));
}

function computeVerticalCost(dwellingSqFt, map) {
  const base = getValue(map, 'sf_construction_cost_per_sqft', 168);
  const waste = getValue(map, 'material_waste_pct', 0.07);
  const labor = getValue(map, 'labor_overhead_pct', 0.1);
  return dwellingSqFt * base * (1 + waste) * (1 + labor);
}

function computeHomeCost(lot, shared, map) {
  const dwellingSqFt = lot.dwellingSqFt;
  const verticalHard = computeVerticalCost(dwellingSqFt, map);
  const soft = verticalHard * getValue(map, 'soft_cost_pct', 0.08);
  const direct =
    shared.landPerHome +
    shared.engineeringPerHome +
    shared.studiesPerHome +
    shared.infraPerHome +
    verticalHard +
    soft;
  const contingency = direct * getValue(map, 'contingency_pct', 0.05);
  return {
    dwellingSqFt,
    land: shared.landPerHome,
    engineering: shared.engineeringPerHome,
    studies: shared.studiesPerHome,
    infrastructure: shared.infraPerHome,
    verticalHard,
    soft,
    contingency,
    total: direct + contingency,
  };
}


function computeRoadAreaSubtraction({ lots, map }) {
  const totalSiteSqFt = getValue(map, 'total_site_acres', 52) * 43560;
  const sfSqFt = sum(
    lots.filter((lot) => lot.lotType === 'single-family').map((lot) => lot.squareFeet || 0),
  );
  const thSqFt = sum(
    lots.filter((lot) => lot.lotType === 'townhome').map((lot) => lot.squareFeet || 0),
  );
  const commercialSqFt = getValue(map, 'commercial_site_acres', 4) * 43560;
  const designatedSqFt = getValue(map, 'designated_site_acres', 0) * 43560;
  const residentialSqFt = sfSqFt + thSqFt;
  const parcelSqFt = residentialSqFt + commercialSqFt + designatedSqFt;
  const roadSqFt = Math.max(0, totalSiteSqFt - parcelSqFt);

  return {
    totalSiteSqFt,
    sfSqFt,
    thSqFt,
    residentialSqFt,
    commercialSqFt,
    designatedSqFt,
    parcelSqFt,
    roadSqFt,
    warning:
      parcelSqFt > totalSiteSqFt
        ? 'Parcel areas exceed total site acreage — the plat lot annotations may nearly fill the ~52 ac assembly; reduce commercial/designated assumptions or adjust total slightly.'
        : roadSqFt < 43560
          ? 'Road remainder is small — lot annotations account for most of the site. Adjust assumptions if survey shows more street area.'
          : null,
    formula:
      'Road area = total plat acreage − single-family − townhome − commercial − designated areas',
    notes:
      'Total site (~52 ac) is the project parcel assembly. Study documents may cite different scopes.',
  };
}

function computeInfrastructureDetail(roadArea, map) {
  const rowWidth = getValue(map, 'row_width_ft', 50);
  const pavementWidth = getValue(map, 'pavement_width_ft', 24);
  const sidewalkWidth = getValue(map, 'sidewalk_width_ft', 5);
  const sewerSpacing = getValue(map, 'sewer_manhole_spacing_ft', 350);
  const stormCoverage = getValue(map, 'storm_network_coverage_pct', 0.85);

  const roadSqFt = roadArea.roadSqFt;
  const centerlineLf = rowWidth > 0 ? roadSqFt / rowWidth : 0;
  const pavementSqFt = centerlineLf * pavementWidth;
  const sidewalkSqFt = centerlineLf * 2 * sidewalkWidth;
  const curbGutterLf = centerlineLf * 2;
  const waterMainLf = centerlineLf;
  const sewerMainLf = centerlineLf;
  const stormDrainLf = centerlineLf * stormCoverage;
  const utilityTrenchLf = centerlineLf;
  const sewerManholes = Math.ceil(sewerMainLf / sewerSpacing);
  const stormManholes = Math.ceil(stormDrainLf / 400);

  const lineItems = [
    {
      id: 'grading',
      label: 'Road corridor grading & base',
      quantity: roadSqFt,
      unit: 'sqft',
      unitCost: getValue(map, 'road_grading_per_sqft', 1.25),
      ordinanceRef: 'ST-103 base course & granular borrow',
    },
    {
      id: 'asphalt',
      label: 'Asphalt pavement',
      quantity: pavementSqFt,
      unit: 'sqft',
      unitCost: getValue(map, 'asphalt_paving_per_sqft', 4.5),
      ordinanceRef: 'ST-103 hot mix asphalt',
    },
    {
      id: 'curb',
      label: 'Curb & gutter (both sides)',
      quantity: curbGutterLf,
      unit: 'LF',
      unitCost: getValue(map, 'curb_gutter_per_lf', 27),
      ordinanceRef: 'ST-121 curb & gutter',
    },
    {
      id: 'sidewalk',
      label: 'Concrete sidewalks (both sides)',
      quantity: sidewalkSqFt,
      unit: 'sqft',
      unitCost: getValue(map, 'sidewalk_concrete_per_sqft', 12),
      ordinanceRef: 'ST-131 4" sidewalk against curb',
    },
    {
      id: 'water',
      label: 'Culinary water main (blue PVC)',
      quantity: waterMainLf,
      unit: 'LF',
      unitCost: getValue(map, 'water_main_per_lf', 85),
      ordinanceRef: 'ST-113 / AWWA C900 PVC',
    },
    {
      id: 'sewer',
      label: 'Sanitary sewer main (PVC)',
      quantity: sewerMainLf,
      unit: 'LF',
      unitCost: getValue(map, 'sewer_main_per_lf', 95),
      ordinanceRef: 'ST-113 opposite water line',
    },
    {
      id: 'sewer_manholes',
      label: 'Sewer manholes (precast)',
      quantity: sewerManholes,
      unit: 'each',
      unitCost: getValue(map, 'sewer_manhole_each', 4500),
      ordinanceRef: 'Max 350\' spacing per Ord. 2025-317',
    },
    {
      id: 'storm',
      label: 'Storm drain (HDPE)',
      quantity: stormDrainLf,
      unit: 'LF',
      unitCost: getValue(map, 'storm_drain_per_lf', 75),
      ordinanceRef: 'Black corrugated HDPE',
    },
    {
      id: 'storm_manholes',
      label: 'Storm drain manholes',
      quantity: stormManholes,
      unit: 'each',
      unitCost: getValue(map, 'storm_manhole_each', 5500),
      ordinanceRef: 'Precast eccentric cone',
    },
    {
      id: 'utilities',
      label: 'Gas / power / telecom trenching',
      quantity: utilityTrenchLf,
      unit: 'LF',
      unitCost: getValue(map, 'utility_trench_per_lf', 35),
      ordinanceRef: 'Joint utility corridor',
    },
  ].map((item) => ({
    ...item,
    amount: item.quantity * item.unitCost,
  }));

  const totalInfraBudget = sum(lineItems.map((item) => item.amount));

  return {
    roadArea,
    totalRoadSqFt: roadSqFt,
    totalRoadLf: centerlineLf,
    pavementSqFt,
    sidewalkLf: centerlineLf * 2,
    sidewalkSqFt,
    curbGutterLf,
    lineItems,
    totalInfraBudget,
    ordinanceNote:
      'Quantities derived from road area and Ord. 2025-317 typical sections (ST-103 50\' ROW, ST-113 utility placement, ST-131 sidewalks). Costs use cited unit-rate assumptions.',
  };
}

function simulatePhaseWaterfall(phaseResults, map) {
  let cash = getValue(map, 'initial_equity', 500000);
  let debt = 0;
  const loanRate = getValue(map, 'construction_loan_rate', 0.085);
  const loanAdvance = getValue(map, 'construction_loan_advance_pct', 0.7);
  const salesRate = getValue(map, 'homes_sold_per_month', 3);

  const timeline = [];

  phaseResults.forEach((phase) => {
    const phaseCost = phase.totalCost;
    const sellable = phase.homes.filter((home) => home.disposition === 'sale');
    const saleMonths = Math.max(1, Math.ceil(sellable.length / salesRate));

    const financingNeed = Math.max(0, phaseCost - cash);
    const draw = financingNeed * loanAdvance;
    debt += draw;
    cash += draw;
    cash -= phaseCost;

    const interest = debt * loanRate * (saleMonths / 12);
    cash -= interest;
    debt += interest;

    let proceeds = 0;
    let soldSoFar = 0;
    for (let month = 1; month <= saleMonths; month += 1) {
      const batch = sellable.slice(soldSoFar, soldSoFar + salesRate);
      soldSoFar += batch.length;
      const monthProceeds = sum(batch.map((home) => home.salePrice));
      proceeds += monthProceeds;
      cash += monthProceeds;
      const paydown = Math.min(debt, monthProceeds * 0.85);
      debt -= paydown;
    }

    timeline.push({
      ...phase,
      sellableCount: sellable.length,
      reservedCount: phase.homeCount - sellable.length,
      saleMonths,
      saleProceeds: proceeds,
      financingDraw: draw,
      interest,
      cashAfterPhase: cash,
      debtAfterPhase: debt,
      netProfit: proceeds - phaseCost - interest,
    });
  });

  return { timeline, endingCash: cash, endingDebt: debt };
}

function computeRentalHoldout(reservedHomes, map, endingDebt, endingCash) {
  const sfUnits = reservedHomes.filter((home) => home.lotType === 'single-family');
  const thUnits = reservedHomes.filter((home) => home.lotType === 'townhome');
  const sfRent = getValue(map, 'sf_rent_monthly', 2200);
  const thRent = getValue(map, 'townhome_rent_monthly', 1750);
  const opex = getValue(map, 'rental_opex_per_unit_year', 6000);
  const vacancy = getValue(map, 'rental_vacancy_pct', 0.05);

  const annualGross =
    sfUnits.length * sfRent * 12 + thUnits.length * thRent * 12;
  const annualEffective = annualGross * (1 - vacancy);
  const annualOpex = reservedHomes.length * opex;
  const annualNoi = annualEffective - annualOpex;

  const debtRetired = endingDebt <= 0;
  const hasReserves = reservedHomes.length > 0;
  const activated = debtRetired && hasReserves;

  let reason;
  if (!hasReserves) {
    reason = 'No units reserved for rent. Increase the reserve counts in assumptions to model rental holdout.';
  } else if (!debtRetired) {
    reason =
      'Reserved units convert to rentals after construction debt is fully repaid from for-sale proceeds.';
  } else {
    reason = `${reservedHomes.length} reserved units (${sfUnits.length} SF, ${thUnits.length} townhome) generating rental income.`;
  }

  return {
    units: reservedHomes.length,
    sfUnits: sfUnits.length,
    townhomeUnits: thUnits.length,
    activated,
    reason,
    sfRent,
    townhomeRent: thRent,
    annualNoi: activated ? annualNoi : 0,
    potentialAnnualNoi: annualNoi,
    capValueAt5Pct: annualNoi / 0.05,
    reservedHomes,
  };
}

export function computeProforma({
  defaults,
  lots,
  commercial = [],
  siteAreas = [],
  sheet,
  phaseOrder,
}) {
  const map = getAssumptionMap(defaults);
  const feetPerPixel = computeFeetPerPixel(lots);
  const transform = createCoordinateTransform(sheet.pixelWidth, sheet.pixelHeight, feetPerPixel);
  const roads = sheet.roads || [];

  const residentialLots = lots.filter((lot) => lot.lotNumber);
  const sfLots = residentialLots.filter((lot) => lot.lotType === 'single-family');
  const townhomeLots = residentialLots.filter((lot) => lot.lotType === 'townhome');
  const totalHomes = sfLots.length + townhomeLots.length + commercial.length;

  const sfSalePrice = getValue(map, 'sf_sale_price', 485000);
  const townhomeSalePrice = getValue(map, 'townhome_sale_price', 385000);

  const enrichedLots = residentialLots.map((lot) => ({
    ...lot,
    dwellingSqFt: estimateDwellingSqFt(lot, roads, transform),
  }));

  const roadArea = computeRoadAreaSubtraction({
    lots: residentialLots,
    map,
  });
  const infrastructure = computeInfrastructureDetail(roadArea, map);

  const shared = {
    landPerHome: getValue(map, 'land_cost_total', 1835000) / Math.max(totalHomes, 1),
    engineeringPerHome: getValue(map, 'engineering_total', 110000) / Math.max(totalHomes, 1),
    studiesPerHome: getValue(map, 'studies_total', 17500) / Math.max(totalHomes, 1),
    infraPerHome:
      infrastructure.totalInfraBudget / Math.max(sfLots.length + townhomeLots.length, 1),
  };

  const orderedPhases = phaseOrder || defaults.phaseOrder || [1, 3, 4, 5, 6, 7];

  let homeRows = enrichedLots.map((lot) => {
    const costs = computeHomeCost(lot, shared, map);
    const salePrice = lot.lotType === 'townhome' ? townhomeSalePrice : sfSalePrice;
    return {
      lotNumber: lot.lotNumber,
      phase: lot.phase,
      lotType: lot.lotType,
      lotSqFt: lot.squareFeet,
      dwellingSqFt: costs.dwellingSqFt,
      costs,
      salePrice,
      grossMargin: salePrice - costs.total,
      disposition: 'sale',
    };
  });

  homeRows = applyRentReservations(homeRows, orderedPhases, map);
  homeRows.forEach((row) => {
    if (row.disposition === 'rent') {
      row.grossMargin = -row.costs.total;
    }
  });

  const forSaleHomes = homeRows.filter((row) => row.disposition === 'sale');
  const reservedHomes = homeRows.filter((row) => row.disposition === 'rent');

  const phasesWithHomes = [...new Set(homeRows.map((row) => row.phase))].sort(
    (a, b) => phaseSortKey(a, orderedPhases) - phaseSortKey(b, orderedPhases),
  );

  const phaseResults = phasesWithHomes.map((phase) => {
    const phaseHomes = homeRows.filter((row) => row.phase === phase);
    const sellable = phaseHomes.filter((row) => row.disposition === 'sale');
    const totalCost = sum(phaseHomes.map((row) => row.costs.total));
    const totalRevenue = sum(sellable.map((row) => row.salePrice));
    const totalMargin = totalRevenue - totalCost;
    return {
      phase,
      homeCount: phaseHomes.length,
      sellableCount: sellable.length,
      reservedCount: phaseHomes.length - sellable.length,
      homes: phaseHomes,
      totalCost,
      totalRevenue,
      totalMargin,
      avgCostPerHome: phaseHomes.length ? totalCost / phaseHomes.length : 0,
      avgRevenuePerHome: sellable.length ? totalRevenue / sellable.length : 0,
    };
  });

  const waterfall = simulatePhaseWaterfall(phaseResults, map);
  const rentalHoldout = computeRentalHoldout(
    reservedHomes,
    map,
    waterfall.endingDebt,
    waterfall.endingCash,
  );

  const projectTotals = {
    singleFamilyHomes: sfLots.length,
    townhomeLots: townhomeLots.length,
    commercialBlocks: commercial.length,
    forSaleHomes: forSaleHomes.length,
    reservedForRent: reservedHomes.length,
    sfForSale: forSaleHomes.filter((row) => row.lotType === 'single-family').length,
    sfReserved: reservedHomes.filter((row) => row.lotType === 'single-family').length,
    townhomeForSale: forSaleHomes.filter((row) => row.lotType === 'townhome').length,
    townhomeReserved: reservedHomes.filter((row) => row.lotType === 'townhome').length,
    totalDevelopmentCost: sum(homeRows.map((row) => row.costs.total)),
    totalSaleRevenue: sum(forSaleHomes.map((row) => row.salePrice)),
    totalGrossMargin: sum(forSaleHomes.map((row) => row.grossMargin)),
    avgCostPerHome: homeRows.length ? sum(homeRows.map((row) => row.costs.total)) / homeRows.length : 0,
    avgDwellingSqFt: homeRows.length ? sum(homeRows.map((row) => row.dwellingSqFt)) / homeRows.length : 0,
  };

  return {
    map,
    shared,
    infrastructure,
    homeRows,
    forSaleHomes,
    reservedHomes,
    phaseResults,
    waterfall,
    rentalHoldout,
    projectTotals,
    meta: {
      model: defaults.model,
      phaseOrder: orderedPhases,
      ordinanceRef: defaults.ordinanceRef,
    },
  };
}
