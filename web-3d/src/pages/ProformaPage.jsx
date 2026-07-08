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
          <a className="source-link" href={entry.source.url} target="_blank" rel="noreferrer">
            {entry.source.name}
          </a>
        ) : (
          <span className="source-label" title={entry.source?.path || entry.source?.url}>
            {entry.source?.name}
          </span>
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

function formatIrr(value) {
  if (value == null || Number.isNaN(value)) return '—';
  return formatPct(value);
}

function formatMultiple(value) {
  if (value == null || Number.isNaN(value)) return '—';
  return `${value.toFixed(2)}×`;
}

function formatMonths(value) {
  if (value == null || Number.isNaN(value)) return '—';
  const years = Math.floor(value / 12);
  const months = value % 12;
  if (years === 0) return `${months} mo`;
  if (months === 0) return `${years} yr`;
  return `${years} yr ${months} mo`;
}

function FinancialsView({ financials }) {
  if (!financials) {
    return (
      <section className="proforma-section">
        <h2>Financial Returns</h2>
        <p className="section-lead">Financial metrics are not available for this model yet.</p>
      </section>
    );
  }

  const totalMonths = Math.max(financials.projectDurationMonths, 1);
  const maxReturn = Math.max(
    ...financials.monthlyRows.map((row) => Math.abs(row.cumulativeEquityReturn)),
    1,
  );

  return (
    <section className="proforma-section financials-section">
      <h2>Financial Returns</h2>
      <p className="section-lead">
        Levered equity returns based on phase construction, monthly absorption, and exit value including
        reserved rental units at a 5% cap rate.
      </p>

      <div className="financials-hero">
        <div className="financials-hero-metric primary">
          <span>Project IRR</span>
          <strong>{formatIrr(financials.irr)}</strong>
          <p>Levered equity, annualized</p>
        </div>
        <div className="financials-hero-metric">
          <span>Equity Multiple</span>
          <strong>{formatMultiple(financials.equityMultiple)}</strong>
          <p>Exit value ÷ equity invested</p>
        </div>
        <div className="financials-hero-metric">
          <span>Return on Cost</span>
          <strong>{formatPct(financials.returnOnCost)}</strong>
          <p>Net profit ÷ total dev cost</p>
        </div>
        <div className="financials-hero-metric">
          <span>NPV @ 10%</span>
          <strong>{formatCurrency(financials.npvAt10Pct)}</strong>
          <p>Discounted equity cash flows</p>
        </div>
      </div>

      <div className="metric-grid">
        <div className="metric-card">
          <span>Total equity invested</span>
          <strong>{formatCurrency(financials.totalEquityInvested)}</strong>
        </div>
        <div className="metric-card">
          <span>Peak construction debt</span>
          <strong>{formatCurrency(financials.peakDebt)}</strong>
        </div>
        <div className="metric-card">
          <span>Total interest paid</span>
          <strong>{formatCurrency(financials.totalInterest)}</strong>
        </div>
        <div className="metric-card">
          <span>Total sale proceeds</span>
          <strong>{formatCurrency(financials.totalSaleProceeds)}</strong>
        </div>
        <div className="metric-card">
          <span>Gross profit margin</span>
          <strong>{formatPct(financials.profitMargin)}</strong>
        </div>
        <div className="metric-card">
          <span>Project duration</span>
          <strong>{formatMonths(financials.projectDurationMonths)}</strong>
        </div>
        <div className="metric-card">
          <span>Equity payback</span>
          <strong>{formatMonths(financials.paybackMonth)}</strong>
        </div>
        <div className="metric-card highlight">
          <span>Exit equity value</span>
          <strong>{formatCurrency(financials.exitEquity)}</strong>
        </div>
      </div>

      <h3>Development Timeline</h3>
      <div className="timeline-shell">
        <div className="timeline-axis">
          <span>Month 0</span>
          <span>Month {totalMonths}</span>
        </div>
        <div className="timeline-track">
          {financials.phaseTimeline.map((phase, index) => {
            const leftPct = ((phase.startMonth - 1) / totalMonths) * 100;
            const widthPct = ((phase.endMonth - phase.startMonth + 1) / totalMonths) * 100;
            const buildPct = (phase.buildMonths / (phase.buildMonths + phase.saleMonths)) * 100;
            return (
              <div
                key={phase.phase}
                className="timeline-phase"
                style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
              >
                <div className="timeline-phase-bar">
                  <div className="timeline-build" style={{ width: `${buildPct}%` }} />
                  <div className="timeline-sell" style={{ width: `${100 - buildPct}%` }} />
                </div>
                <div className="timeline-phase-label">
                  <strong>Phase {phase.phase}</strong>
                  <span>
                    {phase.homeCount} homes · {formatMonths(phase.buildMonths + phase.saleMonths)}
                  </span>
                </div>
                {index < financials.phaseTimeline.length - 1 ? (
                  <div className="timeline-connector" aria-hidden="true" />
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="timeline-legend">
          <span>
            <i className="legend-swatch build" /> Construction
          </span>
          <span>
            <i className="legend-swatch sell" /> Home sales
          </span>
        </div>
      </div>

      <h3>Cumulative Equity Return</h3>
      <div className="equity-chart" aria-label="Cumulative equity return over project timeline">
        {financials.monthlyRows.map((row) => {
          const heightPct = Math.max(4, (Math.abs(row.cumulativeEquityReturn) / maxReturn) * 100);
          const positive = row.cumulativeEquityReturn >= 0;
          return (
            <div
              key={`${row.month}-${row.label}`}
              className={`equity-bar ${positive ? 'positive' : 'negative'}`}
              style={{ height: `${heightPct}%` }}
              title={`Month ${row.month}: ${formatCurrency(row.cumulativeEquityReturn)}`}
            />
          );
        })}
      </div>

      <h3>Monthly Cash Flow</h3>
      <div className="financials-table-wrap">
        <table className="proforma-table financials-table">
        <thead>
          <tr>
            <th>Month</th>
            <th>Phase</th>
            <th>Stage</th>
            <th>Equity Flow</th>
            <th>Build Spend</th>
            <th>Sales</th>
            <th>Interest</th>
            <th>Debt</th>
            <th>Cumulative Return</th>
          </tr>
        </thead>
        <tbody>
          {financials.monthlyRows.map((row) => (
            <tr key={`${row.month}-${row.label}`}>
              <td>{row.month}</td>
              <td>{row.phase ? `Phase ${row.phase}` : '—'}</td>
              <td>
                <span className={`stage-pill ${row.stage}`}>{row.stage}</span>
              </td>
              <td className={row.equityFlow >= 0 ? 'pos' : 'neg'}>
                {formatCurrency(row.equityFlow)}
              </td>
              <td>{row.buildSpend ? formatCurrency(row.buildSpend) : '—'}</td>
              <td>{row.saleProceeds ? formatCurrency(row.saleProceeds) : '—'}</td>
              <td>{row.interest ? formatCurrency(row.interest) : '—'}</td>
              <td>{formatCurrency(row.debt)}</td>
              <td className={row.cumulativeEquityReturn >= 0 ? 'pos' : 'neg'}>
                {formatCurrency(row.cumulativeEquityReturn)}
              </td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>
    </section>
  );
}

const CATEGORY_LABELS = {
  development: 'Land & Development',
  infrastructure: 'Infrastructure Unit Costs',
  vertical_construction: 'Vertical Construction',
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
  const [view, setView] = useState('financials');
  const [overrideTick, setOverrideTick] = useState(0);
  const [assumptionsOpen, setAssumptionsOpen] = useState(() => {
    try {
      return localStorage.getItem('proforma-assumptions-open') !== 'false';
    } catch {
      return true;
    }
  });

  const toggleAssumptions = useCallback((open) => {
    setAssumptionsOpen(open);
    try {
      localStorage.setItem('proforma-assumptions-open', String(open));
    } catch {
      /* ignore storage errors */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [defaultsRes, manifestRes, lotsRes, commercialRes, roadSegmentsRes] = await Promise.all([
          fetch(platUrl('data/proforma-defaults.json')),
          fetch(platUrl('data/manifest.json')),
          fetch(platUrl('data/sheet1-lots.json')),
          fetch(platUrl('data/sheet1-commercial.json')),
          fetch(platUrl('data/sheet1-road-segments.json')),
        ]);

        if (!defaultsRes.ok || !manifestRes.ok || !lotsRes.ok) {
          throw new Error('Failed to load proforma data');
        }

        const [defaultsJson, manifest, lots, commercial, roadSegments] = await Promise.all([
          defaultsRes.json(),
          manifestRes.json(),
          lotsRes.json(),
          commercialRes.ok ? commercialRes.json() : [],
          roadSegmentsRes.ok ? roadSegmentsRes.json() : null,
        ]);

        const sheet = manifest.sheets.find((entry) => entry.id === 'sheet1');
        if (!sheet) throw new Error('Sheet1 not found in manifest');

        if (!cancelled) {
          setDefaults(defaultsJson);
          setPlatData({ manifest, sheet, lots, commercial, roadSegments });
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
      roadSegments: platData.roadSegments,
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

      <div className={`proforma-layout ${assumptionsOpen ? 'assumptions-open' : 'assumptions-collapsed'}`}>
        <aside className="assumptions-panel" aria-hidden={!assumptionsOpen}>
          <div className="assumptions-panel-header">
            <h2>Assumptions</h2>
            <button
              type="button"
              className="assumptions-panel-toggle"
              onClick={() => toggleAssumptions(false)}
              aria-label="Collapse assumptions panel"
              title="Hide assumptions"
            >
              ‹
            </button>
          </div>
          <div className="assumptions-panel-body">
            <p className="panel-note">Edit any value to see live updates. Sources are cited for traceability.</p>
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <CategorySection
                key={key}
                title={label}
                items={assumptionsByCategory[key] || []}
                onChange={handleOverride}
              />
            ))}
          </div>
        </aside>

        <main className="proforma-main">
          {!assumptionsOpen ? (
            <button
              type="button"
              className="assumptions-expand-tab"
              onClick={() => toggleAssumptions(true)}
              aria-label="Show assumptions panel"
              title="Show assumptions"
            >
              Assumptions ›
            </button>
          ) : null}
          <nav className="proforma-tabs" aria-label="Proforma views">
            <button
              type="button"
              className={view === 'financials' ? 'active' : ''}
              onClick={() => setView('financials')}
            >
              Financials
            </button>
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

          {view === 'financials' && <FinancialsView financials={result.financials} />}

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
                  <span>
                    Water rights ({formatNumber(result.waterRights.totalAcreFeet, 1)} AF)
                  </span>
                  <strong>{formatCurrency(result.waterRights.total)}</strong>
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

              <h3>Development Costs (project-wide)</h3>
              <table className="proforma-table">
                <tbody>
                  <tr>
                    <td>Land acquisition</td>
                    <td>{formatCurrency(result.map.land_cost_total)}</td>
                  </tr>
                  <tr>
                    <td>Engineering &amp; design</td>
                    <td>{formatCurrency(result.map.engineering_total)}</td>
                  </tr>
                  <tr>
                    <td>Studies &amp; reports</td>
                    <td>{formatCurrency(result.map.studies_total)}</td>
                  </tr>
                  <tr>
                    <td>
                      Culinary water rights ({formatNumber(result.waterRights.totalAcreFeet, 1)} AF
                      @ {formatCurrency(result.waterRights.costPerAcreFoot)}/AF)
                    </td>
                    <td>{formatCurrency(result.waterRights.total)}</td>
                  </tr>
                  <tr>
                    <td>Road &amp; utility infrastructure (Ord. 2025-317)</td>
                    <td>{formatCurrency(result.infrastructure.totalInfraBudget)}</td>
                  </tr>
                </tbody>
              </table>
              <p className="section-lead">{result.waterRights.notes}</p>

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

              <h3>Road Area (from Plat)</h3>
              <table className="proforma-table">
                <thead>
                  <tr>
                    <th>Component</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>ROW width (30&apos; each side of centerline)</td>
                    <td>{formatNumber(result.infrastructure.roadArea.rowWidthFt, 0)} ft</td>
                  </tr>
                  <tr>
                    <td>Centerline segments</td>
                    <td>{formatNumber(result.infrastructure.roadArea.segmentCount)}</td>
                  </tr>
                  <tr>
                    <td>Total centerline length</td>
                    <td>{formatNumber(result.infrastructure.totalRoadLf)} LF</td>
                  </tr>
                  <tr>
                    <td>
                      <strong>Road corridor area</strong>
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

              {result.infrastructure.roadArea.segments?.length ? (
                <>
                  <h3>Centerline Segments</h3>
                  <table className="proforma-table">
                    <thead>
                      <tr>
                        <th>Segment</th>
                        <th>Length</th>
                        <th>Orientation</th>
                        <th>Plat label</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.infrastructure.roadArea.segments.map((segment) => (
                        <tr key={segment.id}>
                          <td>{segment.id}</td>
                          <td>{formatNumber(segment.lengthFt, 1)} ft</td>
                          <td>{segment.orientation}</td>
                          <td>{segment.label}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : null}

              <h3>Ord. 2025-317 Quantities</h3>
              <table className="proforma-table">
                <tbody>
                  <tr>
                    <td>Pavement ({result.infrastructure.ordinanceSpecs.pavementWidthFt}&apos; per ST-103)</td>
                    <td>{formatNumber(result.infrastructure.pavementSqFt)} sqft</td>
                  </tr>
                  <tr>
                    <td>
                      Sidewalks ({result.infrastructure.ordinanceSpecs.sidewalkWidthFt}&apos; × 2 per ST-131)
                    </td>
                    <td>{formatNumber(result.infrastructure.sidewalkSqFt)} sqft</td>
                  </tr>
                  <tr>
                    <td>Curb &amp; gutter (both sides, ST-121)</td>
                    <td>{formatNumber(result.infrastructure.curbGutterLf)} LF</td>
                  </tr>
                  <tr>
                    <td>Water main in ROW (ST-113)</td>
                    <td>{formatNumber(result.infrastructure.totalRoadLf)} LF</td>
                  </tr>
                  <tr>
                    <td>Sewer main in ROW (ST-113)</td>
                    <td>{formatNumber(result.infrastructure.totalRoadLf)} LF</td>
                  </tr>
                  <tr>
                    <td>
                      Storm drain (
                      {formatNumber(result.infrastructure.ordinanceSpecs.stormNetworkCoveragePct * 100, 0)}% of
                      network)
                    </td>
                    <td>
                      {formatNumber(
                        result.infrastructure.totalRoadLf *
                          result.infrastructure.ordinanceSpecs.stormNetworkCoveragePct,
                      )}{' '}
                      LF
                    </td>
                  </tr>
                </tbody>
              </table>

              <h3>Ordinance Quantities Summary</h3>
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
