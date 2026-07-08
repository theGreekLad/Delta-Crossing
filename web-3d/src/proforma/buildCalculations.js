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
  const baseCost = map.sf_construction_cost_per_sqft ?? 168;

  const calcs = {};

  // ── Financial metrics ──────────────────────────────────────────────
  if (financials) {
    calcs.irr = calc(
      'irr',
      'Project IRR',
      'IRR(monthly equity cash flows), annualized to yearly rate',
      financials.irr,
      'pct',
      [
        step('Initial equity (month 0)', -financials.totalEquityInvested + (map.initial_equity ?? 0), 'currency'),
        step('Additional equity injections', financials.totalEquityInvested - (map.initial_equity ?? 0), 'currency'),
        step('Total equity invested', financials.totalEquityInvested, 'currency'),
        step('Exit equity value', financials.exitEquity, 'currency'),
        step('Cash flow periods', financials.equityCashFlows?.length ?? 0, 'number'),
      ],
      ['initial_equity', 'construction_loan_rate', 'construction_loan_advance_pct', 'homes_sold_per_month', 'months_to_build_home', 'parallel_homes_per_phase'],
      'IRR is solved numerically from the monthly equity cash flow series (construction draws, sale distributions, exit value).',
    );

    calcs.equityMultiple = calc(
      'equityMultiple',
      'Equity Multiple',
      'Exit equity value ÷ total equity invested',
      financials.equityMultiple,
      'multiple',
      [
        step('Exit equity value', financials.exitEquity, 'currency'),
        step('Total equity invested', financials.totalEquityInvested, 'currency'),
        step('Equity multiple', financials.equityMultiple, 'multiple'),
      ],
      ['initial_equity'],
    );

    calcs.returnOnCost = calc(
      'returnOnCost',
      'Return on Cost',
      '(Exit equity − total equity invested) ÷ total development cost',
      financials.returnOnCost,
      'pct',
      [
        step('Exit equity value', financials.exitEquity, 'currency'),
        step('Total equity invested', financials.totalEquityInvested, 'currency'),
        step('Net profit', financials.netProfit, 'currency'),
        step('Total development cost', projectTotals.totalDevelopmentCost, 'currency'),
      ],
      ['initial_equity'],
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
      ['sf_sale_price', 'townhome_sale_price', 'homes_sold_per_month'],
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
      ['sf_sale_price', 'townhome_sale_price', 'sf_construction_cost_per_sqft'],
    );

    calcs.projectDurationMonths = calc(
      'projectDurationMonths',
      'Project Duration',
      'Total months from start through final exit',
      financials.projectDurationMonths,
      'months',
      financials.phaseTimeline.map((p) =>
        step(`Phase ${p.phase}`, p.buildMonths + p.saleMonths, 'months', `${p.homeCount} homes`),
      ),
      ['months_to_build_home', 'parallel_homes_per_phase', 'homes_sold_per_month'],
    );

    calcs.paybackMonth = calc(
      'paybackMonth',
      'Equity Payback',
      'First month cumulative equity return ≥ 0',
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
      'Ending cash − ending debt + rental terminal value (if activated)',
      financials.exitEquity,
      'currency',
      [
        step('Ending cash', financials.endingCash ?? waterfall.endingCash, 'currency'),
        step('Ending debt', financials.endingDebt ?? waterfall.endingDebt, 'currency'),
        step('Rental terminal value @ 5% cap', financials.rentalTerminalValue ?? 0, 'currency'),
        step('Exit equity', financials.exitEquity, 'currency'),
      ],
      ['initial_equity', 'sf_rent_monthly', 'townhome_rent_monthly'],
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
      step('Commercial × AF/block', waterRights.commercialAcreFeet, 'number', `${waterRights.commercialCount} × ${waterRights.afPerCommercial} AF`),
      step('Total acre-feet', waterRights.totalAcreFeet, 'number'),
      step('Cost per acre-foot', waterRights.costPerAcreFoot, 'currency'),
      step('Total cost', waterRights.total, 'currency'),
    ],
    ['water_rights_af_per_lot', 'water_rights_af_per_commercial', 'water_rights_cost_per_acre_foot'],
    waterRights.notes,
  );

  calcs.totalDevelopmentCost = calc(
    'totalDevelopmentCost',
    'Total Development Cost',
    'Sum of per-home costs (land + engineering + studies + water rights + infra + vertical) for all homes',
    projectTotals.totalDevelopmentCost,
    'currency',
    [
      step('Land (allocated)', map.land_cost_total ?? 0, 'currency'),
      step('Engineering', map.engineering_total ?? 0, 'currency'),
      step('Studies', map.studies_total ?? 0, 'currency'),
      step('Water rights', waterRights.total, 'currency'),
      step('Infrastructure', infrastructure.totalInfraBudget, 'currency'),
      step('Vertical construction (all homes)', homeRows.reduce((s, h) => s + h.costs.verticalHard, 0), 'currency'),
      step('Total', projectTotals.totalDevelopmentCost, 'currency'),
    ],
    ['land_cost_total', 'engineering_total', 'studies_total', 'sf_construction_cost_per_sqft'],
  );

  calcs.totalSaleRevenue = calc(
    'totalSaleRevenue',
    'Total Sale Revenue',
    'Sum of sale prices for all for-sale homes',
    projectTotals.totalSaleRevenue,
    'currency',
    [
      step('SF for sale', projectTotals.sfForSale, 'number'),
      step('Townhome for sale', projectTotals.townhomeForSale, 'number'),
      step('SF sale price', map.sf_sale_price ?? 0, 'currency'),
      step('Townhome sale price', map.townhome_sale_price ?? 0, 'currency'),
      step('Total revenue', projectTotals.totalSaleRevenue, 'currency'),
    ],
    ['sf_sale_price', 'townhome_sale_price'],
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
  );

  calcs.endingCash = calc(
    'endingCash',
    'Ending Cash',
    'Cash balance after all phases complete (phase funding waterfall)',
    waterfall.endingCash,
    'currency',
    [
      step('Initial equity', map.initial_equity ?? 0, 'currency'),
      ...waterfall.timeline.flatMap((row) => [
        step(`Phase ${row.phase} — proceeds`, row.saleProceeds, 'currency'),
        step(`Phase ${row.phase} — costs & interest`, -(row.totalCost + row.interest), 'currency'),
      ]),
      step('Ending cash', waterfall.endingCash, 'currency'),
    ],
    ['initial_equity', 'construction_loan_rate', 'construction_loan_advance_pct'],
  );

  calcs.endingDebt = calc(
    'endingDebt',
    'Ending Debt',
    'Outstanding construction debt after all sale proceeds and paydowns',
    waterfall.endingDebt,
    'currency',
    [
      step('Peak draws across phases', waterfall.timeline.reduce((s, r) => s + r.financingDraw, 0), 'currency'),
      step('Ending debt', waterfall.endingDebt, 'currency'),
    ],
    ['construction_loan_advance_pct'],
    '85% of each month\'s sale proceeds pay down outstanding debt.',
  );

  // ── Shared per-home allocations ────────────────────────────────────
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
    'Total infrastructure budget ÷ residential homes',
    shared.infraPerHome,
    'currency',
    [
      step('Total infrastructure', infrastructure.totalInfraBudget, 'currency'),
      step('Residential homes', residentialHomes, 'number'),
      step('Per home', shared.infraPerHome, 'currency'),
    ],
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
  );

  calcs.totalInfraBudget = calc(
    'totalInfraBudget',
    'Total Infrastructure Cost',
    'Sum of all ordinance line items (quantity × unit cost)',
    infrastructure.totalInfraBudget,
    'currency',
    infrastructure.lineItems.map((item) =>
      step(item.label, item.amount, 'currency', `${item.quantity.toLocaleString()} ${item.unit} × ${item.unitCost.toLocaleString()}`),
    ),
    infrastructure.lineItems.flatMap((item) => {
      const mapKeys = {
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
      };
      return mapKeys[item.id] ? [mapKeys[item.id]] : [];
    }),
  );

  infrastructure.lineItems.forEach((item) => {
    calcs[`infra_${item.id}`] = calc(
      `infra_${item.id}`,
      item.label,
      `${item.quantity.toLocaleString()} ${item.unit} × ${formatCurrencyPlain(item.unitCost)}`,
      item.amount,
      'currency',
      [
        step('Quantity', item.quantity, item.unit === 'each' ? 'number' : 'lf', item.unit),
        step('Unit cost', item.unitCost, 'currency'),
        step('Amount', item.amount, 'currency'),
      ],
      [],
      item.ordinanceRef,
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
      step('Cap rate', 0.05, 'pct'),
      step('Implied value', rentalHoldout.capValueAt5Pct, 'currency'),
    ],
    ['sf_rent_monthly', 'townhome_rent_monthly'],
  );

  // ── Phase-level ────────────────────────────────────────────────────
  phaseResults.forEach((phase) => {
    const prefix = `phase_${phase.phase}`;
    calcs[`${prefix}_totalCost`] = calc(
      `${prefix}_totalCost`,
      `Phase ${phase.phase} Development Cost`,
      'Sum of per-home total costs in this phase',
      phase.totalCost,
      'currency',
      [
        step('Homes in phase', phase.homeCount, 'number'),
        step('Total cost', phase.totalCost, 'currency'),
        step('Avg per home', phase.avgCostPerHome, 'currency'),
      ],
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
      ['sf_sale_price', 'townhome_sale_price'],
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
    );

    // Waterfall row fields
    const wf = waterfall.timeline.find((r) => r.phase === phase.phase);
    if (wf) {
      calcs[`${prefix}_financingDraw`] = calc(
        `${prefix}_financingDraw`,
        `Phase ${phase.phase} Loan Draw`,
        'max(0, phase cost − available cash) × loan advance %',
        wf.financingDraw,
        'currency',
        [
          step('Phase cost', wf.totalCost, 'currency'),
          step('Loan advance %', map.construction_loan_advance_pct ?? 0, 'pct'),
          step('Loan draw', wf.financingDraw, 'currency'),
        ],
        ['construction_loan_advance_pct'],
      );

      calcs[`${prefix}_interest`] = calc(
        `${prefix}_interest`,
        `Phase ${phase.phase} Interest`,
        'Outstanding debt × loan rate × (sale months ÷ 12)',
        wf.interest,
        'currency',
        [
          step('Loan rate', map.construction_loan_rate ?? 0, 'pct'),
          step('Sale months', wf.saleMonths, 'number'),
          step('Interest', wf.interest, 'currency'),
        ],
        ['construction_loan_rate', 'homes_sold_per_month'],
      );

      calcs[`${prefix}_netProfit`] = calc(
        `${prefix}_netProfit`,
        `Phase ${phase.phase} Net Profit`,
        'Sale proceeds − phase cost − interest',
        wf.netProfit,
        'currency',
        [
          step('Sale proceeds', wf.saleProceeds, 'currency'),
          step('Phase cost', wf.totalCost, 'currency'),
          step('Interest', wf.interest, 'currency'),
          step('Net profit', wf.netProfit, 'currency'),
        ],
      );
    }

    // Per-lot in phase
    phase.homes.forEach((home) => {
      const lotId = `lot_${home.lotNumber}`;
      calcs[`${lotId}_total`] = calc(
        `${lotId}_total`,
        `Lot ${home.lotNumber} Total Cost`,
        'Land + engineering + studies + water rights + infra + vertical',
        home.costs.total,
        'currency',
        [
          step('Land', home.costs.land, 'currency'),
          step('Engineering', home.costs.engineering, 'currency'),
          step('Studies', home.costs.studies, 'currency'),
          step('Water rights', home.costs.waterRights, 'currency'),
          step('Infrastructure', home.costs.infrastructure, 'currency'),
          step('Vertical', home.costs.verticalHard, 'currency', `${home.dwellingSqFt.toLocaleString()} sqft`),
          step('Total', home.costs.total, 'currency'),
        ],
      );

      calcs[`${lotId}_vertical`] = calc(
        `${lotId}_vertical`,
        `Lot ${home.lotNumber} Vertical Cost`,
        `${home.dwellingSqFt.toLocaleString()} sqft × $${baseCost} × ${(1 + waste).toFixed(2)} × ${(1 + labor).toFixed(2)}`,
        home.costs.verticalHard,
        'currency',
        [
          step('Dwelling sqft', home.dwellingSqFt, 'sqft'),
          step('Cost per sqft', baseCost, 'currency'),
          step('With waste & labor', home.costs.verticalHard, 'currency'),
        ],
        ['sf_construction_cost_per_sqft', 'material_waste_pct', 'labor_overhead_pct'],
      );

      if (home.disposition === 'sale') {
        calcs[`${lotId}_margin`] = calc(
          `${lotId}_margin`,
          `Lot ${home.lotNumber} Gross Margin`,
          'Sale price − total cost',
          home.grossMargin,
          'currency',
          [
            step('Sale price', home.salePrice, 'currency'),
            step('Total cost', home.costs.total, 'currency'),
            step('Margin', home.grossMargin, 'currency'),
          ],
          home.lotType === 'townhome' ? ['townhome_sale_price'] : ['sf_sale_price'],
        );
      }
    });
  });

  // ── Table column headers (generic explanations) ────────────────────
  calcs.col_dev_cost = calc(
    'col_dev_cost',
    'Development Cost',
    'Sum of per-home costs (land, engineering, studies, water rights, infrastructure, vertical construction)',
    null,
    'text',
    [
      step('Land', shared.landPerHome, 'currency', 'per home, allocated'),
      step('Infrastructure', shared.infraPerHome, 'currency', 'per home, allocated'),
      step('Vertical', null, 'text', 'sqft × cost/sqft × waste × labor'),
    ],
  );

  calcs.col_sale_revenue = calc(
    'col_sale_revenue',
    'Sale Revenue',
    'Sum of sale prices for for-sale homes only (reserved rental units excluded)',
    null,
    'text',
    [
      step('SF sale price', map.sf_sale_price ?? 0, 'currency'),
      step('Townhome sale price', map.townhome_sale_price ?? 0, 'currency'),
    ],
    ['sf_sale_price', 'townhome_sale_price'],
  );

  calcs.col_gross_margin = calc(
    'col_gross_margin',
    'Gross Margin',
    'Sale revenue − development cost (pre-financing)',
    null,
    'text',
    [],
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
    'Outstanding debt × annual loan rate × (sale months ÷ 12)',
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
    'Total infrastructure budget ÷ residential homes',
    shared.infraPerHome,
    'currency',
    [
      step('Total infrastructure', infrastructure.totalInfraBudget, 'currency'),
      step('Per home', shared.infraPerHome, 'currency'),
    ],
  );

  calcs.col_vertical = calc(
    'col_vertical',
    'Vertical Construction',
    'Dwelling sqft × cost/sqft × (1 + waste) × (1 + labor)',
    null,
    'text',
    [],
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
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}
