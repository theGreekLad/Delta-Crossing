import { computeBuildingEnvelope } from '../utils/buildingEnvelope';
import { computeFeetPerPixel, createCoordinateTransform } from '../data/platGeometry';
import { getAssumptionMap } from './assumptions';

/** Fixed dimensions from Ord. 2025-317 (ST-103, ST-113, ST-131). ROW width comes from the plat. */
const ORDINANCE_SPECS = {
  pavementWidthFt: 24,
  sidewalkWidthFt: 5,
  sewerManholeSpacingFt: 350,
  stormManholeSpacingFt: 400,
  stormNetworkCoveragePct: 0.85,
};

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

function computeWaterRights({ sfLots, townhomeLots, commercialCount }, map) {
  const afPerLot = getValue(map, 'water_rights_af_per_lot', 1.0);
  const afPerCommercial = getValue(map, 'water_rights_af_per_commercial', 1.0);
  const costPerAcreFoot = getValue(map, 'water_rights_cost_per_acre_foot', 10000);

  const sfAcreFeet = sfLots * afPerLot;
  const townhomeAcreFeet = townhomeLots * afPerLot;
  const commercialAcreFeet = commercialCount * afPerCommercial;
  const totalAcreFeet = sfAcreFeet + townhomeAcreFeet + commercialAcreFeet;
  const total = totalAcreFeet * costPerAcreFoot;

  return {
    sfLots,
    townhomeLots,
    commercialCount,
    afPerLot,
    afPerCommercial,
    sfAcreFeet,
    townhomeAcreFeet,
    commercialAcreFeet,
    totalAcreFeet,
    costPerAcreFoot,
    total,
    formula:
      'Culinary water rights = (SF lots + townhome lots + commercial) × AF/lot × city purchase rate',
    ordinanceRef:
      'Millard County Subdivision Ord. § 11-1-20 — minimum 1.0 AF dedicated per platted lot',
    notes:
      'Plat approval requires culinary water rights at 1.0 acre-foot per lot (Millard County). ' +
      'Rights are purchased through Delta City at the per-acre-foot rate below.',
  };
}

function computeHomeCost(lot, shared, map) {
  const dwellingSqFt = lot.dwellingSqFt;
  const verticalHard = computeVerticalCost(dwellingSqFt, map);
  const total =
    shared.landPerHome +
    shared.engineeringPerHome +
    shared.studiesPerHome +
    shared.waterRightsPerHome +
    shared.infraPerHome +
    verticalHard;
  return {
    dwellingSqFt,
    land: shared.landPerHome,
    engineering: shared.engineeringPerHome,
    studies: shared.studiesPerHome,
    waterRights: shared.waterRightsPerHome,
    infrastructure: shared.infraPerHome,
    verticalHard,
    total,
  };
}


function computeRoadAreaFromSegments(roadSegments) {
  if (!roadSegments?.segments?.length) {
    return {
      method: 'missing',
      roadSqFt: 0,
      centerlineLf: 0,
      rowHalfWidthFt: 30,
      rowWidthFt: 60,
      segmentCount: 0,
      segments: [],
      rowMarkerCount: 0,
      warning: 'Road segment data not loaded. Run extract_plat to generate sheet1-road-segments.json.',
      formula: 'Road area = sum(centerline segment lengths from plat) × ROW width',
      notes: null,
    };
  }

  const rowWidthFt = roadSegments.rowWidthFt || 60;
  const centerlineLf = roadSegments.centerlineLf || sum(roadSegments.segments.map((s) => s.lengthFt || 0));
  const roadSqFt = roadSegments.roadSqFt || centerlineLf * rowWidthFt;

  return {
    method: 'plat-annotation',
    roadSqFt,
    centerlineLf,
    rowHalfWidthFt: roadSegments.rowHalfWidthFt || rowWidthFt / 2,
    rowWidthFt,
    segmentCount: roadSegments.segmentCount || roadSegments.segments.length,
    segments: roadSegments.segments,
    rowMarkerCount: roadSegments.rowMarkerCount || 0,
    warning: null,
    formula:
      roadSegments.formula ||
      'Road area = sum(centerline segment lengths from plat) × ROW width (30\' each side = 60\' total)',
    notes:
      roadSegments.notes ||
      'Parsed from plat PDF length annotations in road corridors with 30\' ROW markers.',
  };
}

