import { useCallback, useEffect, useMemo, useState } from 'react';
import { platUrl, appUrl } from '../data/platUrls';
import {
  clearOverrides,
  formatCurrency,
  formatNumber,
  formatPct,
  mergeAssumptions,
  setOverride,
} from '../proforma/assumptions';
import { computeProforma } from '../proforma/computeProforma';

function AssumptionField({ entry, onChange }) {
  const isPct = entry.unit === 'ratio';
  const isCount = entry.unit === 'units';
  const displayValue = isPct ? (entry.value * 100).toFixed(1) : entry.value;
  const isOverridden = entry.value !== entry.default;

  return (
    <div className={`assumption-row ${isOverridden ? 'overridden' : ''}`}>
      <div className="assumption-label">
        <label htmlFor={entry.id}>{entry.label}</label>
        {entry.description ? <p className="assumption-desc">{entry.description}</p> : null}
      </div>
      <div className="assumption-input">
        <input
          id={entry.id}
          type="number"
          min={isCount ? 0 : undefined}
          step={isPct ? '0.1' : isCount ? '1' : entry.unit === 'USD/sqft' || entry.unit === 'acres' ? '0.1' : entry.unit === 'USD/LF' ? '1' : '1000'}
          value={displayValue}
          onChange={(event) => {
            const raw = Number(event.target.value);
            if (isCount) {
              onChange(entry.id, Math.max(0, Math.round(raw)));
              return;
            }
            onChange(entry.id, isPct ? raw / 100 : raw);
          }}
        />
        <span className="assumption-unit">{isPct ? '%' : entry.unit}</span>
      </div>
      <div className="assumption-source">
        {entry.source?.url?.startsWith('http') ? (
          <a href={entry.source.url} target="_blank" rel="noreferrer">
            {entry.source.name}
          </a>
        ) : (
          <span title={entry.source?.path || entry.source?.url}>{entry.source?.name}</span>
        )}
      </div>
    </div>
  );
}

function CategorySection({ title, items, onChange }) {
  if (!items.length) return null;
  return (
    <section className="assumption-section">
      <h3>{title}</h3>
      {items.map((entry) => (
        <AssumptionField key={entry.id} entry={entry} onChange={onChange} />
      ))}
    </section>
  );
}

const CATEGORY_LABELS = {
  site_area: 'Site Area',
  development: 'Land & Development',
  infrastructure: 'Infrastructure (Ord. 2025-317)',
  vertical_construction: 'Vertical Construction',
  soft_costs: 'Soft Costs & Contingency',
  financing: 'Financing',
  revenue: 'For-Sale Revenue',
  rental_reserve: 'Rent vs. Sale Reserve',
  schedule: 'Schedule & Absorption',
  rental_holdout: 'Rental Income (Reserved Units)',
};

