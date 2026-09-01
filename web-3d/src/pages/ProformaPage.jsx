import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SiteNav from '../components/SiteNav';
import { platUrl } from '../data/platUrls';
import {
  applyScenarioFromUrl,
  buildScenarioShareUrl,
  clearOverrides,
  clearScenarioFromUrl,
  formatCurrency,
  formatNumber,
  formatPct,
  loadOverrides,
  mergeAssumptions,
  setOverride,
  isRatioUnit,
} from '../proforma/assumptions';
import { computeProforma } from '../proforma/computeProforma';
import { buildCalculations } from '../proforma/buildCalculations';
import {
  CalcMetricCard,
  CalcTd,
  CalcTh,
  CalculationPanel,
} from '../proforma/CalculationPanel';

const INTEGER_UNITS = new Set(['units', 'homes', 'months']);

function formatAssumptionNumber(value, integer) {
  if (!Number.isFinite(value)) return '';
  if (integer) return String(Math.round(value));
  const rounded = Math.round(value * 1e8) / 1e8;
  return String(rounded);
}

function sanitizeNumericDraft(raw, integer) {
  let next = String(raw).replace(/[^\d.]/g, '');
  if (integer) return next.replace(/\./g, '');
  const dot = next.indexOf('.');
  if (dot === -1) return next;
  return next.slice(0, dot + 1) + next.slice(dot + 1).replace(/\./g, '');
}

function isCompleteNumericDraft(text) {
  return /^\d+(\.\d+)?$/.test(String(text).trim());
}

function parseNumericDraft(text, integer, min = 0) {
  if (!isCompleteNumericDraft(text) && !/^\d+\.$/.test(String(text).trim())) return null;
  const n = Number(String(text).trim());
  if (!Number.isFinite(n)) return null;
  const value = integer ? Math.round(n) : n;
  return Math.max(min, value);
}