function computeInfrastructureDetail(roadArea, map) {
  const rowWidthFt = roadArea.rowWidthFt || 60;
  const { pavementWidthFt, sidewalkWidthFt, sewerManholeSpacingFt, stormManholeSpacingFt, stormNetworkCoveragePct } =
    ORDINANCE_SPECS;

  const roadSqFt = roadArea.roadSqFt;
  const centerlineLf = roadArea.centerlineLf || 0;
  const pavementSqFt = centerlineLf * pavementWidthFt;
  const sidewalkSqFt = centerlineLf * 2 * sidewalkWidthFt;
  const curbGutterLf = centerlineLf * 2;
  const waterMainLf = centerlineLf;
  const sewerMainLf = centerlineLf;
  const stormDrainLf = centerlineLf * stormNetworkCoveragePct;
  const utilityTrenchLf = centerlineLf;
  const sewerManholes = Math.ceil(sewerMainLf / sewerManholeSpacingFt);
  const stormManholes = Math.ceil(stormDrainLf / stormManholeSpacingFt);

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
    ordinanceSpecs: {
      rowWidthFt,
      ...ORDINANCE_SPECS,
    },
    totalRoadSqFt: roadSqFt,
    totalRoadLf: centerlineLf,
    pavementSqFt,
    sidewalkLf: centerlineLf * 2,
    sidewalkSqFt,
    curbGutterLf,
    lineItems,
    totalInfraBudget,
    ordinanceNote:
      `Quantities from plat centerline (${formatLf(centerlineLf)}) and Ord. 2025-317: ` +
      `${rowWidthFt}' ROW (plat), ${pavementWidthFt}' pavement (ST-103), ` +
      `${sidewalkWidthFt}' sidewalks both sides (ST-131), utilities in ROW (ST-113). ` +
      'Unit costs are editable assumptions.',
  };
}

function formatLf(value) {
  return `${Math.round(value).toLocaleString()} LF`;
}

function npvAtRate(rate, cashFlows) {
  return cashFlows.reduce((total, cf, month) => total + cf / (1 + rate) ** month, 0);
}

function computeIrr(cashFlows) {
  if (!cashFlows.length || cashFlows.every((cf) => Math.abs(cf) < 1)) return null;

  // Search realistic monthly rate bands only. A wide lower bound near -1 creates spurious roots.
  const bands = [
    [0, 0.25],
    [-0.2, 0],
    [0.25, 0.75],
  ];

  for (const [low, high] of bands) {
    const monthlyRate = bisectMonthlyRate(cashFlows, low, high);
    if (monthlyRate != null) {
      return (1 + monthlyRate) ** 12 - 1;
    }
  }

  return null;
}

function bisectMonthlyRate(cashFlows, low, high) {
  let lowNpv = npvAtRate(low, cashFlows);
  let highNpv = npvAtRate(high, cashFlows);
  if (lowNpv * highNpv > 0) return null;

  for (let i = 0; i < 80; i += 1) {
    const mid = (low + high) / 2;
    const midNpv = npvAtRate(mid, cashFlows);
    if (Math.abs(midNpv) < 1) return mid;
    if (midNpv * lowNpv > 0) {
      low = mid;
      lowNpv = midNpv;
    } else {
      high = mid;
      highNpv = midNpv;
    }
  }

  return (low + high) / 2;
}

function coverCashShortfall(cash, debt, loanAdvance) {
  if (cash >= 0) {
    return { cash, debt, equityInjection: 0, loanDraw: 0 };
  }

  const shortfall = -cash;
  const loanDraw = shortfall * loanAdvance;
  const equityInjection = shortfall - loanDraw;
  return {
    cash: cash + loanDraw + equityInjection,
    debt: debt + loanDraw,
    equityInjection,
    loanDraw,
  };
}