export default function ProformaPage() {
  const [defaults, setDefaults] = useState(null);
  const [platData, setPlatData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('total');
  const [overrideTick, setOverrideTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [defaultsRes, manifestRes, lotsRes, commercialRes, siteAreasRes] = await Promise.all([
          fetch(platUrl('data/proforma-defaults.json')),
          fetch(platUrl('data/manifest.json')),
          fetch(platUrl('data/sheet1-lots.json')),
          fetch(platUrl('data/sheet1-commercial.json')),
          fetch(platUrl('data/sheet1-site-areas.json')),
        ]);

        if (!defaultsRes.ok || !manifestRes.ok || !lotsRes.ok) {
          throw new Error('Failed to load proforma data');
        }

        const [defaultsJson, manifest, lots, commercial, siteAreas] = await Promise.all([
          defaultsRes.json(),
          manifestRes.json(),
          lotsRes.json(),
          commercialRes.ok ? commercialRes.json() : [],
          siteAreasRes.ok ? siteAreasRes.json() : [],
        ]);

        const sheet = manifest.sheets.find((entry) => entry.id === 'sheet1');
        if (!sheet) throw new Error('Sheet1 not found in manifest');

        if (!cancelled) {
          setDefaults(defaultsJson);
          setPlatData({ manifest, sheet, lots, commercial, siteAreas });
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const merged = useMemo(() => {
    if (!defaults) return null;
    return mergeAssumptions(defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaults, overrideTick]);

  const result = useMemo(() => {
    if (!merged || !platData) return null;
    return computeProforma({
      defaults: merged,
      lots: platData.lots,
      commercial: platData.commercial,
      siteAreas: platData.siteAreas,
      sheet: platData.sheet,
      phaseOrder: merged.phaseOrder,
    });
  }, [merged, platData]);

  const handleOverride = useCallback((id, value) => {
    setOverride(id, value);
    setOverrideTick((tick) => tick + 1);
  }, []);

  const handleReset = useCallback(() => {
    clearOverrides();
    setOverrideTick((tick) => tick + 1);
  }, []);

  if (loading) {
    return (
      <div className="proforma-app loading-screen">
        <p>Loading proforma...</p>
      </div>
    );
  }

  if (error || !result || !merged) {
    return (
      <div className="proforma-app loading-screen error">
        <p>Failed to load proforma: {error?.message || 'Unknown error'}</p>
      </div>
    );
  }

  const assumptionsByCategory = merged.assumptions.reduce((acc, entry) => {
    const key = entry.category || 'other';
    if (!acc[key]) acc[key] = [];
    acc[key].push(entry);
    return acc;
  }, {});

  const activePhase = view.startsWith('phase-') ? Number(view.replace('phase-', '')) : null;
  const phaseData = activePhase
    ? result.phaseResults.find((entry) => entry.phase === activePhase)
    : null;

  return (
    <div className="proforma-app">
      <header className="proforma-header">
        <div>
          <h1>Delta Crossings Proforma</h1>
          <p>For-sale single-family & townhomes · Phase-funded development · {result.meta.ordinanceRef.title}</p>
        </div>
        <div className="proforma-header-actions">
          <a className="btn" href={platUrl('index.html')}>
            Plat Map
          </a>
          <a className="btn btn-primary" href={appUrl('index.html')}>
            3D View
          </a>
          <button type="button" className="btn" onClick={handleReset}>
            Reset Assumptions
          </button>
        </div>
      </header>

      <div className="proforma-layout">
        <aside className="assumptions-panel">
          <h2>Assumptions</h2>
          <p className="panel-note">Edit any value to see live updates. Sources are cited for traceability.</p>
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
            <CategorySection
              key={key}
              title={label}
              items={assumptionsByCategory[key] || []}
              onChange={handleOverride}
            />
          ))}
        </aside>

        <main className="proforma-main">
          <nav className="proforma-tabs" aria-label="Proforma views">
            <button
              type="button"
              className={view === 'total' ? 'active' : ''}
              onClick={() => setView('total')}
            >
              Total Project
            </button>
            <button
              type="button"
              className={view === 'waterfall' ? 'active' : ''}
              onClick={() => setView('waterfall')}
            >
              Phase Funding
            </button>
            <button
              type="button"
              className={view === 'infra' ? 'active' : ''}
              onClick={() => setView('infra')}
            >
              Infrastructure
            </button>
            <button
              type="button"
              className={view === 'rental' ? 'active' : ''}
              onClick={() => setView('rental')}
            >
              Rental Reserve
            </button>
            {result.phaseResults.map((phase) => (
              <button
                key={phase.phase}
                type="button"
                className={view === `phase-${phase.phase}` ? 'active' : ''}
                onClick={() => setView(`phase-${phase.phase}`)}
              >
                Phase {phase.phase}
              </button>
            ))}
          </nav>

          {view === 'total' && (
            <section className="proforma-section">
              <h2>Total Project Summary</h2>
              <div className="metric-grid">
                <div className="metric-card">
                  <span>Single-family homes</span>
                  <strong>{result.projectTotals.singleFamilyHomes}</strong>
                </div>
                <div className="metric-card">
                  <span>Townhomes</span>
                  <strong>{result.projectTotals.townhomeLots}</strong>
                </div>
                <div className="metric-card">
                  <span>For sale</span>
                  <strong>{result.projectTotals.forSaleHomes}</strong>
                </div>
                <div className="metric-card">
                  <span>Reserved for rent</span>
                  <strong>{result.projectTotals.reservedForRent}</strong>
                </div>
                <div className="metric-card">
                  <span>Avg dwelling size</span>
                  <strong>{formatNumber(result.projectTotals.avgDwellingSqFt)} sqft</strong>
                </div>
                <div className="metric-card">
                  <span>Total development cost</span>
                  <strong>{formatCurrency(result.projectTotals.totalDevelopmentCost)}</strong>
                </div>
                <div className="metric-card">
                  <span>Total sale revenue</span>
                  <strong>{formatCurrency(result.projectTotals.totalSaleRevenue)}</strong>
                </div>
                <div className="metric-card highlight">
                  <span>Gross margin (pre-finance)</span>
                  <strong>{formatCurrency(result.projectTotals.totalGrossMargin)}</strong>
                </div>
                <div className="metric-card">
                  <span>Avg cost / home</span>
                  <strong>{formatCurrency(result.projectTotals.avgCostPerHome)}</strong>
                </div>
                <div className="metric-card">
                  <span>Ending cash</span>
                  <strong>{formatCurrency(result.waterfall.endingCash)}</strong>
                </div>
                <div className="metric-card">
                  <span>Ending debt</span>
                  <strong>{formatCurrency(result.waterfall.endingDebt)}</strong>
                </div>
              </div>

              <h3>Per-Phase Overview</h3>
              <table className="proforma-table">
                <thead>
                  <tr>
                    <th>Phase</th>
                    <th>Homes</th>
                    <th>For Sale</th>
                    <th>Reserved</th>
                    <th>Dev Cost</th>
                    <th>Sale Revenue</th>
                    <th>Gross Margin</th>
                    <th>Avg Margin / Home</th>
                  </tr>
                </thead>
                <tbody>
                  {result.phaseResults.map((phase) => (
                    <tr key={phase.phase}>
                      <td>Phase {phase.phase}</td>
                      <td>{phase.homeCount}</td>
                      <td>{phase.sellableCount}</td>
                      <td>{phase.reservedCount}</td>
                      <td>{formatCurrency(phase.totalCost)}</td>
                      <td>{formatCurrency(phase.totalRevenue)}</td>
                      <td>{formatCurrency(phase.totalMargin)}</td>
                      <td>{formatCurrency(phase.homeCount ? phase.totalMargin / Math.max(phase.sellableCount, 1) : 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {view === 'waterfall' && (
            <section className="proforma-section">
              <h2>Phase Funding Waterfall</h2>
              <p className="section-lead">
                Early phase for-sale proceeds fund later phase development. Financing fills gaps when cash is
                insufficient.
              </p>
              <table className="proforma-table">
                <thead>
                  <tr>
                    <th>Phase</th>
                    <th>Built</th>
                    <th>Sold</th>
                    <th>Reserved</th>
                    <th>Phase Cost</th>
                    <th>Loan Draw</th>
                    <th>Interest</th>
                    <th>Sale Proceeds</th>
                    <th>Net Profit</th>
                    <th>Cash After</th>
                    <th>Debt After</th>
                  </tr>
                </thead>
                <tbody>
                  {result.waterfall.timeline.map((row) => (
                    <tr key={row.phase}>
                      <td>Phase {row.phase}</td>
                      <td>{row.homeCount}</td>
                      <td>{row.sellableCount}</td>
                      <td>{row.reservedCount}</td>
                      <td>{formatCurrency(row.totalCost)}</td>
                      <td>{formatCurrency(row.financingDraw)}</td>
                      <td>{formatCurrency(row.interest)}</td>
                      <td>{formatCurrency(row.saleProceeds)}</td>
                      <td>{formatCurrency(row.netProfit)}</td>
                      <td>{formatCurrency(row.cashAfterPhase)}</td>
                      <td>{formatCurrency(row.debtAfterPhase)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {view === 'infra' && (
            <section className="proforma-section">
              <h2>Infrastructure & Roads</h2>
              <p className="section-lead">{result.infrastructure.ordinanceNote}</p>
              {result.infrastructure.roadArea.warning ? (
                <p className="section-warning">{result.infrastructure.roadArea.warning}</p>
              ) : null}
              <p className="section-lead">{result.infrastructure.roadArea.formula}</p>
              {result.infrastructure.roadArea.notes ? (
                <p className="section-lead">{result.infrastructure.roadArea.notes}</p>
              ) : null}

              <h3>Road Area Calculation</h3>
              <table className="proforma-table">
                <thead>
                  <tr>
                    <th>Component</th>
                    <th>Area</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Total plat acreage</td>
                    <td>{formatNumber(result.infrastructure.roadArea.totalSiteSqFt / 43560, 2)} acres</td>
                  </tr>
                  <tr>
                    <td>Single-family lots</td>
                    <td>− {formatNumber(result.infrastructure.roadArea.sfSqFt / 43560, 2)} acres</td>
                  </tr>
                  <tr>
                    <td>Townhome lots</td>
                    <td>− {formatNumber(result.infrastructure.roadArea.thSqFt / 43560, 2)} acres</td>
                  </tr>
                  <tr>
                    <td>Commercial</td>
                    <td>− {formatNumber(result.infrastructure.roadArea.commercialSqFt / 43560, 2)} acres</td>
                  </tr>
                  <tr>
                    <td>Designated (canal, park, open space, etc.)</td>
                    <td>− {formatNumber(result.infrastructure.roadArea.designatedSqFt / 43560, 2)} acres</td>
                  </tr>
                  <tr>
                    <td>
                      <strong>Road area (remainder)</strong>
                    </td>
                    <td>
                      <strong>
                        {formatNumber(result.infrastructure.roadArea.roadSqFt / 43560, 2)} acres (
                        {formatNumber(result.infrastructure.totalRoadSqFt)} sqft)
                      </strong>
                    </td>
                  </tr>
                </tbody>
              </table>

              <h3>Ordinance Quantities</h3>
              <div className="metric-grid">
                <div className="metric-card">
                  <span>Centerline length</span>
                  <strong>{formatNumber(result.infrastructure.totalRoadLf)} LF</strong>
                </div>
                <div className="metric-card">
                  <span>Pavement area</span>
                  <strong>{formatNumber(result.infrastructure.pavementSqFt)} sqft</strong>
                </div>
                <div className="metric-card">
                  <span>Sidewalk area</span>
                  <strong>{formatNumber(result.infrastructure.sidewalkSqFt)} sqft</strong>
                </div>
                <div className="metric-card">
                  <span>Total infrastructure cost</span>
                  <strong>{formatCurrency(result.infrastructure.totalInfraBudget)}</strong>
                </div>
              </div>

              <h3>Cost Line Items</h3>
              <table className="proforma-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Ordinance</th>
                    <th>Quantity</th>
                    <th>Unit Cost</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {result.infrastructure.lineItems.map((row) => (
                    <tr key={row.id}>
                      <td>{row.label}</td>
                      <td>{row.ordinanceRef}</td>
                      <td>
                        {formatNumber(row.quantity, row.unit === 'each' ? 0 : 0)} {row.unit}
                      </td>
                      <td>{formatCurrency(row.unitCost)}</td>
                      <td>{formatCurrency(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4}>
                      <strong>Total infrastructure</strong>
                    </td>
                    <td>
                      <strong>{formatCurrency(result.infrastructure.totalInfraBudget)}</strong>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </section>
          )}

          {view === 'rental' && (
            <section className="proforma-section">
              <h2>Reserved Rental Units</h2>
              <p className="section-lead">{result.rentalHoldout.reason}</p>
              <div className="metric-grid">
                <div className="metric-card">
                  <span>Total reserved units</span>
                  <strong>{result.rentalHoldout.units}</strong>
                </div>
                <div className="metric-card">
                  <span>SF reserved</span>
                  <strong>{result.rentalHoldout.sfUnits}</strong>
                </div>
                <div className="metric-card">
                  <span>Townhome reserved</span>
                  <strong>{result.rentalHoldout.townhomeUnits}</strong>
                </div>
                <div className="metric-card">
                  <span>Rentals active</span>
                  <strong>{result.rentalHoldout.activated ? 'Yes' : 'No'}</strong>
                </div>
                <div className="metric-card">
                  <span>SF rent / unit</span>
                  <strong>{formatCurrency(result.rentalHoldout.sfRent)}</strong>
                </div>
                <div className="metric-card">
                  <span>Townhome rent / unit</span>
                  <strong>{formatCurrency(result.rentalHoldout.townhomeRent)}</strong>
                </div>
                <div className="metric-card highlight">
                  <span>Annual NOI (if active)</span>
                  <strong>{formatCurrency(result.rentalHoldout.annualNoi)}</strong>
                </div>
                <div className="metric-card">
                  <span>Potential NOI (all reserved)</span>
                  <strong>{formatCurrency(result.rentalHoldout.potentialAnnualNoi)}</strong>
                </div>
                <div className="metric-card">
                  <span>Implied value @ 5% cap</span>
                  <strong>{formatCurrency(result.rentalHoldout.capValueAt5Pct)}</strong>
                </div>
              </div>
              {result.rentalHoldout.reservedHomes.length > 0 && (
                <table className="proforma-table">
                  <thead>
                    <tr>
                      <th>Lot</th>
                      <th>Type</th>
                      <th>Phase</th>
                      <th>Dwelling</th>
                      <th>Monthly Rent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rentalHoldout.reservedHomes.map((home) => (
                      <tr key={home.lotNumber}>
                        <td>{home.lotNumber}</td>
                        <td>{home.lotType === 'townhome' ? 'Townhome' : 'Single-family'}</td>
                        <td>{home.phase}</td>
                        <td>{formatNumber(home.dwellingSqFt)} sqft</td>
                        <td>
                          {formatCurrency(
                            home.lotType === 'townhome'
                              ? result.rentalHoldout.townhomeRent
                              : result.rentalHoldout.sfRent,
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )}

          {phaseData && (
            <section className="proforma-section">
              <h2>Phase {phaseData.phase} Detail</h2>
              <div className="metric-grid">
                <div className="metric-card">
                  <span>Homes in phase</span>
                  <strong>{phaseData.homeCount}</strong>
                </div>
                <div className="metric-card">
                  <span>Phase development cost</span>
                  <strong>{formatCurrency(phaseData.totalCost)}</strong>
                </div>
                <div className="metric-card">
                  <span>Phase sale revenue</span>
                  <strong>{formatCurrency(phaseData.totalRevenue)}</strong>
                </div>
                <div className="metric-card highlight">
                  <span>Phase gross margin</span>
                  <strong>{formatCurrency(phaseData.totalMargin)}</strong>
                </div>
              </div>
              <table className="proforma-table">
                <thead>
                  <tr>
                    <th>Lot</th>
                    <th>Type</th>
                    <th>Disposition</th>
                    <th>Dwelling</th>
                    <th>Land</th>
                    <th>Infra</th>
                    <th>Vertical</th>
                    <th>Soft+Cont.</th>
                    <th>Total Cost</th>
                    <th>Sale Price</th>
                    <th>Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {phaseData.homes.map((home) => (
                    <tr key={home.lotNumber}>
                      <td>{home.lotNumber}</td>
                      <td>{home.lotType === 'townhome' ? 'Townhome' : 'SF'}</td>
                      <td>{home.disposition === 'rent' ? 'Rent' : 'Sale'}</td>
                      <td>{formatNumber(home.dwellingSqFt)} sqft</td>
                      <td>{formatCurrency(home.costs.land)}</td>
                      <td>{formatCurrency(home.costs.infrastructure)}</td>
                      <td>{formatCurrency(home.costs.verticalHard)}</td>
                      <td>{formatCurrency(home.costs.soft + home.costs.contingency)}</td>
                      <td>{formatCurrency(home.costs.total)}</td>
                      <td>{home.disposition === 'rent' ? '—' : formatCurrency(home.salePrice)}</td>
                      <td>
                        {home.disposition === 'rent'
                          ? '—'
                          : formatCurrency(home.grossMargin)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