function AssumptionNumberInput({ id, committedValue, integer = false, min = 0, onCommit }) {
  const [draft, setDraft] = useState(null);
  const commitTimer = useRef(null);
  const idle = formatAssumptionNumber(committedValue, integer);

  const clearTimer = () => {
    if (commitTimer.current != null) {
      window.clearTimeout(commitTimer.current);
      commitTimer.current = null;
    }
  };

  useEffect(() => () => {
    if (commitTimer.current != null) window.clearTimeout(commitTimer.current);
  }, []);

  const commitText = (text, finish) => {
    const parsed = parseNumericDraft(text, integer, min);
    if (parsed == null) {
      if (finish) setDraft(null);
      return;
    }
    if (Math.abs(parsed - committedValue) > 1e-10) onCommit(parsed);
    if (finish) setDraft(null);
  };

  return (
    <input
      id={id}
      type="text"
      inputMode={integer ? 'numeric' : 'decimal'}
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      value={draft ?? idle}
      onFocus={() => {
        setDraft(idle);
      }}
      onChange={(event) => {
        const next = sanitizeNumericDraft(event.target.value, integer);
        setDraft(next);
        clearTimer();
        if (!isCompleteNumericDraft(next)) return;
        commitTimer.current = window.setTimeout(() => commitText(next, false), 350);
      }}
      onBlur={() => {
        clearTimer();
        commitText(draft ?? idle, true);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur();
        }
        if (event.key === 'Escape') {
          clearTimer();
          setDraft(null);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function AssumptionField({ entry, onChange, highlighted, liveHint = null, isKey = false }) {
  const isPct = isRatioUnit(entry.unit);
  const isCount = INTEGER_UNITS.has(entry.unit);
  const isFlag = entry.unit === 'flag';
  const isOverridden = entry.value !== entry.default;
  const flagOn = Number(entry.value) >= 0.5;

  return (
    <div className={`assumption-row ${isOverridden ? 'overridden' : ''} ${highlighted ? 'assumption-highlight' : ''} ${isKey ? 'is-key' : ''}`}>
      <div className="assumption-label">
        <label htmlFor={entry.id} title={entry.description || undefined}>
          {entry.label}
          {isKey ? (
            <span className="assumption-key-mark" title="Key driver">
              *
            </span>
          ) : null}
        </label>
        {entry.source?.url?.startsWith('http') ? (
          <a className="assumption-source-link" href={entry.source.url} target="_blank" rel="noreferrer">
            {entry.source.name}
          </a>
        ) : entry.source?.name ? (
          <span className="assumption-source-link is-local" title={entry.source.path || entry.source.url}>
            {entry.source.name}
          </span>
        ) : null}
      </div>
      <div className="assumption-input-wrap">
        <div className="assumption-input">
          {isFlag ? (
            <>
              <input
                id={entry.id}
                type="checkbox"
                className="assumption-flag"
                checked={flagOn}
                onChange={(event) => onChange(entry.id, event.target.checked ? 1 : 0)}
              />
              <span className="assumption-unit">{flagOn ? 'On' : 'Off'}</span>
            </>
          ) : (
            <>
              <AssumptionNumberInput
                id={entry.id}
                committedValue={isPct ? entry.value * 100 : entry.value}
                integer={isCount}
                onCommit={(raw) => onChange(entry.id, isPct ? raw / 100 : raw)}
              />
              <span className="assumption-unit">{isPct ? '%' : entry.unit}</span>
            </>
          )}
        </div>
      </div>
      {liveHint ? <p className="assumption-live-hint">{liveHint}</p> : null}
    </div>
  );
}

function CategorySection({
  title,
  items,
  onChange,
  highlightId,
  liveHints = {},
  defaultOpen = false,
  collapseNote = null,
  sectionId = null,
  mainIds = new Set(),
}) {
  const [open, setOpen] = useState(defaultOpen);
  const containsHighlight = Boolean(highlightId && items.some((entry) => entry.id === highlightId));

  useEffect(() => {
    if (containsHighlight) setOpen(true);
  }, [containsHighlight, highlightId]);

  if (!items.length) return null;

  const panelId = sectionId ? `assumption-section-${sectionId}` : undefined;

  return (
    <section className={`assumption-section ${open ? 'is-open' : 'is-collapsed'}`}>
      <button
        type="button"
        className="assumption-section-toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
      >
        <span className="assumption-section-title">{title}</span>
        <span className="assumption-section-meta">
          {!open ? <span className="assumption-section-count">{items.length}</span> : null}
          <span className="assumption-section-chevron" aria-hidden="true">
            {open ? '▾' : '▸'}
          </span>
        </span>
      </button>
      {!open && collapseNote ? (
        <p className="assumption-section-collapsed-note">{collapseNote}</p>
      ) : null}
      {open ? (
        <div id={panelId} className="assumption-section-body">
          {items.map((entry) => (
            <AssumptionField
              key={entry.id}
              entry={entry}
              onChange={onChange}
              highlighted={entry.id === highlightId}
              liveHint={liveHints[entry.id] || null}
              isKey={mainIds.has(entry.id)}
            />
          ))}
        </div>
      ) : null}
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

function formatHomesRunning(thisMonth, total, ofTotal) {
  const running = total ?? 0;
  const of = ofTotal != null ? ` of ${ofTotal}` : '';
  if (thisMonth > 0) {
    return { text: `+${thisMonth} · ${running}`, title: `${thisMonth} this month · ${running}${of} to date` };
  }
  return { text: String(running), title: `${running}${of} to date` };
}

function HomesRunningCell({ thisMonth, total, ofTotal }) {
  const { text, title } = formatHomesRunning(thisMonth, total, ofTotal);
  return (
    <td className={`num ${thisMonth > 0 ? 'homes-delta' : ''}`} title={title}>
      {text}
    </td>
  );
}

function formatSpendBreakdown(breakdown) {
  if (!breakdown) return undefined;
  const parts = [
    ['Land', breakdown.land],
    ['Engineering', breakdown.engineering],
    ['Studies', breakdown.studies],
    ['Water rights', breakdown.waterRights],
    ['Infrastructure', breakdown.infrastructure],
    ['Vertical', breakdown.vertical],
  ]
    .filter(([, amount]) => amount > 0)
    .map(([label, amount]) => `${label}: ${formatCurrency(amount)}`);
  return parts.length ? parts.join(' · ') : undefined;
}

async function readJsonResponse(response, label) {
  const url = response.url || label;
  if (!response.ok) {
    throw new Error(`${label} failed (${response.status}) at ${url}`);
  }

  const text = await response.text();
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('json') && text.trimStart().startsWith('<')) {
    throw new Error(`${label} returned HTML instead of JSON at ${url}. Use the Vite dev server (npm run dev in web-3d).`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} returned invalid JSON at ${url}`);
  }
}

const SHOW_SELF_FUND_STRIP = false;

function FinancialsView({ financials, onShowCalc, onApplySelfFund }) {
  if (!financials) {
    return (
      <section className="proforma-section">
        <h2>Financial Returns</h2>
        <p className="section-lead">Financial metrics are not available for this model yet.</p>
      </section>
    );
  }

  const totalMonths = Math.max(financials.projectDurationMonths, 1);
  const maxPhaseMonths = Math.max(
    ...financials.phaseTimeline.map(
      (phase) => phase.durationMonths ?? phase.endMonth - phase.startMonth + 1,
    ),
    1,
  );
  const maxReturn = Math.max(
    ...financials.monthlyRows.map((row) => Math.abs(row.cumulativeEquityReturn)),
    1,
  );

  return (
    <section className="proforma-section financials-section">
      <h2>Financial Returns</h2>
      <p className="section-lead">
        Levered equity returns with land/engineering/studies at project start, phase infrastructure and
        water rights upfront per phase, vertical during construction, and sales as build waves finish.
        Profits are swept to equity after keeping enough cash to keep Homes under construction
        going and to pay the next phase’s roads and water, unless Keep sale proceeds is on. Sweeps come from sale proceeds only —
        starting cash and later equity calls are never distributed. Exit value is leftover cash, debt, and
        reserved rental units at a 5% cap rate.
      </p>

      {SHOW_SELF_FUND_STRIP && financials.selfFundCashRequired > 0 ? (
        <div className="self-fund-strip">
          <CalcMetricCard calcId="selfFundCashRequired" onShow={onShowCalc} highlight>
            <span>Cash to self-fund (no debt, no later checks)</span>
            <strong>{formatCurrency(financials.selfFundCashRequired)}</strong>
          </CalcMetricCard>
          <div className="self-fund-strip-copy">
            <p>
              Put this in <strong>Starting equity / cash</strong> under Financing — not in Land
              &amp; Development. Land is a cost; this is the working-capital hole before the first
              closings
              {financials.selfFundTroughMonth
                ? ` (month ${financials.selfFundTroughMonth})`
                : ''}
              .
            </p>
            {onApplySelfFund ? (
              <button type="button" className="btn btn-primary" onClick={onApplySelfFund}>
                Use as starting cash (no loan, keep proceeds)
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="financials-hero">
        <button
          type="button"
          className="financials-hero-metric primary calc-hero"
          onClick={() => onShowCalc?.('irr')}
        >
          <span>Project IRR</span>
          <strong>{formatIrr(financials.irr)}</strong>
          <p>Levered equity with profit sweeps, annualized</p>
          <span className="calc-hint" aria-hidden="true">ⓘ</span>
        </button>
        <button
          type="button"
          className="financials-hero-metric calc-hero"
          onClick={() => onShowCalc?.('equityMultiple')}
        >
          <span>Equity Multiple</span>
          <strong>{formatMultiple(financials.equityMultiple)}</strong>
          <p>Distributions + residual ÷ equity invested</p>
          <span className="calc-hint" aria-hidden="true">ⓘ</span>
        </button>
        <button
          type="button"
          className="financials-hero-metric calc-hero"
          onClick={() => onShowCalc?.('returnOnCost')}
        >
          <span>Return on Cost</span>
          <strong>{formatPct(financials.returnOnCost)}</strong>
          <p>Net profit ÷ total dev cost</p>
          <span className="calc-hint" aria-hidden="true">ⓘ</span>
        </button>
      </div>

      <div className="metric-grid">
        <CalcMetricCard calcId="totalEquityInvested" onShow={onShowCalc}>
          <span>Total equity invested</span>
          <strong>{formatCurrency(financials.totalEquityInvested)}</strong>
        </CalcMetricCard>
        <CalcMetricCard calcId="additionalEquityInjections" onShow={onShowCalc}>
          <span>Additional equity calls</span>
          <strong>{formatCurrency(financials.additionalEquityInjections ?? 0)}</strong>
        </CalcMetricCard>
        <CalcMetricCard calcId="totalEquityDistributions" onShow={onShowCalc} highlight>
          <span>Cash swept to equity</span>
          <strong>{formatCurrency(financials.totalEquityDistributions)}</strong>
        </CalcMetricCard>
        <CalcMetricCard calcId="peakDebt" onShow={onShowCalc}>
          <span>Peak construction debt</span>
          <strong>{formatCurrency(financials.peakDebt)}</strong>
        </CalcMetricCard>
        <CalcMetricCard calcId="totalInterest" onShow={onShowCalc}>
          <span>Total interest paid</span>
          <strong>{formatCurrency(financials.totalInterest)}</strong>
        </CalcMetricCard>
        <CalcMetricCard calcId="totalSaleProceeds" onShow={onShowCalc}>
          <span>Total sale proceeds</span>
          <strong>{formatCurrency(financials.totalSaleProceeds)}</strong>
        </CalcMetricCard>
        <CalcMetricCard calcId="profitMargin" onShow={onShowCalc}>
          <span>Gross profit margin</span>
          <strong>{formatPct(financials.profitMargin)}</strong>
        </CalcMetricCard>
        <CalcMetricCard calcId="projectDurationMonths" onShow={onShowCalc}>
          <span>Project duration</span>
          <strong>{formatMonths(financials.projectDurationMonths)}</strong>
        </CalcMetricCard>
        <CalcMetricCard calcId="paybackMonth" onShow={onShowCalc}>
          <span>Equity payback</span>
          <strong>{formatMonths(financials.paybackMonth)}</strong>
        </CalcMetricCard>
        <CalcMetricCard calcId="exitEquity" onShow={onShowCalc}>
          <span>Residual exit equity</span>
          <strong>{formatCurrency(financials.exitEquity)}</strong>
        </CalcMetricCard>
      </div>

      <h3>Development Timeline</h3>
      <div className="timeline-shell">
        <div className="timeline-axis">
          <span>Month 0</span>
          <span>Month {totalMonths}</span>
        </div>
        <div className="timeline-track">
          {financials.acquisitionCosts?.total > 0 ? (
            <div
              className="timeline-phase timeline-acquisition"
              style={{
                left: '0%',
                width: `${(1 / totalMonths) * 100}%`,
                '--phase-mobile-width': `${(1 / maxPhaseMonths) * 100}%`,
              }}
              title={`Acquisition — land & soft costs · ${formatCurrency(financials.acquisitionCosts.total)}`}
            >
              <div className="timeline-phase-bar">
                <div className="timeline-acquire" style={{ width: '100%' }} />
              </div>
            </div>
          ) : null}
          {financials.phaseTimeline.map((phase, index) => {
            const phaseMonths = phase.durationMonths ?? phase.endMonth - phase.startMonth + 1;
            const leftPct = ((phase.startMonth - 1) / totalMonths) * 100;
            const widthPct = (phaseMonths / totalMonths) * 100;
            const mobileWidthPct = (phaseMonths / maxPhaseMonths) * 100;
            const siteworkPct = phaseMonths > 0 ? (1 / phaseMonths) * 100 : 0;
            const buildPct = (phase.buildMonths / phaseMonths) * 100;
            const sellStartPct =
              (((phase.salesStartOffset ?? phase.buildMonths + 1) - 1) / phaseMonths) * 100;
            const sellPct = Math.max(0, 100 - sellStartPct);
            return (
              <div
                key={phase.phase}
                className="timeline-phase"
                style={{
                  left: `${leftPct}%`,
                  width: `${widthPct}%`,
                  '--phase-mobile-width': `${mobileWidthPct}%`,
                }}
                title={`Phase ${phase.phase}`}
              >
                <div className="timeline-phase-bar">
                  <div className="timeline-sitework" style={{ width: `${siteworkPct}%` }} />
                  <div className="timeline-build" style={{ width: `${buildPct}%` }} />
                  {phase.saleMonths > 0 ? (
                    <div
                      className="timeline-sell"
                      style={{ left: `${sellStartPct}%`, width: `${sellPct}%` }}
                    />
                  ) : null}
                </div>
                <div className="timeline-phase-label">
                  <span>
                    {phase.homeCount} homes · {formatMonths(phaseMonths)}
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
            <i className="legend-swatch acquire" /> Land & soft costs
          </span>
          <span>
            <i className="legend-swatch sitework" /> Phase infra / water
          </span>
          <span>
            <i className="legend-swatch build" /> Vertical construction
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
      <p className="section-lead">
        {financials.keepSaleProceeds
          ? 'Sale proceeds stay in the project. Distributed stays at $0 until exit; In reserve is the full cash balance.'
          : 'After each month’s spend, sales, and debt paydown, leftover sale proceeds above the construction reserve are distributed. The reserve is the vertical float (homes under construction) plus the next phase’s infrastructure and water, so the next sitework package is paid from cash on hand instead of a new equity call. Starting cash and equity calls are never swept. In reserve is what stays in the project; Distributed is sale proceeds paid out to equity.'}{' '}
        Rows with an extra equity call are marked. The self-fund low point is month{' '}
        {financials.selfFundTroughMonth ?? '—'}. Built is homes completed (a construction wave
        finishing); Sold is closings. Both are running totals.
      </p>
      <div className="financials-table-wrap">
        <table className="proforma-table financials-table">
        <thead>
          <tr>
            <th>Month</th>
            <th>Phase</th>
            <th>Stage</th>
            <th title="Homes completed this month · running total">Built</th>
            <th title="Homes closed this month · running total">Sold</th>
            <th>Equity Flow</th>
            <th title="Sale proceeds swept to equity this month (never contributed cash)">Distributed</th>
            <th title="Cash kept in the project after this month’s sweep">In reserve</th>
            <th>Dev Spend</th>
            <th>Sales</th>
            <th>Interest</th>
            <th>Debt</th>
            <th>Cumulative Return</th>
          </tr>
        </thead>
        <tbody>
          {financials.monthlyRows.map((row) => (
            <tr
              key={`${row.month}-${row.label}`}
              className={[
                row.equityInjection > 0 ? 'row-equity-call' : '',
                row.month === financials.selfFundTroughMonth ? 'row-cash-trough' : '',
              ]
                .filter(Boolean)
                .join(' ') || undefined}
            >
              <td>{row.month}</td>
              <td>{row.phase ? `Phase ${row.phase}` : '—'}</td>
              <td>
                <span className={`stage-pill ${row.stage}`}>{row.stage}</span>
              </td>
              <HomesRunningCell
                thisMonth={row.homesBuiltThisMonth || 0}
                total={row.homesBuilt}
                ofTotal={row.homesBuiltOf}
              />
              <HomesRunningCell
                thisMonth={row.homesSoldThisMonth || 0}
                total={row.homesSold}
                ofTotal={row.homesSoldOf}
              />
              <td
                className={row.equityFlow >= 0 ? 'pos' : 'neg'}
                title={
                  row.equityInjection
                    ? `Includes equity injection of ${formatCurrency(row.equityInjection)}`
                    : undefined
                }
              >
                {formatCurrency(row.equityFlow)}
              </td>
              <td className={`num ${row.distribution > 0 ? 'pos' : ''}`}>
                {formatCurrency(row.distribution || 0)}
              </td>
              <td
                className="num"
                title={
                  row.cashReserve
                    ? `Target reserve ${formatCurrency(row.cashReserve)} — ${formatCurrency(row.verticalReserve || 0)} vertical float + ${formatCurrency(row.nextPhaseInfraReserve || 0)} next-phase roads & water`
                    : undefined
                }
              >
                {formatCurrency(row.cash ?? 0)}
              </td>
              <td title={formatSpendBreakdown(row.spendBreakdown)}>
                {row.buildSpend ? formatCurrency(row.buildSpend) : '—'}
              </td>
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

const MAIN_ASSUMPTION_IDS = [
  'land_cost_total',
  'water_equity_acre_feet',
  'infrastructure_safety_factor',
  'sf_construction_cost_per_sqft',
  'townhome_construction_cost_per_sqft',
  'initial_equity',
];

const CATEGORY_LABELS = {
  development: 'Land & Development',
  revenue: 'For-Sale Revenue',
  vertical_construction: 'Vertical Construction',
  financing: 'Financing',
  infrastructure: 'Infrastructure Unit Costs',
  rental: 'Rental Holdout',
  schedule: 'Schedule & Absorption',
};

const CATEGORY_COLLAPSE_NOTES = {
  development:
    'Opens water equity (owned AF), AF/lot requirement, and city $/AF. Owned water is drawn home-by-home in construction order before any city purchase.',
  infrastructure:
    'Opens asphalt, curb, utilities, lights, and other unit costs. Use to match contractor bids or stress individual line items beyond the safety factor.',
  vertical_construction:
    'Opens single-family and townhome $/sqft, plus foundation and labor overhead. Use when the attached product does not cost the same as detached.',
  financing:
    'Opens starting cash, keep-proceeds, loan rate, and advance %. Starting cash is where self-fund working capital goes — not Land & Development. Use keep-proceeds + 0% loan to finish without later checks.',
  revenue:
    'Opens SF and townhome sale $/sqft. Use to reprice the absorption case; live avg-home equivalents update under each input.',
  rental:
    'Opens reserve counts, rents, vacancy, and opex. Use for mixed sale/rent exit and rental terminal value after debt is retired.',
  schedule:
    'Opens build pace, parallel homes, and monthly absorption. Parallel homes sizes the vertical cash float; the reserve also holds the next phase’s roads and water. Use when testing timeline, peak debt, and IRR duration.',
};

export default function ProformaPage() {
  const [defaults, setDefaults] = useState(null);
  const [platData, setPlatData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('financials');
  const [overrideTick, setOverrideTick] = useState(0);
  const [activeCalcId, setActiveCalcId] = useState(null);
  const [highlightAssumptionId, setHighlightAssumptionId] = useState(null);
  const [shareStatus, setShareStatus] = useState(null);
  const [scenarioBanner, setScenarioBanner] = useState(null);
  const [assumptionsOpen, setAssumptionsOpen] = useState(() => {
    try {
      return localStorage.getItem('proforma-assumptions-open') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const applied = applyScenarioFromUrl();
    if (applied == null) return;
    const count = Object.keys(applied).length;
    setScenarioBanner(
      count
        ? `Loaded shared scenario (${count} custom assumption${count === 1 ? '' : 's'}).`
        : 'Opened a shared link with no custom assumptions (defaults).',
    );
    setOverrideTick((tick) => tick + 1);
  }, []);

  useEffect(() => {
    if (!shareStatus) return undefined;
    const timer = window.setTimeout(() => setShareStatus(null), 2500);
    return () => window.clearTimeout(timer);
  }, [shareStatus]);

  useEffect(() => {
    if (!scenarioBanner) return undefined;
    const timer = window.setTimeout(() => setScenarioBanner(null), 6000);
    return () => window.clearTimeout(timer);
  }, [scenarioBanner]);

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
          fetch(`${platUrl('data/proforma-defaults.json')}?v=10`),
          fetch(platUrl('data/manifest.json')),
          fetch(platUrl('data/sheet1-lots.json')),
          fetch(platUrl('data/sheet1-commercial.json')),
          fetch(platUrl('data/sheet1-road-segments.json')),
        ]);

        if (!defaultsRes.ok || !manifestRes.ok || !lotsRes.ok) {
          throw new Error('Failed to load proforma data');
        }

        const [defaultsJson, manifest, lots, commercial, roadSegments] = await Promise.all([
          readJsonResponse(defaultsRes, 'Proforma defaults'),
          readJsonResponse(manifestRes, 'Plat manifest'),
          readJsonResponse(lotsRes, 'Sheet1 lots'),
          commercialRes.ok ? readJsonResponse(commercialRes, 'Commercial lots') : [],
          roadSegmentsRes.ok ? readJsonResponse(roadSegmentsRes, 'Road segments') : null,
        ]);

        if (!Array.isArray(defaultsJson?.assumptions) || defaultsJson.assumptions.length < 1) {
          throw new Error('Proforma defaults missing assumptions list');
        }
        const requiredIds = [
          'infrastructure_safety_factor',
          'gas_main_per_lf',
          'electric_conduit_per_lf',
          'telecom_conduit_per_lf',
          'keep_sale_proceeds',
          'townhome_construction_cost_per_sqft',
          'water_equity_acre_feet',
          'foundation_pct',
          'electric_transformer_each',
          'street_light_each',
        ];
        const loadedIds = new Set(defaultsJson.assumptions.map((a) => a.id));
        const missing = requiredIds.filter((id) => !loadedIds.has(id));
        if (missing.length) {
          throw new Error(
            `Stale proforma defaults (missing ${missing.join(', ')}). Hard-refresh or clear cache.`,
          );
        }

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

  const calculations = useMemo(() => {
    if (!result || !merged) return {};
    return buildCalculations(result, merged);
  }, [result, merged]);

  const showCalc = useCallback((calcId) => {
    setActiveCalcId(calcId);
  }, []);

  const closeCalc = useCallback(() => {
    setActiveCalcId(null);
  }, []);

  const jumpToAssumption = useCallback((assumptionId) => {
    toggleAssumptions(true);
    setHighlightAssumptionId(assumptionId);
    setActiveCalcId(null);
    requestAnimationFrame(() => {
      const el = document.getElementById(assumptionId);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.focus({ preventScroll: true });
    });
  }, [toggleAssumptions]);

  useEffect(() => {
    if (!highlightAssumptionId) return undefined;
    const timer = window.setTimeout(() => setHighlightAssumptionId(null), 2500);
    return () => window.clearTimeout(timer);
  }, [highlightAssumptionId]);

  const handleOverride = useCallback((id, value) => {
    setOverride(id, value);
    setOverrideTick((tick) => tick + 1);
  }, []);

  const handleReset = useCallback(() => {
    clearOverrides();
    clearScenarioFromUrl();
    setScenarioBanner(null);
    setOverrideTick((tick) => tick + 1);
  }, []);

  const handleShareScenario = useCallback(async () => {
    const url = buildScenarioShareUrl(loadOverrides());
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        window.prompt('Copy this scenario link:', url);
      }
      const count = Object.keys(loadOverrides()).length;
      setShareStatus(count ? 'Scenario link copied' : 'Defaults link copied');
      window.history.replaceState({}, '', url);
    } catch {
      window.prompt('Copy this scenario link:', url);
      setShareStatus('Copy the link from the prompt');
    }
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
    let key = entry.category || 'other';
    if (key === 'rental_reserve' || key === 'rental_holdout') key = 'rental';
    if (!acc[key]) acc[key] = [];
    acc[key].push(entry);
    return acc;
  }, {});

  const mainAssumptionIdSet = new Set(MAIN_ASSUMPTION_IDS);

  const avgSfSqFt = result.projectTotals.avgSfDwellingSqFt || 0;
  const avgThSqFt = result.projectTotals.avgTownhomeDwellingSqFt || 0;
  const sfRate = result.map.sf_sale_price_per_sqft ?? 0;
  const thRate = result.map.townhome_sale_price_per_sqft ?? 0;
  const sfVertical = result.map.sf_construction_cost_per_sqft ?? 0;
  const thVertical = result.map.townhome_construction_cost_per_sqft ?? sfVertical;
  const verticalMult =
    (1 + (result.map.foundation_pct ?? 0.07)) * (1 + (result.map.labor_overhead_pct ?? 0.1));
  const assumptionLiveHints = {
    sf_sale_price_per_sqft: avgSfSqFt
      ? `≈ ${formatCurrency(avgSfSqFt * sfRate)} avg single-family (${formatNumber(avgSfSqFt)} sqft)`
      : null,
    townhome_sale_price_per_sqft: avgThSqFt
      ? `≈ ${formatCurrency(avgThSqFt * thRate)} avg townhome (${formatNumber(avgThSqFt)} sqft)`
      : null,
    sf_construction_cost_per_sqft: avgSfSqFt
      ? `≈ ${formatCurrency(avgSfSqFt * sfVertical * verticalMult)} avg SF vertical after foundation & labor`
      : null,
    townhome_construction_cost_per_sqft: avgThSqFt
      ? `≈ ${formatCurrency(avgThSqFt * thVertical * verticalMult)} avg townhome vertical after foundation & labor`
      : null,
    parallel_homes_per_phase: result.financials?.avgVerticalPerHome
      ? `Vertical float ≈ ${formatCurrency((result.map.parallel_homes_per_phase ?? 0) * result.financials.avgVerticalPerHome)} (${result.map.parallel_homes_per_phase ?? 0} homes). Reserve also holds the next phase’s roads & water (${formatCurrency(result.financials.nextPhaseInfraReserveTypical ?? 0)}) so that sitework is paid from cash, not a new equity call.`
      : null,
    initial_equity: result.financials?.selfFundCashRequired
      ? `Self-fund peak ${formatCurrency(result.financials.selfFundCashRequired)}. Set this, 0% loan, and Keep sale proceeds — do not add a land-cost line.`
      : null,
    keep_sale_proceeds: result.financials?.keepSaleProceeds
      ? 'On: later phase roads are paid from retained sales. Off: sale proceeds above reserve are swept; contributed cash is not.'
      : 'Off: sale proceeds above the vertical reserve are swept. Starting cash and later calls stay in the project until spent or exit.',
    water_equity_acre_feet: (() => {
      const wr = result.waterRights;
      if (!wr) return null;
      if ((wr.equityAcreFeet ?? 0) <= 0) {
        return `None applied. All ${formatNumber(wr.totalAcreFeet, 2)} AF purchased ≈ ${formatCurrency(wr.total)}.`;
      }
      if ((wr.purchasedAcreFeet ?? 0) <= 0) {
        return `Covers all ${wr.sfLots + wr.townhomeLots} homes. No city purchase.`;
      }
      const partial = wr.homesPartial ? ` + ${wr.homesPartial} partial` : '';
      return `Covers ${wr.homesFullyCovered} homes${partial} in build order. Remaining ${formatNumber(wr.purchasedAcreFeet, 2)} AF purchased ≈ ${formatCurrency(wr.total)}.`;
    })(),
    water_rights_cost_per_acre_foot: (() => {
      const wr = result.waterRights;
      if (!wr) return null;
      if ((wr.purchasedAcreFeet ?? 0) > 0) {
        return `${formatNumber(wr.purchasedAcreFeet, 2)} AF still to buy ≈ ${formatCurrency(wr.total)}`;
      }
      if ((wr.equityApplied ?? 0) > 0) return 'Owned water covers the full requirement';
      return null;
    })(),
  };

  const activePhase = view.startsWith('phase-') ? Number(view.replace('phase-', '')) : null;
  const phaseData = activePhase
    ? result.phaseResults.find((entry) => entry.phase === activePhase)
    : null;
  const residentialHomeCount =
    result.projectTotals.singleFamilyHomes + result.projectTotals.townhomeLots;
  const hasCustomAssumptions = merged.assumptions.some((entry) => entry.value !== entry.default);

  return (
    <div className="proforma-app">
      <header className="proforma-header">
        <div>
          <h1>Delta Crossings Proforma</h1>
          <p>For-sale single-family & townhomes · Phase-funded development · {result.meta.ordinanceRef.title}</p>
        </div>
        <SiteNav
          current="proforma"
          className="proforma-header-actions"
          extra={
            <button type="button" className="btn" onClick={handleReset}>
              Reset Assumptions
            </button>
          }
        />
      </header>

      {scenarioBanner ? (
        <div className="proforma-scenario-banner" role="status">
          {scenarioBanner}
        </div>
      ) : null}

      <div className={`proforma-layout ${assumptionsOpen ? 'assumptions-open' : 'assumptions-collapsed'}`}>
        <aside className="assumptions-panel" aria-hidden={!assumptionsOpen}>
          <div className="assumptions-panel-header">
            <h2>Assumptions</h2>
            <div className="assumptions-panel-header-actions">
              {hasCustomAssumptions ? (
                <button
                  type="button"
                  className="btn btn-primary assumptions-share-btn"
                  onClick={handleShareScenario}
                >
                  {shareStatus || 'Share Scenario'}
                </button>
              ) : null}
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
          </div>
          <div className="assumptions-panel-body">
            <p className="panel-note">
              All sections start collapsed. Key drivers are marked with <strong>*</strong>. Expand a
              section for detail inputs — collapsed notes explain what opens and when it matters.
            </p>
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <CategorySection
                key={key}
                sectionId={key}
                title={label}
                items={assumptionsByCategory[key] || []}
                onChange={handleOverride}
                highlightId={highlightAssumptionId}
                liveHints={assumptionLiveHints}
                defaultOpen={false}
                collapseNote={CATEGORY_COLLAPSE_NOTES[key] || null}
                mainIds={mainAssumptionIdSet}
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
              aria-label="Expand assumptions panel"
              aria-expanded="false"
              title="Expand assumptions"
            >
              <span className="assumptions-expand-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M3 4.5h12M3 9h8M3 13.5h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M14.5 7.5v5M12 10h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </span>
              <span className="assumptions-expand-label">Assumptions</span>
              <span className="assumptions-expand-chevron" aria-hidden="true">›</span>
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

          {view === 'financials' && (
            <FinancialsView
              financials={result.financials}
              onShowCalc={showCalc}
              onApplySelfFund={() => {
                const amount = Math.ceil(result.financials?.selfFundCashRequired || 0);
                setOverride('initial_equity', amount);
                setOverride('construction_loan_advance_pct', 0);
                setOverride('keep_sale_proceeds', 1);
                setOverrideTick((tick) => tick + 1);
                toggleAssumptions(true);
                setHighlightAssumptionId('initial_equity');
              }}
            />
          )}

          {view === 'total' && (
            <section className="proforma-section">
              <h2>Total Project Summary</h2>
              <div className="metric-grid">
                <CalcMetricCard calcId="singleFamilyHomes" onShow={showCalc}>
                  <span>Single-family homes</span>
                  <strong>{result.projectTotals.singleFamilyHomes}</strong>
                </CalcMetricCard>
                <CalcMetricCard calcId="townhomeLots" onShow={showCalc}>
                  <span>Townhomes</span>
                  <strong>{result.projectTotals.townhomeLots}</strong>
                </CalcMetricCard>
                <CalcMetricCard calcId="forSaleHomes" onShow={showCalc}>
                  <span>For sale</span>
                  <strong>{result.projectTotals.forSaleHomes}</strong>
                </CalcMetricCard>
                <CalcMetricCard calcId="reservedForRent" onShow={showCalc}>
                  <span>Reserved for rent</span>
                  <strong>{result.projectTotals.reservedForRent}</strong>
                </CalcMetricCard>
                <CalcMetricCard calcId="avgDwellingSqFt" onShow={showCalc}>
                  <span>Avg dwelling size</span>
                  <strong>{formatNumber(result.projectTotals.avgDwellingSqFt)} sqft</strong>
                </CalcMetricCard>
                <CalcMetricCard calcId="waterRightsTotal" onShow={showCalc}>
                  <span>
                    Water rights ({formatNumber(result.waterRights.purchasedAcreFeet ?? result.waterRights.totalAcreFeet, 1)} AF purchased
                    {(result.waterRights.equityApplied ?? 0) > 0
                      ? ` · ${formatNumber(result.waterRights.equityApplied, 1)} AF equity`
                      : ''}
                    )
                  </span>
                  <strong>{formatCurrency(result.waterRights.total)}</strong>
                </CalcMetricCard>
                <CalcMetricCard calcId="totalDevelopmentCost" onShow={showCalc}>
                  <span>Total development cost</span>
                  <strong>{formatCurrency(result.projectTotals.totalDevelopmentCost)}</strong>
                </CalcMetricCard>
                <CalcMetricCard calcId="totalSaleRevenue" onShow={showCalc}>
                  <span>Total sale revenue</span>
                  <strong>{formatCurrency(result.projectTotals.totalSaleRevenue)}</strong>
                </CalcMetricCard>
                <CalcMetricCard calcId="totalGrossMargin" onShow={showCalc} highlight>
                  <span>Gross margin (pre-finance)</span>
                  <strong>{formatCurrency(result.projectTotals.totalGrossMargin)}</strong>
                </CalcMetricCard>
                <CalcMetricCard calcId="avgCostPerHome" onShow={showCalc}>
                  <span>Avg cost / home</span>
                  <strong>{formatCurrency(result.projectTotals.avgCostPerHome)}</strong>
                </CalcMetricCard>
                <CalcMetricCard calcId="endingCash" onShow={showCalc}>
                  <span>Ending cash</span>
                  <strong>
                    {formatCurrency(result.financials?.endingCash ?? result.waterfall.endingCash)}
                  </strong>
                </CalcMetricCard>
                <CalcMetricCard calcId="endingDebt" onShow={showCalc}>
                  <span>Ending debt</span>
                  <strong>
                    {formatCurrency(result.financials?.endingDebt ?? result.waterfall.endingDebt)}
                  </strong>
                </CalcMetricCard>
              </div>

              <h3>Development Costs (project-wide)</h3>
              <table className="proforma-table">
                <tbody>
                  <tr className="calc-row-clickable" onClick={() => showCalc('land_cost_total')}>
                    <td>Land acquisition</td>
                    <CalcTd calcId="land_cost_total" onShow={showCalc}>{formatCurrency(result.map.land_cost_total)}</CalcTd>
                  </tr>
                  <tr className="calc-row-clickable" onClick={() => showCalc('acquisitionCosts')}>
                    <td>Engineering &amp; design <span className="muted-note">(fixed)</span></td>
                    <CalcTd calcId="acquisitionCosts" onShow={showCalc}>
                      {formatCurrency(result.projectTotals.acquisitionCosts?.engineering)}
                    </CalcTd>
                  </tr>
                  <tr className="calc-row-clickable" onClick={() => showCalc('acquisitionCosts')}>
                    <td>Studies &amp; reports <span className="muted-note">(fixed)</span></td>
                    <CalcTd calcId="acquisitionCosts" onShow={showCalc}>
                      {formatCurrency(result.projectTotals.acquisitionCosts?.studies)}
                    </CalcTd>
                  </tr>
                  <tr className="calc-row-clickable" onClick={() => showCalc('waterRightsTotal')}>
                    <td>
                      Water equity (already owned, {formatNumber(result.waterRights.equityApplied ?? 0, 2)} AF
                      {(result.waterRights.homesFullyCovered ?? 0) > 0
                        ? ` · ${result.waterRights.homesFullyCovered} homes at $0${result.waterRights.homesPartial ? `, ${result.waterRights.homesPartial} partial` : ''}`
                        : ''}
                      )
                    </td>
                    <CalcTd calcId="waterRightsTotal" onShow={showCalc}>
                      {formatCurrency(0)}
                    </CalcTd>
                  </tr>
                  <tr className="calc-row-clickable" onClick={() => showCalc('waterRightsTotal')}>
                    <td>
                      Culinary water purchase ({formatNumber(result.waterRights.purchasedAcreFeet ?? result.waterRights.totalAcreFeet, 1)} AF
                      {' '}of {formatNumber(result.waterRights.totalAcreFeet, 1)} AF
                      @ {formatCurrency(result.waterRights.costPerAcreFoot)}/AF)
                    </td>
                    <CalcTd calcId="waterRightsTotal" onShow={showCalc}>{formatCurrency(result.waterRights.total)}</CalcTd>
                  </tr>
                  <tr className="calc-row-clickable" onClick={() => showCalc('totalInfraBudget')}>
                    <td>Road &amp; utility infrastructure (Ord. 2025-317)</td>
                    <CalcTd calcId="totalInfraBudget" onShow={showCalc}>{formatCurrency(result.infrastructure.totalInfraBudget)}</CalcTd>
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
                    <CalcTh calcId="col_dev_cost" onShow={showCalc}>Dev Cost</CalcTh>
                    <CalcTh calcId="col_sale_revenue" onShow={showCalc}>Sale Revenue</CalcTh>
                    <CalcTh calcId="col_gross_margin" onShow={showCalc}>Gross Margin</CalcTh>
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
                      <CalcTd calcId={`phase_${phase.phase}_totalCost`} onShow={showCalc}>
                        {formatCurrency(phase.totalCost)}
                      </CalcTd>
                      <CalcTd calcId={`phase_${phase.phase}_totalRevenue`} onShow={showCalc}>
                        {formatCurrency(phase.totalRevenue)}
                      </CalcTd>
                      <CalcTd calcId={`phase_${phase.phase}_totalMargin`} onShow={showCalc}>
                        {formatCurrency(phase.totalMargin)}
                      </CalcTd>
                      <CalcTd calcId={`phase_${phase.phase}_totalMargin`} onShow={showCalc}>
                        {formatCurrency(phase.homeCount ? phase.totalMargin / Math.max(phase.sellableCount, 1) : 0)}
                      </CalcTd>
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
                    <CalcTh calcId="col_dev_cost" onShow={showCalc}>Phase Cost</CalcTh>
                    <CalcTh calcId="col_loan_draw" onShow={showCalc}>Loan Draw</CalcTh>
                    <CalcTh calcId="col_interest" onShow={showCalc}>Interest</CalcTh>
                    <CalcTh calcId="col_sale_revenue" onShow={showCalc}>Sale Proceeds</CalcTh>
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
                      <CalcTd calcId={`phase_${row.phase}_totalCost`} onShow={showCalc}>
                        {formatCurrency(row.totalCost)}
                      </CalcTd>
                      <CalcTd calcId={`phase_${row.phase}_financingDraw`} onShow={showCalc}>
                        {formatCurrency(row.financingDraw)}
                      </CalcTd>
                      <CalcTd calcId={`phase_${row.phase}_interest`} onShow={showCalc}>
                        {formatCurrency(row.interest)}
                      </CalcTd>
                      <CalcTd calcId={`phase_${row.phase}_totalRevenue`} onShow={showCalc}>
                        {formatCurrency(row.saleProceeds)}
                      </CalcTd>
                      <CalcTd calcId={`phase_${row.phase}_netProfit`} onShow={showCalc}>
                        {formatCurrency(row.netProfit)}
                      </CalcTd>
                      <CalcTd calcId="endingCash" onShow={showCalc}>
                        {formatCurrency(row.cashAfterPhase)}
                      </CalcTd>
                      <CalcTd calcId="endingDebt" onShow={showCalc}>
                        {formatCurrency(row.debtAfterPhase)}
                      </CalcTd>
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
                  <tr className="calc-row-clickable" onClick={() => showCalc('totalRoadLf')}>
                    <td>Total centerline length</td>
                    <CalcTd calcId="totalRoadLf" onShow={showCalc}>
                      {formatNumber(result.infrastructure.totalRoadLf)} LF
                    </CalcTd>
                  </tr>
                  <tr className="calc-row-clickable" onClick={() => showCalc('roadSqFt')}>
                    <td>
                      <strong>Road corridor area</strong>
                    </td>
                    <td>
                      <button type="button" className="calc-td-trigger" onClick={() => showCalc('roadSqFt')}>
                        <strong>
                          {formatNumber(result.infrastructure.roadArea.roadSqFt / 43560, 2)} acres (
                          {formatNumber(result.infrastructure.totalRoadSqFt)} sqft)
                        </strong>
                      </button>
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
                  <tr className="calc-row-clickable" onClick={() => showCalc('pavementSqFt')}>
                    <td>Pavement ({result.infrastructure.ordinanceSpecs.pavementWidthFt}&apos; per ST-103)</td>
                    <CalcTd calcId="pavementSqFt" onShow={showCalc}>
                      {formatNumber(result.infrastructure.pavementSqFt)} sqft
                    </CalcTd>
                  </tr>
                  <tr className="calc-row-clickable" onClick={() => showCalc('sidewalkSqFt')}>
                    <td>
                      Sidewalks ({result.infrastructure.ordinanceSpecs.sidewalkWidthFt}&apos; × 2 per ST-131)
                    </td>
                    <CalcTd calcId="sidewalkSqFt" onShow={showCalc}>
                      {formatNumber(result.infrastructure.sidewalkSqFt)} sqft
                    </CalcTd>
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
                  <tr>
                    <td>Joint utility trench + gas / electric / telecom hardware</td>
                    <td>{formatNumber(result.infrastructure.totalRoadLf)} LF</td>
                  </tr>
                  <tr>
                    <td>Pad-mount transformers (~1 per 8 lots)</td>
                    <td>{formatNumber(result.infrastructure.transformers)} each</td>
                  </tr>
                  <tr>
                    <td>
                      Street lights (~{formatNumber(result.infrastructure.ordinanceSpecs.streetLightSpacingFt, 0)}
                      &apos; spacing)
                    </td>
                    <td>{formatNumber(result.infrastructure.streetLights)} each</td>
                  </tr>
                </tbody>
              </table>

              <h3>Ordinance Quantities Summary</h3>
              <div className="metric-grid">
                <CalcMetricCard calcId="totalRoadLf" onShow={showCalc}>
                  <span>Centerline length</span>
                  <strong>{formatNumber(result.infrastructure.totalRoadLf)} LF</strong>
                </CalcMetricCard>
                <CalcMetricCard calcId="pavementSqFt" onShow={showCalc}>
                  <span>Pavement area</span>
                  <strong>{formatNumber(result.infrastructure.pavementSqFt)} sqft</strong>
                </CalcMetricCard>
                <CalcMetricCard calcId="sidewalkSqFt" onShow={showCalc}>
                  <span>Sidewalk area</span>
                  <strong>{formatNumber(result.infrastructure.sidewalkSqFt)} sqft</strong>
                </CalcMetricCard>
                <CalcMetricCard calcId="totalInfraBudget" onShow={showCalc}>
                  <span>Total infrastructure cost</span>
                  <strong>{formatCurrency(result.infrastructure.totalInfraBudget, 2)}</strong>
                </CalcMetricCard>
                <CalcMetricCard calcId="infraPerHome" onShow={showCalc} highlight>
                  <span>Infra per home</span>
                  <strong>{formatCurrency(result.shared.infraPerHome)}</strong>
                </CalcMetricCard>
              </div>

              <h3>Cost Line Items</h3>
              <p className="section-lead">
                Unit cost is the bid rate ($/sqft, $/LF, or $/each). Per home is that line&apos;s share of
                the project total (amount ÷ {formatNumber(residentialHomeCount)}{' '}
                homes), including items with less than one per lot.
              </p>
              <table className="proforma-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Ordinance</th>
                    <th>Quantity</th>
                    <th>Qty / home</th>
                    <th>Unit cost</th>
                    <th>Project amount</th>
                    <CalcTh calcId="infraPerHome" onShow={showCalc}>Per home</CalcTh>
                  </tr>
                </thead>
                <tbody>
                  {result.infrastructure.lineItems.map((row) => (
                    <tr
                      key={row.id}
                      className="calc-row-clickable"
                      onClick={() => showCalc(`infra_${row.id}`)}
                    >
                      <td>{row.label}</td>
                      <td>{row.ordinanceRef}</td>
                      <td>
                        {formatNumber(row.quantity, row.unit === 'each' ? 0 : 2)} {row.unit}
                      </td>
                      <td>
                        {formatNumber(row.quantityPerHome, row.unit === 'each' ? 3 : 2)} {row.unit}
                      </td>
                      <td>{formatCurrency(row.unitCost, 2)}</td>
                      <CalcTd calcId={`infra_${row.id}`} onShow={showCalc}>
                        {formatCurrency(row.amount, 2)}
                      </CalcTd>
                      <CalcTd calcId="infraPerHome" onShow={showCalc}>
                        {formatCurrency(row.amountPerHome, 2)}
                      </CalcTd>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="calc-row-clickable" onClick={() => showCalc('totalInfraBudget')}>
                    <td colSpan={5}>
                      <strong>Total infrastructure</strong>
                    </td>
                    <td>
                      <button type="button" className="calc-td-trigger" onClick={() => showCalc('totalInfraBudget')}>
                        <strong>{formatCurrency(result.infrastructure.totalInfraBudget, 2)}</strong>
                      </button>
                    </td>
                    <td>
                      <button type="button" className="calc-td-trigger" onClick={() => showCalc('infraPerHome')}>
                        <strong>{formatCurrency(result.shared.infraPerHome, 2)}</strong>
                      </button>
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
                <CalcMetricCard calcId="rentalUnits" onShow={showCalc}>
                  <span>Total reserved units</span>
                  <strong>{result.rentalHoldout.units}</strong>
                </CalcMetricCard>
                <CalcMetricCard calcId="reservedForRent" onShow={showCalc}>
                  <span>SF reserved</span>
                  <strong>{result.rentalHoldout.sfUnits}</strong>
                </CalcMetricCard>
                <CalcMetricCard calcId="reservedForRent" onShow={showCalc}>
                  <span>Townhome reserved</span>
                  <strong>{result.rentalHoldout.townhomeUnits}</strong>
                </CalcMetricCard>
                <div className="metric-card">
                  <span>Rentals active</span>
                  <strong>{result.rentalHoldout.activated ? 'Yes' : 'No'}</strong>
                </div>
                <CalcMetricCard calcId="sf_rent_monthly" onShow={showCalc}>
                  <span>SF rent / unit</span>
                  <strong>{formatCurrency(result.rentalHoldout.sfRent)}</strong>
                </CalcMetricCard>
                <CalcMetricCard calcId="townhome_rent_monthly" onShow={showCalc}>
                  <span>Townhome rent / unit</span>
                  <strong>{formatCurrency(result.rentalHoldout.townhomeRent)}</strong>
                </CalcMetricCard>
                <CalcMetricCard calcId="annualNoi" onShow={showCalc} highlight>
                  <span>Annual NOI (if active)</span>
                  <strong>{formatCurrency(result.rentalHoldout.annualNoi)}</strong>
                </CalcMetricCard>
                <CalcMetricCard calcId="potentialAnnualNoi" onShow={showCalc}>
                  <span>Potential NOI (all reserved)</span>
                  <strong>{formatCurrency(result.rentalHoldout.potentialAnnualNoi)}</strong>
                </CalcMetricCard>
                <CalcMetricCard calcId="capValueAt5Pct" onShow={showCalc}>
                  <span>Implied value @ 5% cap</span>
                  <strong>{formatCurrency(result.rentalHoldout.capValueAt5Pct)}</strong>
                </CalcMetricCard>
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
              <p className="section-lead">
                Phase infrastructure is this phase&apos;s equal share of the project road &amp; utility
                budget ({phaseData.homeCount} homes × {formatCurrency(result.shared.infraPerHome)} per
                home = {formatCurrency(phaseData.costBreakdown?.infrastructure ?? 0)}), not a new sum of
                unit rates for the phase.
              </p>
              <div className="metric-grid">
                <div className="metric-card">
                  <span>Homes in phase</span>
                  <strong>{phaseData.homeCount}</strong>
                </div>
                <CalcMetricCard calcId={`phase_${phaseData.phase}_totalCost`} onShow={showCalc}>
                  <span>Phase development cost</span>
                  <strong>{formatCurrency(phaseData.totalCost)}</strong>
                </CalcMetricCard>
                <CalcMetricCard calcId={`phase_${phaseData.phase}_totalRevenue`} onShow={showCalc}>
                  <span>Phase sale revenue</span>
                  <strong>{formatCurrency(phaseData.totalRevenue)}</strong>
                </CalcMetricCard>
                <CalcMetricCard calcId={`phase_${phaseData.phase}_totalMargin`} onShow={showCalc} highlight>
                  <span>Phase gross margin</span>
                  <strong>{formatCurrency(phaseData.totalMargin)}</strong>
                </CalcMetricCard>
              </div>
              <table className="proforma-table">
                <thead>
                  <tr>
                    <th>Lot</th>
                    <th>Type</th>
                    <th>Disposition</th>
                    <th>Dwelling</th>
                    <CalcTh calcId="col_land" onShow={showCalc}>Land</CalcTh>
                    <CalcTh calcId="col_infra" onShow={showCalc}>Infra</CalcTh>
                    <CalcTh calcId="col_vertical" onShow={showCalc}>Vertical</CalcTh>
                    <th>Total Cost</th>
                    <th>Sale Price</th>
                    <CalcTh calcId="col_gross_margin" onShow={showCalc}>Margin</CalcTh>
                  </tr>
                </thead>
                <tbody>
                  {phaseData.homes.map((home) => (
                    <tr key={home.lotNumber}>
                      <td>{home.lotNumber}</td>
                      <td>{home.lotType === 'townhome' ? 'Townhome' : 'SF'}</td>
                      <td>{home.disposition === 'rent' ? 'Rent' : 'Sale'}</td>
                      <td>{formatNumber(home.dwellingSqFt)} sqft</td>
                      <CalcTd calcId="col_land" onShow={showCalc}>
                        {formatCurrency(home.costs.land)}
                      </CalcTd>
                      <CalcTd calcId="col_infra" onShow={showCalc}>
                        {formatCurrency(home.costs.infrastructure)}
                      </CalcTd>
                      <CalcTd calcId={`lot_${home.lotNumber}_vertical`} onShow={showCalc}>
                        {formatCurrency(home.costs.verticalHard)}
                      </CalcTd>
                      <CalcTd calcId={`lot_${home.lotNumber}_total`} onShow={showCalc}>
                        {formatCurrency(home.costs.total)}
                      </CalcTd>
                      <td>{home.disposition === 'rent' ? '—' : formatCurrency(home.salePrice)}</td>
                      <CalcTd
                        calcId={home.disposition === 'rent' ? null : `lot_${home.lotNumber}_margin`}
                        onShow={showCalc}
                      >
                        {home.disposition === 'rent' ? '—' : formatCurrency(home.grossMargin)}
                      </CalcTd>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </main>
      </div>

      <CalculationPanel
        calcId={activeCalcId}
        calculations={calculations}
        assumptions={merged.assumptions}
        onClose={closeCalc}
        onAssumptionClick={jumpToAssumption}
      />
    </div>
  );
}
