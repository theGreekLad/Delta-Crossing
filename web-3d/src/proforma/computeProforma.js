import { computeBuildingEnvelope } from '../utils/buildingEnvelope';
import { computeFeetPerPixel, createCoordinateTransform } from '../data/platGeometry';
import { getAssumptionMap } from './assumptions';

/** Soft costs from source proforma — fixed model constants (not editable assumptions). */
const FIXED_ENGINEERING_TOTAL = 110000;
const FIXED_STUDIES_TOTAL = 17500;

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
  const base = getValue(map, 'sf_construction_cost_per_sqft', 120);
  const waste = getValue(map, 'material_waste_pct', 0.07);
  const labor = getValue(map, 'labor_overhead_pct', 0.1);
  return dwellingSqFt * base * (1 + waste) * (1 + labor);
}

function computeWaterRights({ sfLots, townhomeLots }, map) {
  const afPerLot = getValue(map, 'water_rights_af_per_lot', 0.75);
  const costPerAcreFoot = getValue(map, 'water_rights_cost_per_acre_foot', 8000);

  const sfAcreFeet = sfLots * afPerLot;
  const townhomeAcreFeet = townhomeLots * afPerLot;
  const totalAcreFeet = sfAcreFeet + townhomeAcreFeet;
  const total = totalAcreFeet * costPerAcreFoot;

  return {
    sfLots,
    townhomeLots,
    afPerLot,
    sfAcreFeet,
    townhomeAcreFeet,
    totalAcreFeet,
    costPerAcreFoot,
    total,
    formula:
      'Culinary water rights = (SF lots + townhome lots) × AF/lot × city purchase rate',
    ordinanceRef:
      'Millard County Subdivision Ord. § 11-1-20 — minimum 1.0 AF dedicated per platted lot',
    notes:
      'Plat approval requires culinary water rights at 1.0 acre-foot per residential lot (Millard County). ' +
      'Rights are purchased through Delta City at the per-acre-foot rate below. ' +
      'Commercial blocks are excluded from residential water-rights budgeting.',
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

function computeInfrastructureDetail(roadArea, map, options = {}) {
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

  const residentialLots = Math.max(0, Math.round(options.residentialLots || 0));
  // Planning placeholders — not mandated by Ord. 2025-317.
  const streetLightSpacingFt = 175;
  const transformersPerLots = 8;
  const streetLights = Math.max(1, Math.ceil(centerlineLf / streetLightSpacingFt));
  const transformers =
    residentialLots > 0
      ? Math.max(1, Math.ceil(residentialLots / transformersPerLots))
      : Math.max(1, Math.ceil(centerlineLf / 400));
  const safetyFactor = Math.max(0, getValue(map, 'infrastructure_safety_factor', 1));

  const lineItems = [
    {
      id: 'grading',
      label: 'Road corridor grading & base',
      quantity: roadSqFt,
      unit: 'sqft',
      unitCost: getValue(map, 'road_grading_per_sqft', 1.25),
      ordinanceRef: 'ST-103 base course & granular borrow',
      quantityBasis: `Centerline × ${rowWidthFt}' ROW`,
      quantitySource: 'Plat PDF centerline annotations × plat ROW width',
    },
    {
      id: 'asphalt',
      label: 'Asphalt pavement',
      quantity: pavementSqFt,
      unit: 'sqft',
      unitCost: getValue(map, 'asphalt_paving_per_sqft', 4.5),
      ordinanceRef: 'ST-103 hot mix asphalt',
      quantityBasis: `Centerline × ${pavementWidthFt}' pavement`,
      quantitySource: 'Ord. 2025-317 ST-103 (24\' local-road pavement)',
    },
    {
      id: 'curb',
      label: 'Curb & gutter (both sides)',
      quantity: curbGutterLf,
      unit: 'LF',
      unitCost: getValue(map, 'curb_gutter_per_lf', 27),
      ordinanceRef: 'ST-121 curb & gutter',
      quantityBasis: 'Centerline × 2 sides',
      quantitySource: 'Ord. 2025-317 ST-121 (both sides of roadway)',
    },
    {
      id: 'sidewalk',
      label: 'Concrete sidewalks (both sides)',
      quantity: sidewalkSqFt,
      unit: 'sqft',
      unitCost: getValue(map, 'sidewalk_concrete_per_sqft', 12),
      ordinanceRef: 'ST-131 4" sidewalk against curb',
      quantityBasis: `Centerline × 2 × ${sidewalkWidthFt}'`,
      quantitySource: 'Ord. 2025-317 ST-131 (5\' sidewalks both sides)',
    },
    {
      id: 'water',
      label: 'Culinary water main (blue PVC)',
      quantity: waterMainLf,
      unit: 'LF',
      unitCost: getValue(map, 'water_main_per_lf', 85),
      ordinanceRef: 'ST-113 / AWWA C900 PVC',
      quantityBasis: '1 × centerline LF',
      quantitySource: 'Ord. 2025-317 ST-113 (utilities in ROW along centerline)',
    },
    {
      id: 'sewer',
      label: 'Sanitary sewer main (PVC)',
      quantity: sewerMainLf,
      unit: 'LF',
      unitCost: getValue(map, 'sewer_main_per_lf', 95),
      ordinanceRef: 'ST-113 opposite water line',
      quantityBasis: '1 × centerline LF',
      quantitySource: 'Ord. 2025-317 ST-113 (utilities in ROW along centerline)',
    },
    {
      id: 'sewer_manholes',
      label: 'Sewer manholes (precast)',
      quantity: sewerManholes,
      unit: 'each',
      unitCost: getValue(map, 'sewer_manhole_each', 4500),
      ordinanceRef: 'Max 350\' spacing per Ord. 2025-317',
      quantityBasis: `ceil(sewer LF ÷ ${sewerManholeSpacingFt}')`,
      quantitySource: 'Ord. 2025-317 — max 350\' sewer manhole spacing',
    },
    {
      id: 'storm',
      label: 'Storm drain (HDPE)',
      quantity: stormDrainLf,
      unit: 'LF',
      unitCost: getValue(map, 'storm_drain_per_lf', 75),
      ordinanceRef: 'Black corrugated HDPE',
      quantityBasis: `Centerline × ${(stormNetworkCoveragePct * 100).toFixed(0)}% coverage`,
      quantitySource:
        'Planning estimate — 85% of centerline assumed storm-networked (not an ordinance %).',
    },
    {
      id: 'storm_manholes',
      label: 'Storm drain manholes',
      quantity: stormManholes,
      unit: 'each',
      unitCost: getValue(map, 'storm_manhole_each', 5500),
      ordinanceRef: 'Precast eccentric cone',
      quantityBasis: `ceil(storm LF ÷ ${stormManholeSpacingFt}')`,
      quantitySource: 'Ord. 2025-317 spacing practice (400\' storm manholes)',
    },
    {
      id: 'utilities',
      label: 'Joint utility trenching (gas / power / telecom)',
      quantity: utilityTrenchLf,
      unit: 'LF',
      unitCost: getValue(map, 'utility_trench_per_lf', 35),
      ordinanceRef: 'Joint trench excavation only — hardware below',
      quantityBasis: '1 × centerline LF',
      quantitySource: 'Planning layout — joint dry-utility trench along ROW',
    },
    {
      id: 'gas_main',
      label: 'Natural gas main (PE pipe & fittings)',
      quantity: centerlineLf,
      unit: 'LF',
      unitCost: getValue(map, 'gas_main_per_lf', 55),
      ordinanceRef: '2–4" PE main in joint trench (excl. trench)',
      quantityBasis: '1 × centerline LF',
      quantitySource: 'Planning layout — PE gas main in joint trench along ROW',
    },
    {
      id: 'electric_conduit',
      label: 'Electric primary/secondary conduit',
      quantity: centerlineLf,
      unit: 'LF',
      unitCost: getValue(map, 'electric_conduit_per_lf', 32),
      ordinanceRef: 'PVC conduit bank for power (excl. trench)',
      quantityBasis: '1 × centerline LF',
      quantitySource: 'Planning layout — power conduit bank along ROW',
    },
    {
      id: 'telecom_conduit',
      label: 'Telecom / fiber conduit',
      quantity: centerlineLf,
      unit: 'LF',
      unitCost: getValue(map, 'telecom_conduit_per_lf', 18),
      ordinanceRef: 'Empty conduit for ISP / fiber (excl. trench)',
      quantityBasis: '1 × centerline LF',
      quantitySource: 'Planning layout — empty telecom/fiber conduit along ROW',
    },
    {
      id: 'transformers',
      label: 'Pad-mount transformers',
      quantity: transformers,
      unit: 'each',
      unitCost: getValue(map, 'electric_transformer_each', 12000),
      ordinanceRef: residentialLots
        ? `~1 per ${transformersPerLots} lots (${residentialLots} residential lots)`
        : '~1 per 400 LF corridor',
      quantityBasis: residentialLots
        ? `ceil(${residentialLots} lots ÷ ${transformersPerLots})`
        : 'ceil(centerline ÷ 400\')',
      quantitySource:
        'Planning placeholder — ~1 pad-mount per 8 homes (not city-code mandated; often utility-owned with developer contribution)',
    },
    {
      id: 'street_lights',
      label: 'Street lights (pole, fixture & base)',
      quantity: streetLights,
      unit: 'each',
      unitCost: getValue(map, 'street_light_each', 4500),
      ordinanceRef: `~${streetLightSpacingFt}' spacing along centerline`,
      quantityBasis: `ceil(centerline ÷ ${streetLightSpacingFt}')`,
      quantitySource:
        'Planning placeholder — ~175\' spacing along centerline (not an Ord. 2025-317 mandated spacing)',
    },
  ].map((item) => {
    const baseAmount = item.quantity * item.unitCost;
    return {
      ...item,
      baseAmount,
      amount: baseAmount * safetyFactor,
    };
  });

  const totalInfraBase = sum(lineItems.map((item) => item.baseAmount));
  const totalInfraBudget = sum(lineItems.map((item) => item.amount));

  return {
    roadArea,
    ordinanceSpecs: {
      rowWidthFt,
      ...ORDINANCE_SPECS,
      streetLightSpacingFt,
      transformersPerLots,
    },
    totalRoadSqFt: roadSqFt,
    totalRoadLf: centerlineLf,
    pavementSqFt,
    sidewalkLf: centerlineLf * 2,
    sidewalkSqFt,
    curbGutterLf,
    transformers,
    streetLights,
    residentialLots,
    safetyFactor,
    lineItems,
    totalInfraBase,
    totalInfraBudget,
    ordinanceNote:
      `Quantities from plat centerline (${formatLf(centerlineLf)}) and Ord. 2025-317: ` +
      `${rowWidthFt}' ROW (plat), ${pavementWidthFt}' pavement (ST-103), ` +
      `${sidewalkWidthFt}' sidewalks both sides (ST-131), utilities in ROW (ST-113). ` +
      'Dry utilities include joint trench plus gas main, electric/telecom conduit, transformers, and street lights. ' +
      `Street lights (~${streetLightSpacingFt}' spacing) and transformers (~1 per ${transformersPerLots} lots) are planning placeholders, not ordinance-mandated. ` +
      `Infrastructure safety factor ×${safetyFactor.toFixed(2)} applied to all line items. ` +
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
    [-0.5, -0.2],
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

function constructionCashReserve(homesRemainingToBuild, parallelHomes, avgVerticalPerHome) {
  const homesToFund = Math.max(
    0,
    Math.min(Number(parallelHomes) || 0, Number(homesRemainingToBuild) || 0),
  );
  return homesToFund * Math.max(0, avgVerticalPerHome || 0);
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

function sumHomeCost(homes, key) {
  return sum(homes.map((home) => home.costs[key] || 0));
}

function buildPhaseCostBreakdown(phaseHomes) {
  const land = sumHomeCost(phaseHomes, 'land');
  const engineering = sumHomeCost(phaseHomes, 'engineering');
  const studies = sumHomeCost(phaseHomes, 'studies');
  const waterRights = sumHomeCost(phaseHomes, 'waterRights');
  const infrastructure = sumHomeCost(phaseHomes, 'infrastructure');
  const verticalHard = sumHomeCost(phaseHomes, 'verticalHard');
  return {
    land,
    engineering,
    studies,
    waterRights,
    infrastructure,
    verticalHard,
    /** Paid at phase start: site infrastructure + culinary water for that phase's lots. */
    phaseUpfront: infrastructure + waterRights,
    /** Paid across construction months only. */
    vertical: verticalHard,
    /** Allocated to homes for margin math; cash-flowed at project acquisition instead. */
    projectAllocated: land + engineering + studies,
  };
}

function computeFinancials(phaseResults, map, rentalHoldout, projectTotals) {
  const initialEquity = getValue(map, 'initial_equity', 0);
  const loanRate = getValue(map, 'construction_loan_rate', 0.085);
  const loanAdvance = getValue(map, 'construction_loan_advance_pct', 0.7);
  const salesRate = getValue(map, 'homes_sold_per_month', 4);
  const monthsToBuild = getValue(map, 'months_to_build_home', 3);
  const parallelHomes = getValue(map, 'parallel_homes_per_phase', 5);
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

  const allHomes = phaseResults.flatMap((phase) => phase.homes || []);
  const avgVerticalPerHome =
    allHomes.length > 0
      ? sum(allHomes.map((home) => home.costs?.verticalHard || 0)) / allHomes.length
      : 0;
  let homesRemainingToBuild = allHomes.length;

  const equityCashFlows = [-initialEquity];
  const monthlyRows = [];
  const phaseTimeline = [];

  const runMonth = ({
    phase,
    stage,
    label,
    spend = 0,
    spendBreakdown = null,
    batch = [],
    financeShortfall = true,
    homesRemainingToBuild: remainingToBuild = homesRemainingToBuild,
  }) => {
    month += 1;

    // Construction-loan interest is capitalized onto the loan balance and repaid
    // from sale proceeds. It must NOT also be subtracted from cash — doing both
    // charges the same interest twice and understates ending equity.
    const monthlyInterest = debt * (loanRate / 12);
    totalInterest += monthlyInterest;
    cash -= spend;
    debt += monthlyInterest;

    let equityInjection = 0;
    let loanDraw = 0;
    if (financeShortfall && cash < 0) {
      const coverage = coverCashShortfall(cash, debt, loanAdvance);
      cash = coverage.cash;
      debt = coverage.debt;
      equityInjection = coverage.equityInjection;
      loanDraw = coverage.loanDraw;
      totalEquityInvested += equityInjection;
      totalLoanDraws += loanDraw;
    }

    const monthProceeds = sum(batch.map((home) => home.salePrice));
    totalSaleProceeds += monthProceeds;
    cash += monthProceeds;

    const paydown = Math.min(debt, monthProceeds * 0.85);
    debt -= paydown;
    cash -= paydown;

    // Keep enough cash to vertically fund the next parallel-homes batch; sweep the rest.
    const cashReserve = constructionCashReserve(
      remainingToBuild,
      parallelHomes,
      avgVerticalPerHome,
    );
    const distribution = Math.max(0, cash - cashReserve);
    cash -= distribution;
    totalEquityDistributions += distribution;

    // IRR: capital calls negative, sweeps positive. Residual cash is not counted until exit.
    const equityFlow = distribution - equityInjection;
    equityCashFlows.push(equityFlow);

    // Realized distributions + remaining NAV − capital contributed.
    cumulativeEquityReturn = totalEquityDistributions + cash - debt - totalEquityInvested;

    if (paybackMonth == null && cumulativeEquityReturn >= 0) {
      paybackMonth = month;
    }

    peakDebt = Math.max(peakDebt, debt);

    monthlyRows.push({
      month,
      phase,
      stage,
      label,
      equityFlow,
      equityInjection,
      loanDraw,
      interest: monthlyInterest,
      buildSpend: spend,
      spendBreakdown,
      saleProceeds: monthProceeds,
      debtPaydown: paydown,
      distribution,
      cashReserve,
      homesRemainingToBuild: remainingToBuild,
      debt,
      cash,
      cumulativeEquityReturn,
    });
  };

  // Project acquisition: land + engineering + studies (+ any commercial water rights share).
  const acquisition = projectTotals.acquisitionCosts || {
    land: 0,
    engineering: 0,
    studies: 0,
    total: 0,
  };
  if (acquisition.total > 0) {
    runMonth({
      phase: null,
      stage: 'acquisition',
      label: 'Project acquisition — land, engineering & studies',
      spend: acquisition.total,
      spendBreakdown: {
        land: acquisition.land,
        engineering: acquisition.engineering,
        studies: acquisition.studies,
        waterRights: 0,
        infrastructure: 0,
        vertical: 0,
      },
      homesRemainingToBuild,
    });
  }

  phaseResults.forEach((phase) => {
    const sellable = phase.homes.filter((home) => home.disposition === 'sale');
    const costs = phase.costBreakdown || buildPhaseCostBreakdown(phase.homes);
    const waves = [];
    for (let i = 0; i < phase.homes.length; i += parallelHomes) {
      waves.push(phase.homes.slice(i, i + parallelHomes));
    }
    const buildMonths = Math.max(1, waves.length * monthsToBuild);
    const monthlyVertical = costs.vertical / buildMonths;
    const phaseStartMonth = month + 1;

    // Sales begin as each construction wave finishes (not after the whole phase).
    const inventory = [];
    let soldCount = 0;
    let phaseMonth = 0;
    let salesStartOffset = null;
    let monthsWithSales = 0;
    let phaseUpfrontPaid = false;

    while (phaseMonth < buildMonths || soldCount < sellable.length) {
      phaseMonth += 1;

      const isBuilding = phaseMonth <= buildMonths;
      let spend = 0;
      let spendBreakdown = {
        land: 0,
        engineering: 0,
        studies: 0,
        waterRights: 0,
        infrastructure: 0,
        vertical: 0,
      };

      // Phase infrastructure + water rights paid in full on the first month of the phase.
      if (!phaseUpfrontPaid) {
        spend += costs.phaseUpfront;
        spendBreakdown.infrastructure = costs.infrastructure;
        spendBreakdown.waterRights = costs.waterRights;
        phaseUpfrontPaid = true;
      }

      if (isBuilding) {
        spend += monthlyVertical;
        spendBreakdown.vertical = monthlyVertical;
      }

      if (isBuilding && phaseMonth % monthsToBuild === 0) {
        const wave = waves[phaseMonth / monthsToBuild - 1] || [];
        for (const home of wave) {
          if (home.disposition === 'sale') inventory.push(home);
        }
        homesRemainingToBuild = Math.max(0, homesRemainingToBuild - wave.length);
      }

      const batch = inventory.splice(0, Math.min(salesRate, inventory.length));
      soldCount += batch.length;
      if (batch.length > 0) {
        if (salesStartOffset == null) salesStartOffset = phaseMonth;
        monthsWithSales += 1;
      }

      const hasUpfront = spendBreakdown.infrastructure > 0 || spendBreakdown.waterRights > 0;
      const hasVertical = spendBreakdown.vertical > 0;
      let stage;
      if (hasUpfront && batch.length > 0) stage = 'both';
      else if (hasUpfront && hasVertical) stage = 'sitework';
      else if (hasUpfront) stage = 'sitework';
      else if (hasVertical && batch.length > 0) stage = 'both';
      else if (hasVertical) stage = 'construction';
      else stage = 'sales';

      const labelParts = [];
      if (hasUpfront) labelParts.push('sitework (infra + water)');
      if (hasVertical) labelParts.push('construction');
      if (batch.length > 0) labelParts.push(`sales (${batch.length})`);

      runMonth({
        phase: phase.phase,
        stage,
        label: `Phase ${phase.phase} ${labelParts.join(' + ')}`,
        spend,
        spendBreakdown,
        batch,
        financeShortfall: spend > 0 || isBuilding,
        homesRemainingToBuild,
      });
    }

    phaseTimeline.push({
      phase: phase.phase,
      startMonth: phaseStartMonth,
      buildMonths,
      saleMonths: monthsWithSales,
      salesStartOffset: salesStartOffset ?? buildMonths + 1,
      durationMonths: phaseMonth,
      endMonth: month,
      homeCount: phase.homeCount,
      sellableCount: sellable.length,
      totalCost: phase.totalCost,
      phaseUpfront: costs.phaseUpfront,
      verticalCost: costs.vertical,
      infrastructure: costs.infrastructure,
      waterRights: costs.waterRights,
      totalRevenue: phase.totalRevenue,
    });
  });

  // Terminal rental value only when monthly model has retired construction debt.
  const debtRetired = debt <= 0;
  const rentalActivated = debtRetired && (rentalHoldout.units || 0) > 0;
  const rentalTerminalValue =
    rentalActivated && rentalHoldout.potentialAnnualNoi > 0
      ? rentalHoldout.potentialAnnualNoi / 0.05
      : 0;
  const exitEquity = cash - debt + rentalTerminalValue;
  if (Math.abs(exitEquity) > 1) {
    equityCashFlows.push(exitEquity);
    cumulativeEquityReturn = totalEquityDistributions + exitEquity - totalEquityInvested;
    month += 1;
    if (paybackMonth == null && cumulativeEquityReturn >= 0) {
      paybackMonth = month;
    }
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
      distribution: 0,
      cashReserve: 0,
      debt,
      cash,
      cumulativeEquityReturn,
      rentalTerminalValue,
    });
  }

  const irr = computeIrr(equityCashFlows);
  const totalValueToEquity = totalEquityDistributions + exitEquity;
  const netProfit = totalValueToEquity - totalEquityInvested;
  const equityMultiple =
    totalEquityInvested > 0 ? totalValueToEquity / totalEquityInvested : null;
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
    totalEquityDistributions,
    avgVerticalPerHome,
    parallelHomesReserve: parallelHomes,
    totalInterest,
    totalLoanDraws,
    totalSaleProceeds,
    peakDebt,
    projectDurationMonths: month,
    paybackMonth,
    exitEquity,
    rentalTerminalValue,
    // Same cash/debt balances used in exitEquity = cash − debt + rental terminal.
    endingCash: cash,
    endingDebt: debt,
    rentalActivated,
    npvAt10Pct: npv,
    equityCashFlows,
    monthlyRows,
    phaseTimeline,
    acquisitionCosts: projectTotals.acquisitionCosts || null,
  };
}

function estimatePhaseSchedule(phase, map) {
  const salesRate = getValue(map, 'homes_sold_per_month', 4);
  const monthsToBuild = getValue(map, 'months_to_build_home', 3);
  const parallelHomes = getValue(map, 'parallel_homes_per_phase', 5);
  const sellable = phase.homes.filter((home) => home.disposition === 'sale');
  const waveCount = Math.max(1, Math.ceil(phase.homeCount / parallelHomes));
  const buildMonths = Math.max(1, waveCount * monthsToBuild);

  const inventory = [];
  let soldCount = 0;
  let phaseMonth = 0;
  let monthsWithSales = 0;
  let homeCursor = 0;

  while (phaseMonth < buildMonths || soldCount < sellable.length) {
    phaseMonth += 1;
    const isBuilding = phaseMonth <= buildMonths;
    if (isBuilding && phaseMonth % monthsToBuild === 0) {
      const waveEnd = Math.min(homeCursor + parallelHomes, phase.homes.length);
      for (; homeCursor < waveEnd; homeCursor += 1) {
        if (phase.homes[homeCursor].disposition === 'sale') {
          inventory.push(phase.homes[homeCursor]);
        }
      }
    }
    const soldThisMonth = Math.min(salesRate, inventory.length);
    inventory.splice(0, soldThisMonth);
    soldCount += soldThisMonth;
    if (soldThisMonth > 0) monthsWithSales += 1;
  }

  return { buildMonths, saleMonths: monthsWithSales, durationMonths: phaseMonth, sellable };
}

function simulatePhaseWaterfall(phaseResults, map, acquisitionCosts = null) {
  let cash = getValue(map, 'initial_equity', 0);
  let debt = 0;
  const loanRate = getValue(map, 'construction_loan_rate', 0.085);
  const loanAdvance = getValue(map, 'construction_loan_advance_pct', 0.7);
  const salesRate = getValue(map, 'homes_sold_per_month', 4);

  const timeline = [];
  const acquisition = acquisitionCosts || { total: 0 };

  if (acquisition.total > 0) {
    const financingNeed = Math.max(0, acquisition.total - cash);
    const draw = financingNeed * loanAdvance;
    debt += draw;
    cash += draw;
    cash -= acquisition.total;
    timeline.push({
      phase: null,
      stage: 'acquisition',
      label: 'Project acquisition',
      totalCost: acquisition.total,
      sellableCount: 0,
      reservedCount: 0,
      saleMonths: 0,
      durationMonths: 1,
      saleProceeds: 0,
      financingDraw: draw,
      interest: 0,
      cashAfterPhase: cash,
      debtAfterPhase: debt,
      netProfit: -acquisition.total,
      costBreakdown: acquisition,
    });
  }

  phaseResults.forEach((phase) => {
    const costs = phase.costBreakdown || buildPhaseCostBreakdown(phase.homes);
    // Land/engineering/studies already paid at acquisition; phase cash cost is sitework + vertical.
    const phaseCashCost = costs.phaseUpfront + costs.vertical;
    const schedule = estimatePhaseSchedule(phase, map);
    const { sellable, saleMonths, durationMonths } = schedule;

    const financingNeed = Math.max(0, phaseCashCost - cash);
    const draw = financingNeed * loanAdvance;
    debt += draw;
    cash += draw;
    cash -= phaseCashCost;

    // Interest over overlapping build+sell duration (sales start as waves complete).
    // Capitalized onto the loan balance only — not also deducted from cash (that
    // would double-charge interest, as in the monthly model).
    const interest = debt * loanRate * (durationMonths / 12);
    debt += interest;

    let proceeds = 0;
    let soldSoFar = 0;
    const saleLoops = Math.max(1, Math.ceil(sellable.length / Math.max(salesRate, 1)));
    for (let m = 1; m <= saleLoops; m += 1) {
      const batch = sellable.slice(soldSoFar, soldSoFar + salesRate);
      soldSoFar += batch.length;
      const monthProceeds = sum(batch.map((home) => home.salePrice));
      proceeds += monthProceeds;
      cash += monthProceeds;
      const paydown = Math.min(debt, monthProceeds * 0.85);
      debt -= paydown;
      cash -= paydown;
    }

    timeline.push({
      ...phase,
      sellableCount: sellable.length,
      reservedCount: phase.homeCount - sellable.length,
      saleMonths,
      durationMonths,
      saleProceeds: proceeds,
      financingDraw: draw,
      interest,
      cashAfterPhase: cash,
      debtAfterPhase: debt,
      netProfit: proceeds - phaseCashCost - interest,
      phaseCashCost,
      costBreakdown: costs,
    });
  });

  return { timeline, endingCash: cash, endingDebt: debt, acquisitionCosts: acquisition };
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

  const sfSalePricePerSqFt = getValue(map, 'sf_sale_price_per_sqft', 200);
  const townhomeSalePricePerSqFt = getValue(map, 'townhome_sale_price_per_sqft', 200);

  const enrichedLots = residentialLots.map((lot) => ({
    ...lot,
    dwellingSqFt: estimateDwellingSqFt(lot, roads, transform),
  }));

  const roadArea = computeRoadAreaFromSegments(roadSegments);
  const infrastructure = computeInfrastructureDetail(roadArea, map, {
    residentialLots: sfLots.length + townhomeLots.length,
  });
  const waterRights = computeWaterRights(
    {
      sfLots: sfLots.length,
      townhomeLots: townhomeLots.length,
    },
    map,
  );

  const residentialHomeCount = sfLots.length + townhomeLots.length;
  const shared = {
    landPerHome: getValue(map, 'land_cost_total', 4200000) / Math.max(totalHomes, 1),
    engineeringPerHome: FIXED_ENGINEERING_TOTAL / Math.max(totalHomes, 1),
    studiesPerHome: FIXED_STUDIES_TOTAL / Math.max(totalHomes, 1),
    // Residential-only water rights spread across residential lots (commercial excluded).
    waterRightsPerHome: waterRights.total / Math.max(residentialHomeCount, 1),
    infraPerHome: infrastructure.totalInfraBudget / Math.max(residentialHomeCount, 1),
  };

  const orderedPhases = phaseOrder || defaults.phaseOrder || [1, 3, 4, 5, 6, 7];

  let homeRows = enrichedLots.map((lot) => {
    const costs = computeHomeCost(lot, shared, map);
    const salePricePerSqFt =
      lot.lotType === 'townhome' ? townhomeSalePricePerSqFt : sfSalePricePerSqFt;
    const salePrice = costs.dwellingSqFt * salePricePerSqFt;
    return {
      lotNumber: lot.lotNumber,
      phase: lot.phase,
      lotType: lot.lotType,
      lotSqFt: lot.squareFeet,
      dwellingSqFt: costs.dwellingSqFt,
      costs,
      salePricePerSqFt,
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
    const costBreakdown = buildPhaseCostBreakdown(phaseHomes);
    const totalCost = sum(phaseHomes.map((row) => row.costs.total));
    const totalRevenue = sum(sellable.map((row) => row.salePrice));
    const totalMargin = totalRevenue - totalCost;
    return {
      phase,
      homeCount: phaseHomes.length,
      sellableCount: sellable.length,
      reservedCount: phaseHomes.length - sellable.length,
      homes: phaseHomes,
      costBreakdown,
      totalCost,
      totalRevenue,
      totalMargin,
      avgCostPerHome: phaseHomes.length ? totalCost / phaseHomes.length : 0,
      avgRevenuePerHome: sellable.length ? totalRevenue / sellable.length : 0,
    };
  });

  const landTotal = getValue(map, 'land_cost_total', 4200000);
  const engineeringTotal = FIXED_ENGINEERING_TOTAL;
  const studiesTotal = FIXED_STUDIES_TOTAL;
  // Water rights are residential-only and cash-flowed per phase (phaseUpfront),
  // so acquisition no longer carries a commercial water-rights line.
  const acquisitionCosts = {
    land: landTotal,
    engineering: engineeringTotal,
    studies: studiesTotal,
    total: landTotal + engineeringTotal + studiesTotal,
  };

  const waterfall = simulatePhaseWaterfall(phaseResults, map, acquisitionCosts);
  // Potential NOI/unit mix; activation is finalized from the monthly financing model.
  const rentalHoldout = computeRentalHoldout(reservedHomes, map, 0, 0);

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
    totalDevelopmentCost:
      landTotal +
      engineeringTotal +
      studiesTotal +
      waterRights.total +
      sum(homeRows.map((row) => row.costs.infrastructure + row.costs.verticalHard)),
    totalSaleRevenue: sum(forSaleHomes.map((row) => row.salePrice)),
    totalGrossMargin: sum(forSaleHomes.map((row) => row.grossMargin)),
    waterRightsTotal: waterRights.total,
    acquisitionCosts,
    avgCostPerHome: homeRows.length ? sum(homeRows.map((row) => row.costs.total)) / homeRows.length : 0,
    avgDwellingSqFt: homeRows.length ? sum(homeRows.map((row) => row.dwellingSqFt)) / homeRows.length : 0,
    avgSfDwellingSqFt: sfLots.length
      ? sum(homeRows.filter((row) => row.lotType === 'single-family').map((row) => row.dwellingSqFt)) /
        sfLots.length
      : 0,
    avgTownhomeDwellingSqFt: townhomeLots.length
      ? sum(homeRows.filter((row) => row.lotType === 'townhome').map((row) => row.dwellingSqFt)) /
        townhomeLots.length
      : 0,
    sfSalePricePerSqFt,
    townhomeSalePricePerSqFt,
  };

  const financials = computeFinancials(phaseResults, map, rentalHoldout, projectTotals);

  // Keep phase-waterfall display balances aligned with the monthly model (source of truth).
  waterfall.endingCash = financials.endingCash;
  waterfall.endingDebt = financials.endingDebt;

  // Finalize rental holdout status from monthly ending debt (not the coarse phase waterfall).
  const rentalHoldoutFinal = computeRentalHoldout(
    reservedHomes,
    map,
    financials.endingDebt,
    financials.endingCash,
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
    rentalHoldout: rentalHoldoutFinal,
    financials,
    projectTotals,
    meta: {
      model: defaults.model,
      phaseOrder: orderedPhases,
      ordinanceRef: defaults.ordinanceRef,
    },
  };
}