function computeFinancials(phaseResults, map, rentalHoldout, projectTotals, waterfall) {
  const initialEquity = getValue(map, 'initial_equity', 500000);
  const loanRate = getValue(map, 'construction_loan_rate', 0.085);
  const loanAdvance = getValue(map, 'construction_loan_advance_pct', 0.7);
  const salesRate = getValue(map, 'homes_sold_per_month', 3);
  const monthsToBuild = getValue(map, 'months_to_build_home', 3);
  const parallelHomes = getValue(map, 'parallel_homes_per_phase', 6);
  const discountRate = 0.1;

  let cash = initialEquity;
  let debt = 0;
  let month = 0;
  let totalEquityInvested = initialEquity;
  let totalInterest = 0;
  let peakDebt = 0;
  let totalLoanDraws = 0;
  let totalSaleProceeds = 0;
  let totalEquityDistributions = 0;
  let paybackMonth = null;
  let cumulativeEquityReturn = 0;

  const equityCashFlows = [-initialEquity];
  const monthlyRows = [];
  const phaseTimeline = [];

  phaseResults.forEach((phase) => {
    const sellable = phase.homes.filter((home) => home.disposition === 'sale');
    const buildMonths = Math.max(1, Math.ceil(phase.homeCount / parallelHomes) * monthsToBuild);
    const saleMonths = Math.max(1, Math.ceil(sellable.length / salesRate));
    const monthlyBuildCost = phase.totalCost / buildMonths;
    const phaseStartMonth = month + 1;

    for (let buildMonth = 0; buildMonth < buildMonths; buildMonth += 1) {
      month += 1;
      const monthlyInterest = debt * (loanRate / 12);
      totalInterest += monthlyInterest;
      cash -= monthlyBuildCost + monthlyInterest;
      debt += monthlyInterest;

      const coverage = coverCashShortfall(cash, debt, loanAdvance);
      cash = coverage.cash;
      debt = coverage.debt;
      totalEquityInvested += coverage.equityInjection;
      totalLoanDraws += coverage.loanDraw;
      peakDebt = Math.max(peakDebt, debt);

      let equityFlow = -coverage.equityInjection;
      cumulativeEquityReturn += equityFlow;
      equityCashFlows.push(equityFlow);

      monthlyRows.push({
        month,
        phase: phase.phase,
        stage: 'construction',
        label: `Phase ${phase.phase} construction`,
        equityFlow,
        equityInjection: coverage.equityInjection,
        loanDraw: coverage.loanDraw,
        interest: monthlyInterest,
        buildSpend: monthlyBuildCost,
        saleProceeds: 0,
        debt,
        cash,
        cumulativeEquityReturn,
      });
    }

    let soldSoFar = 0;
    for (let saleMonth = 0; saleMonth < saleMonths; saleMonth += 1) {
      month += 1;
      const monthlyInterest = debt * (loanRate / 12);
      totalInterest += monthlyInterest;
      cash -= monthlyInterest;
      debt += monthlyInterest;

      const batch = sellable.slice(soldSoFar, soldSoFar + salesRate);
      soldSoFar += batch.length;
      const monthProceeds = sum(batch.map((home) => home.salePrice));
      totalSaleProceeds += monthProceeds;
      cash += monthProceeds;

      const paydown = Math.min(debt, monthProceeds * 0.85);
      debt -= paydown;
      const netToEquity = monthProceeds - paydown;
      totalEquityDistributions += netToEquity;
      cumulativeEquityReturn += netToEquity;

      if (paybackMonth == null && cumulativeEquityReturn >= 0) {
        paybackMonth = month;
      }

      peakDebt = Math.max(peakDebt, debt);

      monthlyRows.push({
        month,
        phase: phase.phase,
        stage: 'sales',
        label: `Phase ${phase.phase} sales (${batch.length} homes)`,
        equityFlow: netToEquity,
        equityInjection: 0,
        loanDraw: 0,
        interest: monthlyInterest,
        buildSpend: 0,
        saleProceeds: monthProceeds,
        debtPaydown: paydown,
        debt,
        cash,
        cumulativeEquityReturn,
      });
    }

    phaseTimeline.push({
      phase: phase.phase,
      startMonth: phaseStartMonth,
      buildMonths,
      saleMonths,
      endMonth: month,
      homeCount: phase.homeCount,
      sellableCount: sellable.length,
      totalCost: phase.totalCost,
      totalRevenue: phase.totalRevenue,
    });
  });

  const rentalTerminalValue =
    rentalHoldout.activated && rentalHoldout.potentialAnnualNoi > 0
      ? rentalHoldout.potentialAnnualNoi / 0.05
      : 0;
  const exitEquity = cash - debt + rentalTerminalValue;
  if (Math.abs(exitEquity) > 1) {
    equityCashFlows.push(exitEquity);
    cumulativeEquityReturn += exitEquity;
    month += 1;
    monthlyRows.push({
      month,
      phase: null,
      stage: 'exit',
      label: rentalTerminalValue > 0 ? 'Exit — cash, debt retirement & rental value' : 'Exit — remaining equity',
      equityFlow: exitEquity,
      equityInjection: 0,
      loanDraw: 0,
      interest: 0,
      buildSpend: 0,
      saleProceeds: 0,
      debt,
      cash,
      cumulativeEquityReturn,
      rentalTerminalValue,
    });
  }

  const irr = computeIrr(equityCashFlows);
  const netProfit = exitEquity - totalEquityInvested;
  const equityMultiple =
    totalEquityInvested > 0 ? Math.max(exitEquity, 0) / totalEquityInvested : null;
  const returnOnCost =
    projectTotals.totalDevelopmentCost > 0
      ? netProfit / projectTotals.totalDevelopmentCost
      : null;
  const profitMargin =
    projectTotals.totalSaleRevenue > 0
      ? projectTotals.totalGrossMargin / projectTotals.totalSaleRevenue
      : null;
  const npv = npvAtRate(discountRate / 12, equityCashFlows);

  return {
    irr,
    equityMultiple,
    returnOnCost,
    profitMargin,
    netProfit,
    totalEquityInvested,
    totalInterest,
    totalLoanDraws,
    totalSaleProceeds,
    peakDebt,
    projectDurationMonths: month,
    paybackMonth,
    exitEquity,
    rentalTerminalValue,
    endingCash: waterfall.endingCash,
    endingDebt: waterfall.endingDebt,
    npvAt10Pct: npv,
    equityCashFlows,
    monthlyRows,
    phaseTimeline,
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
  roadSegments = null,
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

  const roadArea = computeRoadAreaFromSegments(roadSegments);
  const infrastructure = computeInfrastructureDetail(roadArea, map);
  const waterRights = computeWaterRights(
    {
      sfLots: sfLots.length,
      townhomeLots: townhomeLots.length,
      commercialCount: commercial.length,
    },
    map,
  );

  const shared = {
    landPerHome: getValue(map, 'land_cost_total', 4000000) / Math.max(totalHomes, 1),
    engineeringPerHome: getValue(map, 'engineering_total', 110000) / Math.max(totalHomes, 1),
    studiesPerHome: getValue(map, 'studies_total', 17500) / Math.max(totalHomes, 1),
    waterRightsPerHome: waterRights.total / Math.max(totalHomes, 1),
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
    waterRightsTotal: waterRights.total,
    avgCostPerHome: homeRows.length ? sum(homeRows.map((row) => row.costs.total)) / homeRows.length : 0,
    avgDwellingSqFt: homeRows.length ? sum(homeRows.map((row) => row.dwellingSqFt)) / homeRows.length : 0,
  };

  const financials = computeFinancials(
    phaseResults,
    map,
    rentalHoldout,
    projectTotals,
    waterfall,
  );

  return {
    map,
    shared,
    waterRights,
    infrastructure,
    homeRows,
    forSaleHomes,
    reservedHomes,
    phaseResults,
    waterfall,
    rentalHoldout,
    financials,
    projectTotals,
    meta: {
      model: defaults.model,
      phaseOrder: orderedPhases,
      ordinanceRef: defaults.ordinanceRef,
    },
  };
}
