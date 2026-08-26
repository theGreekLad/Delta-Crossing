/**
 * Builds a lookup of calculation detail objects for the proforma UI.
 * Each entry powers the "how was this calculated?" slide-over panel.
 */

function step(label, value, format = 'currency', meta = null) {
  return { label, value, format, meta };
}

function calc(id, label, formula, result, resultFormat, steps, assumptionRefs = [], notes = null) {
  return { id, label, formula, result, resultFormat, steps, assumptionRefs, notes };
}

export function buildCalculations(result, merged) {
  const { map, shared, waterRights, infrastructure, projectTotals, financials, rentalHoldout, waterfall, phaseResults, homeRows } = result;
  const totalHomes = projectTotals.singleFamilyHomes + projectTotals.townhomeLots + projectTotals.commercialBlocks;
  const residentialHomes = projectTotals.singleFamilyHomes + projectTotals.townhomeLots;
  const waste = map.material_waste_pct ?? 0.07;
  const labor = map.labor_overhead_pct ?? 0.1;
  const baseCost = map.sf_construction_cost_per_sqft ?? 120;

  const calcs = {};

  // ── Financial metrics ──────────────────────────────────────────────
  if (financials) {
    calcs.irr = calc(
      'irr',
      'Project IRR',
      'IRR on monthly equity cash flows: capital calls (negative), profit sweeps (positive), and residual exit equity.',
      financials.irr,
      'pct',
      [
        step('Initial equity (month 0)', -(map.initial_equity ?? 0), 'currency'),
        step('Additional equity injections', financials.totalEquityInvested - (map.initial_equity ?? 0), 'currency'),
        step('Total equity invested', financials.totalEquityInvested, 'currency'),
        step('Cash swept to equity', financials.totalEquityDistributions ?? 0, 'currency'),
        step('Residual exit equity', financials.exitEquity, 'currency'),
        step('Cash flow periods', financials.equityCashFlows?.length ?? 0, 'number'),
      ],
      ['initial_equity', 'construction_loan_rate', 'construction_loan_advance_pct', 'homes_sold_per_month', 'months_to_build_home', 'parallel_homes_per_phase'],
      'Cash above the vertical-cost reserve for Homes under construction simultaneously is distributed when earned. That reserve is (remaining unbuilt homes, capped at the parallel-homes setting) × average vertical cost per home.',
    );

    calcs.equityMultiple = calc(
      'equityMultiple',
      'Equity Multiple',
      '(Cash swept to equity + residual exit equity) ÷ total equity invested',
      financials.equityMultiple,
      'multiple',
      [
        step('Cash swept to equity', financials.totalEquityDistributions ?? 0, 'currency'),
        step('Residual exit equity', financials.exitEquity, 'currency'),
        step('Total equity invested', financials.totalEquityInvested, 'currency'),
        step('Equity multiple', financials.equityMultiple, 'multiple'),
      ],
      ['initial_equity', 'parallel_homes_per_phase'],
    );

    calcs.returnOnCost = calc(
      'returnOnCost',
      'Return on Cost',
      '(Swept cash + residual exit − total equity invested) ÷ total development cost',
      financials.returnOnCost,
      'pct',
      [
        step('Cash swept to equity', financials.totalEquityDistributions ?? 0, 'currency'),
        step('Residual exit equity', financials.exitEquity, 'currency'),
        step('Total equity invested', financials.totalEquityInvested, 'currency'),
        step('Net profit', financials.netProfit, 'currency'),
        step('Total development cost', projectTotals.totalDevelopmentCost, 'currency'),
      ],
      ['initial_equity', 'parallel_homes_per_phase'],
    );

    calcs.npvAt10Pct = calc(
      'npvAt10Pct',
      'NPV @ 10%',
      'NPV of equity cash flows discounted at 10% annual (0.833% monthly)',
      financials.npvAt10Pct,
      'currency',
      [
        step('Discount rate (annual)', 0.1, 'pct'),
        step('Cash flow periods', financials.equityCashFlows?.length ?? 0, 'number'),
        step('NPV', financials.npvAt10Pct, 'currency'),
      ],
      ['initial_equity'],
    );

    calcs.totalEquityInvested = calc(
      'totalEquityInvested',
      'Total Equity Invested',
      'Initial equity + all additional equity injections during construction',
      financials.totalEquityInvested,
      'currency',
      [
        step('Initial equity', map.initial_equity ?? 0, 'currency'),
        step('Additional injections', financials.totalEquityInvested - (map.initial_equity ?? 0), 'currency'),
        step('Total', financials.totalEquityInvested, 'currency'),
      ],
      ['initial_equity', 'construction_loan_advance_pct'],
    );

    calcs.totalEquityDistributions = calc(
      'totalEquityDistributions',
      'Cash Swept to Equity',
      'Sale surplus distributed after keeping a cash reserve equal to vertical cost for Homes under construction simultaneously',
      financials.totalEquityDistributions ?? 0,
      'currency',
      [
        step('Homes in the cash reserve', financials.parallelHomesReserve ?? map.parallel_homes_per_phase ?? 0, 'number'),
        step('Average vertical cost per home', financials.avgVerticalPerHome ?? 0, 'currency'),
        step('Cash swept to equity', financials.totalEquityDistributions ?? 0, 'currency'),
        step('Residual cash left in project', financials.endingCash ?? 0, 'currency'),
      ],
      ['parallel_homes_per_phase', 'sf_construction_cost_per_sqft'],
      'Each month, cash above (remaining unbuilt homes, capped at the parallel-homes setting) × average vertical cost is paid out. New phase infrastructure can still require a later equity call if the reserve does not cover it.',
    );

    calcs.peakDebt = calc(
      'peakDebt',
      'Peak Construction Debt',
      'Maximum outstanding construction loan balance during the project timeline',
      financials.peakDebt,
      'currency',
      [
        step('Peak debt reached', financials.peakDebt, 'currency'),
        step('Total loan draws', financials.totalLoanDraws, 'currency'),
        step('Total interest accrued', financials.totalInterest, 'currency'),
      ],
      ['construction_loan_rate', 'construction_loan_advance_pct'],
    );

    calcs.totalInterest = calc(
      'totalInterest',
      'Total Interest Paid',
      'Sum of monthly interest on outstanding construction debt',
      financials.totalInterest,
      'currency',
      [
        step('Loan rate (annual)', map.construction_loan_rate ?? 0, 'pct'),
        step('Total interest over project', financials.totalInterest, 'currency'),
      ],
      ['construction_loan_rate'],
      'Interest = outstanding debt × (loan rate ÷ 12) each month.',
    );

    calcs.totalSaleProceeds = calc(
      'totalSaleProceeds',
      'Total Sale Proceeds',
      'Sum of sale prices for all for-sale homes across all phases',
      financials.totalSaleProceeds,
      'currency',
      [
        step('For-sale homes', projectTotals.forSaleHomes, 'number'),
        step('Total sale revenue', projectTotals.totalSaleRevenue, 'currency'),
        step('Proceeds collected in timeline', financials.totalSaleProceeds, 'currency'),
      ],
      ['sf_sale_price_per_sqft', 'townhome_sale_price_per_sqft', 'homes_sold_per_month'],
    );

    calcs.profitMargin = calc(
      'profitMargin',
      'Gross Profit Margin',
      'Total gross margin ÷ total sale revenue',
      financials.profitMargin,
      'pct',
      [
        step('Total gross margin', projectTotals.totalGrossMargin, 'currency'),
        step('Total sale revenue', projectTotals.totalSaleRevenue, 'currency'),
      ],
      [
        'sf_sale_price_per_sqft',
        'townhome_sale_price_per_sqft',
        'sf_construction_cost_per_sqft',
        'material_waste_pct',
        'labor_overhead_pct',
        'infrastructure_safety_factor',
        'land_cost_total',
      ],
    );

    calcs.projectDurationMonths = calc(
      'projectDurationMonths',
      'Project Duration',
      'Total months from start through final exit',
      financials.projectDurationMonths,
      'months',
      financials.phaseTimeline.map((p) =>
        step(
          `Phase ${p.phase}`,
          p.durationMonths ?? p.buildMonths + p.saleMonths,
          'months',
          `${p.homeCount} homes · infra/water upfront, sales overlap build`,
        ),
      ),
      ['months_to_build_home', 'parallel_homes_per_phase', 'homes_sold_per_month'],
    );

    if (projectTotals.acquisitionCosts?.total > 0) {
      const acq = projectTotals.acquisitionCosts;
      calcs.acquisitionCosts = calc(
        'acquisitionCosts',
        'Project Acquisition Costs',
        'Land, engineering, and studies paid in month 1 before phase construction',
        acq.total,
        'currency',
        [
          step('Land', acq.land, 'currency'),
          step('Engineering (fixed)', acq.engineering, 'currency', 'From 12_11_23 Proforma Delta.xlsx — not editable'),
          step('Studies (fixed)', acq.studies, 'currency', 'From 12_11_23 Proforma Delta.xlsx — not editable'),
          step('Total acquisition', acq.total, 'currency'),
        ],
        ['land_cost_total'],
        'Engineering ($110k) and studies ($17.5k) are fixed soft costs from the source proforma.',
      );
    }

    calcs.paybackMonth = calc(
      'paybackMonth',
      'Equity Payback',
      'First month cumulative distributions + remaining NAV ≥ total equity invested',
      financials.paybackMonth,
      'months',
      [
        step('Total equity invested', financials.totalEquityInvested, 'currency'),
        step('Payback month', financials.paybackMonth, 'months'),
      ],
      ['initial_equity', 'homes_sold_per_month'],
      financials.paybackMonth == null ? 'Equity has not recovered within the modeled timeline.' : null,
    );

    calcs.exitEquity = calc(
      'exitEquity',
      'Exit Equity Value',
      'Residual NAV at the end: ending cash − ending debt + rental terminal value (if activated). Earlier profit sweeps are separate.',
      financials.exitEquity,
      'currency',
      [
        step('Ending cash (monthly model)', financials.endingCash, 'currency'),
        step('Ending debt (monthly model)', financials.endingDebt, 'currency'),
        step('Rental terminal value @ 5% cap', financials.rentalTerminalValue ?? 0, 'currency'),
        step('Exit equity', financials.exitEquity, 'currency'),
      ],
      [
        'initial_equity',
        'construction_loan_rate',
        'construction_loan_advance_pct',
        'sf_rent_monthly',
        'townhome_rent_monthly',
        'rental_vacancy_pct',
        'rental_opex_per_unit_year',
      ],
      'Uses the same month-by-month cash and debt balances as the financing timeline — not the coarser phase waterfall. Cap rate 5% is a fixed planning assumption (not editable).',
    );
  }

  // ── Project totals ─────────────────────────────────────────────────
  calcs.singleFamilyHomes = calc(
    'singleFamilyHomes',
    'Single-Family Homes',
    'Count of single-family lots on the plat',
    projectTotals.singleFamilyHomes,
    'number',
    [step('Single-family lots', projectTotals.singleFamilyHomes, 'number')],
  );

  calcs.townhomeLots = calc(
    'townhomeLots',
    'Townhomes',
    'Count of townhome lots on the plat',
    projectTotals.townhomeLots,
    'number',
    [step('Townhome lots', projectTotals.townhomeLots, 'number')],
  );

  calcs.forSaleHomes = calc(
    'forSaleHomes',
    'For-Sale Homes',
    'Total homes minus units reserved for rental holdout',
    projectTotals.forSaleHomes,
    'number',
    [
      step('Total residential homes', residentialHomes, 'number'),
      step('Reserved for rent', projectTotals.reservedForRent, 'number'),
      step('For sale', projectTotals.forSaleHomes, 'number'),
    ],
    ['sf_reserved_for_rent', 'townhome_reserved_for_rent'],
  );

  calcs.reservedForRent = calc(
    'reservedForRent',
    'Reserved for Rent',
    'Last N SF + last N townhome lots (by phase order) held for rental income',
    projectTotals.reservedForRent,
    'number',
    [
      step('SF reserved', map.sf_reserved_for_rent ?? 0, 'number'),
      step('Townhome reserved', map.townhome_reserved_for_rent ?? 0, 'number'),
      step('Total reserved', projectTotals.reservedForRent, 'number'),
    ],
    ['sf_reserved_for_rent', 'townhome_reserved_for_rent'],
    'Reserved lots are the last units in each type by phase order and lot number.',
  );

  calcs.avgDwellingSqFt = calc(
    'avgDwellingSqFt',
    'Average Dwelling Size',
    'Mean dwelling sqft from R-4 building envelope on each lot polygon',
    projectTotals.avgDwellingSqFt,
    'sqft',
    [
      step('Total dwelling sqft', homeRows.reduce((s, h) => s + h.dwellingSqFt, 0), 'number'),
      step('Home count', homeRows.length, 'number'),
      step('Average', projectTotals.avgDwellingSqFt, 'sqft'),
    ],
  );

  calcs.waterRightsTotal = calc(
    'waterRightsTotal',
    'Water Rights Cost',
    waterRights.formula,
    waterRights.total,
    'currency',
    [
      step('SF lots × AF/lot', waterRights.sfAcreFeet, 'number', `${waterRights.sfLots} × ${waterRights.afPerLot} AF`),
      step('Townhome lots × AF/lot', waterRights.townhomeAcreFeet, 'number', `${waterRights.townhomeLots} × ${waterRights.afPerLot} AF`),
      step('Total acre-feet', waterRights.totalAcreFeet, 'number'),
      step('Cost per acre-foot', waterRights.costPerAcreFoot, 'currency'),
      step('Total cost', waterRights.total, 'currency'),
    ],
    ['water_rights_af_per_lot', 'water_rights_cost_per_acre_foot'],
    waterRights.notes,
  );

  calcs.totalDevelopmentCost = calc(
    'totalDevelopmentCost',
    'Total Development Cost',
    'Land + engineering + studies + water rights + infrastructure (× safety) + vertical (× waste × labor)',
    projectTotals.totalDevelopmentCost,
    'currency',
    [
      step('Land (allocated)', map.land_cost_total ?? 0, 'currency'),
      step(
        'Engineering (fixed)',
        projectTotals.acquisitionCosts?.engineering ?? 0,
        'currency',
        'From source proforma — not an editable assumption',
      ),
      step(
        'Studies (fixed)',
        projectTotals.acquisitionCosts?.studies ?? 0,
        'currency',
        'From source proforma — not an editable assumption',
      ),
      step('Water rights', waterRights.total, 'currency'),
      step(
        'Infrastructure',
        infrastructure.totalInfraBudget,
        'currency',
        `base ${formatCurrencyPlain(infrastructure.totalInfraBase ?? 0)} × ${(infrastructure.safetyFactor ?? 1).toFixed(2)} safety`,
      ),
      step(
        'Vertical construction (all homes)',
        homeRows.reduce((s, h) => s + h.costs.verticalHard, 0),
        'currency',
        `sqft × $${baseCost}/sqft × (1+${(waste * 100).toFixed(0)}% waste) × (1+${(labor * 100).toFixed(0)}% labor)`,
      ),
      step('Total', projectTotals.totalDevelopmentCost, 'currency'),
    ],
    [
      'land_cost_total',
      'water_rights_af_per_lot',
      'water_rights_cost_per_acre_foot',
      'infrastructure_safety_factor',
      'sf_construction_cost_per_sqft',
      'material_waste_pct',
      'labor_overhead_pct',
    ],
  );

  calcs.totalSaleRevenue = calc(
    'totalSaleRevenue',
    'Total Sale Revenue',
    'Sum of (dwelling sqft × sale $/sqft) for all for-sale homes',
    projectTotals.totalSaleRevenue,
    'currency',
    [
      step('SF for sale', projectTotals.sfForSale, 'number'),
      step('Townhome for sale', projectTotals.townhomeForSale, 'number'),
      step('SF sale $/sqft', map.sf_sale_price_per_sqft ?? 0, 'currency'),
      step(
        'Avg SF home price',
        (projectTotals.avgSfDwellingSqFt ?? 0) * (map.sf_sale_price_per_sqft ?? 0),
        'currency',
        `${formatNumberPlain(projectTotals.avgSfDwellingSqFt ?? 0)} sqft × ${formatCurrencyPlain(map.sf_sale_price_per_sqft ?? 0)}`,
      ),
      step('Townhome sale $/sqft', map.townhome_sale_price_per_sqft ?? 0, 'currency'),
      step(
        'Avg townhome price',
        (projectTotals.avgTownhomeDwellingSqFt ?? 0) * (map.townhome_sale_price_per_sqft ?? 0),
        'currency',
        `${formatNumberPlain(projectTotals.avgTownhomeDwellingSqFt ?? 0)} sqft × ${formatCurrencyPlain(map.townhome_sale_price_per_sqft ?? 0)}`,
      ),
      step('Total revenue', projectTotals.totalSaleRevenue, 'currency'),
    ],
    ['sf_sale_price_per_sqft', 'townhome_sale_price_per_sqft', 'sf_reserved_for_rent', 'townhome_reserved_for_rent'],
  );

  calcs.totalGrossMargin = calc(
    'totalGrossMargin',
    'Gross Margin (Pre-Finance)',
    'Total sale revenue − total development cost (for-sale homes only)',
    projectTotals.totalGrossMargin,
    'currency',
    [
      step('Total sale revenue', projectTotals.totalSaleRevenue, 'currency'),
      step('Total development cost', projectTotals.totalDevelopmentCost, 'currency'),
      step('Gross margin', projectTotals.totalGrossMargin, 'currency'),
    ],
    [
      'sf_sale_price_per_sqft',
      'townhome_sale_price_per_sqft',
      'land_cost_total',
      'infrastructure_safety_factor',
      'sf_construction_cost_per_sqft',
      'material_waste_pct',
      'labor_overhead_pct',
    ],
  );

  calcs.avgCostPerHome = calc(
    'avgCostPerHome',
    'Average Cost per Home',
    'Total development cost ÷ total residential homes',
    projectTotals.avgCostPerHome,
    'currency',
    [
      step('Total development cost', projectTotals.totalDevelopmentCost, 'currency'),
      step('Total homes', homeRows.length, 'number'),
      step('Average', projectTotals.avgCostPerHome, 'currency'),
    ],
    [
      'land_cost_total',
      'infrastructure_safety_factor',
      'sf_construction_cost_per_sqft',
      'material_waste_pct',
      'labor_overhead_pct',
    ],
  );

  calcs.endingCash = calc(
    'endingCash',
    'Ending Cash',
    'Cash balance after the monthly financing model completes (same balance used in exit equity)',
    financials?.endingCash ?? waterfall.endingCash,
    'currency',
    [
      step('Initial equity', map.initial_equity ?? 0, 'currency'),
      step('Total equity invested', financials?.totalEquityInvested ?? map.initial_equity ?? 0, 'currency'),
      step('Total sale proceeds', financials?.totalSaleProceeds ?? 0, 'currency'),
      step('Total interest accrued', financials?.totalInterest ?? 0, 'currency'),
      step('Ending cash', financials?.endingCash ?? waterfall.endingCash, 'currency'),
    ],
    ['initial_equity', 'construction_loan_rate', 'construction_loan_advance_pct', 'homes_sold_per_month'],
    'Month-by-month cash after construction spend, loan draws, interest, sale proceeds, and debt paydowns.',
  );

  calcs.endingDebt = calc(
    'endingDebt',
    'Ending Debt',
    'Outstanding construction debt after all sale proceeds and paydowns (monthly model)',
    financials?.endingDebt ?? waterfall.endingDebt,
    'currency',
    [
      step('Total loan draws', financials?.totalLoanDraws ?? 0, 'currency'),
      step('Peak debt', financials?.peakDebt ?? 0, 'currency'),
      step('Ending debt', financials?.endingDebt ?? waterfall.endingDebt, 'currency'),
    ],
    ['construction_loan_advance_pct'],
    '85% of each month\'s sale proceeds pay down outstanding debt.',
  );

  // ── Shared per-home allocations ────────────────────────────────────
  const infraUnitCostKeys = {
    grading: 'road_grading_per_sqft',
    asphalt: 'asphalt_paving_per_sqft',
    curb: 'curb_gutter_per_lf',
    sidewalk: 'sidewalk_concrete_per_sqft',
    water: 'water_main_per_lf',
    sewer: 'sewer_main_per_lf',
    sewer_manholes: 'sewer_manhole_each',
    storm: 'storm_drain_per_lf',
    storm_manholes: 'storm_manhole_each',
    utilities: 'utility_trench_per_lf',
    gas_main: 'gas_main_per_lf',
    electric_conduit: 'electric_conduit_per_lf',
    telecom_conduit: 'telecom_conduit_per_lf',
    transformers: 'electric_transformer_each',
    street_lights: 'street_light_each',
  };
  const costSideAssumptionRefs = [
    'land_cost_total',
    'water_rights_af_per_lot',
    'water_rights_cost_per_acre_foot',
    'infrastructure_safety_factor',
    'sf_construction_cost_per_sqft',
    'material_waste_pct',
    'labor_overhead_pct',
  ];

  calcs.landPerHome = calc(
    'landPerHome',
    'Land (per home)',
    'Total land cost ÷ total homes (including commercial)',
    shared.landPerHome,
    'currency',
    [
      step('Land cost total', map.land_cost_total ?? 0, 'currency'),
      step('Total homes', totalHomes, 'number'),
      step('Per home', shared.landPerHome, 'currency'),
    ],
    ['land_cost_total'],
  );

  calcs.infraPerHome = calc(
    'infraPerHome',
    'Infrastructure (per home)',
    'Total infrastructure budget (all line items × safety factor) ÷ residential homes',
    shared.infraPerHome,
    'currency',
    [
      step(
        'Unadjusted infra subtotal',
        infrastructure.totalInfraBase ?? 0,
        'currency',
        'Sum of quantity × unit cost before safety',
      ),
      step('Safety factor', infrastructure.safetyFactor ?? 1, 'number', '× multiplier on every line item'),
      step('Total infrastructure', infrastructure.totalInfraBudget, 'currency'),
      step('Residential homes', residentialHomes, 'number'),
      step('Per home', shared.infraPerHome, 'currency'),
    ],
    ['infrastructure_safety_factor', ...Object.values(infraUnitCostKeys)],
    'Per-home share of the full ordinance + dry-utility budget. Change any infra unit cost or the safety factor to update this.',
  );

  calcs.verticalHard = calc(
    'verticalHard',
    'Vertical Construction',
    'Dwelling sqft × cost/sqft × (1 + waste) × (1 + labor overhead)',
    null,
    'currency',
    [
      step('Base cost per sqft', baseCost, 'currency'),
      step('Material waste', waste, 'pct'),
      step('Labor overhead', labor, 'pct'),
      step('Effective multiplier', (1 + waste) * (1 + labor), 'number'),
    ],
    ['sf_construction_cost_per_sqft', 'material_waste_pct', 'labor_overhead_pct'],
  );

  // ── Infrastructure ─────────────────────────────────────────────────
  const cl = infrastructure.totalRoadLf;
  calcs.totalRoadLf = calc(
    'totalRoadLf',
    'Total Centerline Length',
    'Sum of centerline segment lengths from plat annotations',
    cl,
    'lf',
    [
      step('Segment count', infrastructure.roadArea.segmentCount, 'number'),
      step('Total centerline', cl, 'lf'),
    ],
    [],
    infrastructure.roadArea.formula,
  );

  calcs.roadSqFt = calc(
    'roadSqFt',
    'Road Corridor Area',
    infrastructure.roadArea.formula,
    infrastructure.totalRoadSqFt,
    'sqft',
    [
      step('Centerline length', cl, 'lf'),
      step('ROW width', infrastructure.roadArea.rowWidthFt, 'number', 'ft'),
      step('Road area', infrastructure.totalRoadSqFt, 'sqft'),
    ],
    [],
    infrastructure.roadArea.notes || 'ROW width from plat markers; length from plat PDF annotations.',
  );

  calcs.pavementSqFt = calc(
    'pavementSqFt',
    'Pavement Area',
    'Centerline LF × 24\' (ST-103)',
    infrastructure.pavementSqFt,
    'sqft',
    [
      step('Centerline', cl, 'lf'),
      step('Pavement width', infrastructure.ordinanceSpecs.pavementWidthFt, 'number', 'ft'),
      step('Pavement area', infrastructure.pavementSqFt, 'sqft'),
    ],
    [],
    'Pavement width from Ord. 2025-317 ST-103 (24\' local roads). Not an editable assumption.',
  );

  calcs.sidewalkSqFt = calc(
    'sidewalkSqFt',
    'Sidewalk Area',
    'Centerline LF × 2 × 5\' (ST-131, both sides)',
    infrastructure.sidewalkSqFt,
    'sqft',
    [
      step('Centerline', cl, 'lf'),
      step('Sidewalk width', infrastructure.ordinanceSpecs.sidewalkWidthFt, 'number', 'ft × 2 sides'),
      step('Sidewalk area', infrastructure.sidewalkSqFt, 'sqft'),
    ],
    [],
    'Sidewalk width from Ord. 2025-317 ST-131 (5\' both sides). Not an editable assumption.',
  );

  calcs.totalInfraBudget = calc(
    'totalInfraBudget',
    'Total Infrastructure Cost',
    'Sum of all ordinance line items (quantity × unit cost × safety factor)',
    infrastructure.totalInfraBudget,
    'currency',
    [
      ...infrastructure.lineItems.map((item) =>
        step(
          item.label,
          item.amount,
          'currency',
          `${formatNumberPlain(item.quantity)} ${item.unit} × ${formatCurrencyPlain(item.unitCost)} × ${
            (infrastructure.safetyFactor ?? 1).toFixed(2)
          } safety`,
        ),
      ),
      step('Safety factor', infrastructure.safetyFactor ?? 1, 'number', '× multiplier on every line item'),
      step('Unadjusted subtotal', infrastructure.totalInfraBase ?? infrastructure.totalInfraBudget, 'currency'),
      step('Total with safety factor', infrastructure.totalInfraBudget, 'currency'),
    ],
    [
      ...infrastructure.lineItems.flatMap((item) =>
        infraUnitCostKeys[item.id] ? [infraUnitCostKeys[item.id]] : [],
      ),
      'infrastructure_safety_factor',
    ],
    infrastructure.ordinanceNote,
  );

  infrastructure.lineItems.forEach((item) => {
    const safety = infrastructure.safetyFactor ?? 1;
    const qtyFormat =
      item.unit === 'each' ? 'number' : item.unit === 'sqft' ? 'sqft' : 'lf';
    const unitCostKey = infraUnitCostKeys[item.id];
    const sourceNote = [
      item.quantityBasis ? `Quantity basis: ${item.quantityBasis}.` : null,
      item.quantitySource ? `Source: ${item.quantitySource}.` : null,
      item.ordinanceRef ? `Drawing/spec: ${item.ordinanceRef}.` : null,
    ]
      .filter(Boolean)
      .join(' ');

    calcs[`infra_${item.id}`] = calc(
      `infra_${item.id}`,
      item.label,
      'Quantity × unit cost × infrastructure safety factor',
      item.amount,
      'currency',
      [
        step('Quantity', item.quantity, qtyFormat, item.quantityBasis || item.unit),
        step('Unit cost', item.unitCost, 'currency'),
        step('Base amount (qty × unit cost)', item.baseAmount ?? item.quantity * item.unitCost, 'currency'),
        step('Safety factor', safety, 'number', '× multiplier'),
        step(
          'Final amount',
          item.amount,
          'currency',
          `${formatCurrencyPlain(item.baseAmount ?? item.quantity * item.unitCost)} × ${safety.toFixed(2)}`,
        ),
      ],
      [unitCostKey, 'infrastructure_safety_factor'].filter(Boolean),
      sourceNote || item.ordinanceRef,
    );
  });

  // ── Rental holdout ─────────────────────────────────────────────────
  calcs.rentalUnits = calc(
    'rentalUnits',
    'Reserved Rental Units',
    'Units marked for rental holdout instead of for-sale',
    rentalHoldout.units,
    'number',
    [
      step('SF reserved', rentalHoldout.sfUnits, 'number'),
      step('Townhome reserved', rentalHoldout.townhomeUnits, 'number'),
      step('Total', rentalHoldout.units, 'number'),
    ],
    ['sf_reserved_for_rent', 'townhome_reserved_for_rent'],
    rentalHoldout.reason,
  );

  calcs.annualNoi = calc(
    'annualNoi',
    'Annual NOI',
    '(Gross rent × (1 − vacancy)) − operating expenses',
    rentalHoldout.annualNoi,
    'currency',
    [
      step('SF units × rent × 12', rentalHoldout.sfUnits * rentalHoldout.sfRent * 12, 'currency'),
      step('TH units × rent × 12', rentalHoldout.townhomeUnits * rentalHoldout.townhomeRent * 12, 'currency'),
      step('Vacancy rate', map.rental_vacancy_pct ?? 0, 'pct'),
      step('OpEx per unit/year', map.rental_opex_per_unit_year ?? 0, 'currency'),
      step('Annual NOI', rentalHoldout.annualNoi, 'currency'),
    ],
    ['sf_rent_monthly', 'townhome_rent_monthly', 'rental_vacancy_pct', 'rental_opex_per_unit_year'],
    rentalHoldout.activated ? null : 'NOI is $0 until construction debt is fully repaid.',
  );

  calcs.potentialAnnualNoi = calc(
    'potentialAnnualNoi',
    'Potential Annual NOI',
    'NOI if all reserved units were active regardless of debt status',
    rentalHoldout.potentialAnnualNoi,
    'currency',
    [
      step('Gross annual rent', rentalHoldout.sfUnits * rentalHoldout.sfRent * 12 + rentalHoldout.townhomeUnits * rentalHoldout.townhomeRent * 12, 'currency'),
      step('After vacancy', rentalHoldout.potentialAnnualNoi + rentalHoldout.units * (map.rental_opex_per_unit_year ?? 0), 'currency'),
      step('Annual NOI', rentalHoldout.potentialAnnualNoi, 'currency'),
    ],
    ['sf_rent_monthly', 'townhome_rent_monthly', 'rental_vacancy_pct', 'rental_opex_per_unit_year'],
  );

  calcs.capValueAt5Pct = calc(
    'capValueAt5Pct',
    'Implied Value @ 5% Cap',
    'Potential annual NOI ÷ 0.05',
    rentalHoldout.capValueAt5Pct,
    'currency',
    [
      step('Potential annual NOI', rentalHoldout.potentialAnnualNoi, 'currency'),
      step('Cap rate', 0.05, 'pct', 'Fixed planning assumption — not editable'),
      step('Implied value', rentalHoldout.capValueAt5Pct, 'currency'),
    ],
    ['sf_rent_monthly', 'townhome_rent_monthly', 'rental_vacancy_pct', 'rental_opex_per_unit_year'],
    '5% exit cap rate is a fixed planning placeholder, not pulled from city code.',
  );

  // ── Phase-level ────────────────────────────────────────────────────
  phaseResults.forEach((phase) => {
    const prefix = `phase_${phase.phase}`;
    calcs[`${prefix}_totalCost`] = calc(
      `${prefix}_totalCost`,
      `Phase ${phase.phase} Development Cost`,
      'Sum of per-home total costs in this phase (land, eng, studies, water, infra × safety, vertical × waste × labor)',
      phase.totalCost,
      'currency',
      [
        step('Homes in phase', phase.homeCount, 'number'),
        step('Land + eng + studies + water', (phase.costBreakdown?.projectAllocated ?? 0) + (phase.costBreakdown?.waterRights ?? 0), 'currency'),
        step(
          'Infrastructure (phase share)',
          phase.costBreakdown?.infrastructure ?? 0,
          'currency',
          `includes safety ×${(infrastructure.safetyFactor ?? 1).toFixed(2)}`,
        ),
        step(
          'Vertical',
          phase.costBreakdown?.vertical ?? 0,
          'currency',
          `includes waste ${(waste * 100).toFixed(0)}% + labor ${(labor * 100).toFixed(0)}%`,
        ),
        step('Total cost', phase.totalCost, 'currency'),
        step('Avg per home', phase.avgCostPerHome, 'currency'),
      ],
      costSideAssumptionRefs,
    );

    calcs[`${prefix}_totalRevenue`] = calc(
      `${prefix}_totalRevenue`,
      `Phase ${phase.phase} Sale Revenue`,
      'Sum of sale prices for for-sale homes in this phase',
      phase.totalRevenue,
      'currency',
      [
        step('For-sale homes', phase.sellableCount, 'number'),
        step('Total revenue', phase.totalRevenue, 'currency'),
      ],
      ['sf_sale_price_per_sqft', 'townhome_sale_price_per_sqft', 'sf_reserved_for_rent', 'townhome_reserved_for_rent'],
    );

    calcs[`${prefix}_totalMargin`] = calc(
      `${prefix}_totalMargin`,
      `Phase ${phase.phase} Gross Margin`,
      'Phase sale revenue − phase development cost',
      phase.totalMargin,
      'currency',
      [
        step('Sale revenue', phase.totalRevenue, 'currency'),
        step('Development cost', phase.totalCost, 'currency'),
        step('Gross margin', phase.totalMargin, 'currency'),
      ],
      [...costSideAssumptionRefs, 'sf_sale_price_per_sqft', 'townhome_sale_price_per_sqft'],
    );

    // Waterfall row fields
    const wf = waterfall.timeline.find((r) => r.phase === phase.phase);
    if (wf) {
      calcs[`${prefix}_financingDraw`] = calc(
        `${prefix}_financingDraw`,
        `Phase ${phase.phase} Loan Draw`,
        'max(0, phase cash cost − available cash) × loan advance %',
        wf.financingDraw,
        'currency',
        [
          step('Phase cash cost (infra + water + vertical)', wf.phaseCashCost ?? wf.totalCost, 'currency'),
          step('Loan advance %', map.construction_loan_advance_pct ?? 0, 'pct'),
          step('Loan draw', wf.financingDraw, 'currency'),
        ],
        ['construction_loan_advance_pct', 'infrastructure_safety_factor'],
      );

      calcs[`${prefix}_interest`] = calc(
        `${prefix}_interest`,
        `Phase ${phase.phase} Interest`,
        'Outstanding debt × loan rate × (overlapping phase duration ÷ 12)',
        wf.interest,
        'currency',
        [
          step('Loan rate', map.construction_loan_rate ?? 0, 'pct'),
          step('Phase duration (months)', wf.durationMonths ?? wf.saleMonths, 'number'),
          step('Interest', wf.interest, 'currency'),
        ],
        ['construction_loan_rate', 'homes_sold_per_month', 'months_to_build_home', 'parallel_homes_per_phase'],
      );

      calcs[`${prefix}_netProfit`] = calc(
        `${prefix}_netProfit`,
        `Phase ${phase.phase} Net Profit`,
        'Sale proceeds − phase cash cost (infra + water + vertical) − interest',
        wf.netProfit,
        'currency',
        [
          step('Sale proceeds', wf.saleProceeds, 'currency'),
          step('Phase cash cost', wf.phaseCashCost ?? wf.totalCost, 'currency'),
          step('Interest', wf.interest, 'currency'),
          step('Net profit', wf.netProfit, 'currency'),
        ],
        [
          'sf_sale_price_per_sqft',
          'townhome_sale_price_per_sqft',
          'construction_loan_rate',
          'infrastructure_safety_factor',
          'sf_construction_cost_per_sqft',
        ],
      );
    }

    // Per-lot in phase
    phase.homes.forEach((home) => {
      const lotId = `lot_${home.lotNumber}`;
      calcs[`${lotId}_total`] = calc(
        `${lotId}_total`,
        `Lot ${home.lotNumber} Total Cost`,
        'Land + engineering + studies + water rights + infra (× safety) + vertical (× waste × labor)',
        home.costs.total,
        'currency',
        [
          step('Land', home.costs.land, 'currency'),
          step('Engineering', home.costs.engineering, 'currency'),
          step('Studies', home.costs.studies, 'currency'),
          step('Water rights', home.costs.waterRights, 'currency'),
          step(
            'Infrastructure',
            home.costs.infrastructure,
            'currency',
            `per-home share; includes safety ×${(infrastructure.safetyFactor ?? 1).toFixed(2)}`,
          ),
          step(
            'Vertical',
            home.costs.verticalHard,
            'currency',
            `${home.dwellingSqFt.toLocaleString()} sqft × $${baseCost} × (1+${(waste * 100).toFixed(0)}% waste) × (1+${(labor * 100).toFixed(0)}% labor)`,
          ),
          step('Total', home.costs.total, 'currency'),
        ],
        costSideAssumptionRefs,
      );

      calcs[`${lotId}_vertical`] = calc(
        `${lotId}_vertical`,
        `Lot ${home.lotNumber} Vertical Cost`,
        'Dwelling sqft × cost/sqft × (1 + waste) × (1 + labor overhead)',
        home.costs.verticalHard,
        'currency',
        [
          step('Dwelling sqft', home.dwellingSqFt, 'sqft', 'From R-4 building envelope on lot polygon (fallback 2,200 SF / 1,525 TH if envelope unavailable)'),
          step('Cost per sqft', baseCost, 'currency'),
          step('Material waste', waste, 'pct'),
          step('Labor overhead', labor, 'pct'),
          step('Effective multiplier', (1 + waste) * (1 + labor), 'number'),
          step('Vertical cost', home.costs.verticalHard, 'currency'),
        ],
        ['sf_construction_cost_per_sqft', 'material_waste_pct', 'labor_overhead_pct'],
      );

      if (home.disposition === 'sale') {
        calcs[`${lotId}_margin`] = calc(
          `${lotId}_margin`,
          `Lot ${home.lotNumber} Gross Margin`,
          'Sale price (dwelling sqft × $/sqft) − total cost',
          home.grossMargin,
          'currency',
          [
            step('Dwelling sqft', home.dwellingSqFt, 'sqft'),
            step('Sale $/sqft', home.salePricePerSqFt ?? 0, 'currency'),
            step('Sale price', home.salePrice, 'currency'),
            step('Total cost', home.costs.total, 'currency'),
            step('Margin', home.grossMargin, 'currency'),
          ],
          [
            home.lotType === 'townhome' ? 'townhome_sale_price_per_sqft' : 'sf_sale_price_per_sqft',
            ...costSideAssumptionRefs,
          ],
        );
      }
    });
  });

  // ── Table column headers (generic explanations) ────────────────────
  calcs.col_dev_cost = calc(
    'col_dev_cost',
    'Development Cost',
    'Sum of per-home costs (land, engineering, studies, water rights, infrastructure × safety, vertical × waste × labor)',
    null,
    'text',
    [
      step('Land', shared.landPerHome, 'currency', 'per home, allocated'),
      step(
        'Infrastructure',
        shared.infraPerHome,
        'currency',
        `per home; includes safety ×${(infrastructure.safetyFactor ?? 1).toFixed(2)}`,
      ),
      step('Vertical', null, 'text', `sqft × $${baseCost}/sqft × (1+waste) × (1+labor)`),
    ],
    costSideAssumptionRefs,
  );

  calcs.col_sale_revenue = calc(
    'col_sale_revenue',
    'Sale Revenue',
    'Sum of (dwelling sqft × sale $/sqft) for for-sale homes only',
    null,
    'text',
    [
      step('SF sale $/sqft', map.sf_sale_price_per_sqft ?? 0, 'currency'),
      step(
        'Avg SF home',
        (projectTotals.avgSfDwellingSqFt ?? 0) * (map.sf_sale_price_per_sqft ?? 0),
        'currency',
      ),
      step('Townhome sale $/sqft', map.townhome_sale_price_per_sqft ?? 0, 'currency'),
      step(
        'Avg townhome',
        (projectTotals.avgTownhomeDwellingSqFt ?? 0) * (map.townhome_sale_price_per_sqft ?? 0),
        'currency',
      ),
    ],
    ['sf_sale_price_per_sqft', 'townhome_sale_price_per_sqft', 'sf_reserved_for_rent', 'townhome_reserved_for_rent'],
  );

  calcs.col_gross_margin = calc(
    'col_gross_margin',
    'Gross Margin',
    'Sale revenue − development cost (pre-financing)',
    null,
    'text',
    [],
    [...costSideAssumptionRefs, 'sf_sale_price_per_sqft', 'townhome_sale_price_per_sqft'],
  );

  calcs.col_loan_draw = calc(
    'col_loan_draw',
    'Loan Draw',
    'When cash is insufficient: (phase cost − cash) × loan advance %',
    null,
    'text',
    [],
    ['construction_loan_advance_pct'],
  );

  calcs.col_interest = calc(
    'col_interest',
    'Interest',
    'Outstanding debt × annual loan rate × (phase duration months ÷ 12), capitalized onto the loan',
    null,
    'text',
    [],
    ['construction_loan_rate'],
  );

  calcs.col_land = calc(
    'col_land',
    'Land (per lot)',
    'Total land acquisition ÷ total homes',
    shared.landPerHome,
    'currency',
    [
      step('Land cost total', map.land_cost_total ?? 0, 'currency'),
      step('Per home', shared.landPerHome, 'currency'),
    ],
    ['land_cost_total'],
  );

  calcs.col_infra = calc(
    'col_infra',
    'Infrastructure (per lot)',
    'Total infrastructure budget (× safety factor) ÷ residential homes',
    shared.infraPerHome,
    'currency',
    [
      step('Unadjusted infra subtotal', infrastructure.totalInfraBase ?? 0, 'currency'),
      step('Safety factor', infrastructure.safetyFactor ?? 1, 'number'),
      step('Total infrastructure', infrastructure.totalInfraBudget, 'currency'),
      step('Per home', shared.infraPerHome, 'currency'),
    ],
    ['infrastructure_safety_factor', ...Object.values(infraUnitCostKeys)],
  );

  calcs.col_vertical = calc(
    'col_vertical',
    'Vertical Construction',
    'Dwelling sqft × cost/sqft × (1 + waste) × (1 + labor)',
    null,
    'text',
    [
      step('Base cost per sqft', baseCost, 'currency'),
      step('Material waste', waste, 'pct'),
      step('Labor overhead', labor, 'pct'),
    ],
    ['sf_construction_cost_per_sqft', 'material_waste_pct', 'labor_overhead_pct'],
  );

  // Assumption input refs (direct values, not calculated)
  merged?.assumptions?.forEach((entry) => {
    if (!calcs[entry.id]) {
      calcs[entry.id] = calc(
        entry.id,
        entry.label,
        entry.description || 'User assumption — edit in the Assumptions panel',
        entry.value,
        entry.unit === 'ratio' ? 'pct' : entry.unit === 'USD' ? 'currency' : 'number',
        [step('Current value', entry.value, entry.unit === 'ratio' ? 'pct' : entry.unit === 'USD' ? 'currency' : 'number')],
        [],
        entry.source?.name ? `Source: ${entry.source.name}` : null,
      );
    }
  });

  return calcs;
}

function formatCurrencyPlain(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}

function formatNumberPlain(value) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(value);
}
