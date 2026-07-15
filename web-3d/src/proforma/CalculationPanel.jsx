import { useCallback, useEffect } from 'react';
import { formatCurrency, formatNumber, formatPct } from './assumptions';

function formatStepValue(value, format) {
  if (value == null || (typeof value === 'number' && Number.isNaN(value))) return '—';
  switch (format) {
    case 'currency':
      return formatCurrency(value, 2);
    case 'pct':
      return formatPct(value);
    case 'multiple':
      return `${Number(value).toFixed(2)}×`;
    case 'months': {
      const n = Math.round(value);
      const years = Math.floor(n / 12);
      const months = n % 12;
      if (years === 0) return `${months} mo`;
      if (months === 0) return `${years} yr`;
      return `${years} yr ${months} mo`;
    }
    case 'sqft':
      return `${formatNumber(value, 2)} sqft`;
    case 'lf':
      return `${formatNumber(value, 2)} LF`;
    default:
      if (typeof value === 'number') return formatNumber(value, 2);
      return String(value);
  }
}

function formatResult(value, format) {
  return formatStepValue(value, format);
}

export function CalcTrigger({ calcId, children, onShow, className = '', title = 'View calculation' }) {
  if (!calcId || !onShow) {
    return <span className={className}>{children}</span>;
  }

  return (
    <button
      type="button"
      className={`calc-trigger ${className}`}
      onClick={() => onShow(calcId)}
      title={title}
      aria-label={`${title}: click for details`}
    >
      {children}
    </button>
  );
}

export function CalculationPanel({ calcId, calculations, assumptions, onClose, onAssumptionClick }) {
  const detail = calcId ? calculations[calcId] : null;

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!calcId) return undefined;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [calcId, handleKeyDown]);

  if (!detail) return null;

  const assumptionMap = assumptions?.reduce((acc, entry) => {
    acc[entry.id] = entry;
    return acc;
  }, {}) ?? {};

  return (
    <>
      <button
        type="button"
        className="calc-panel-backdrop"
        onClick={onClose}
        aria-label="Close calculation panel"
      />
      <aside className="calc-panel" role="dialog" aria-labelledby="calc-panel-title">
        <div className="calc-panel-header">
          <h2 id="calc-panel-title">{detail.label}</h2>
          <button type="button" className="calc-panel-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="calc-panel-body">
          <div className="calc-formula-block">
            <span className="calc-formula-label">Formula</span>
            <p className="calc-formula">{detail.formula}</p>
          </div>

          <div className="calc-result-block">
            <span className="calc-formula-label">Result</span>
            <strong className="calc-result">{formatResult(detail.result, detail.resultFormat)}</strong>
          </div>

          {detail.steps?.length > 0 && (
            <div className="calc-steps">
              <span className="calc-formula-label">Breakdown</span>
              <ol className="calc-steps-list">
                {detail.steps.map((step, index) => (
                  <li key={`${step.label}-${index}`}>
                    <div className="calc-step-row">
                      <span className="calc-step-label">{step.label}</span>
                      <span className="calc-step-value">{formatStepValue(step.value, step.format)}</span>
                    </div>
                    {step.meta ? <p className="calc-step-meta">{step.meta}</p> : null}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {detail.assumptionRefs?.length > 0 && (
            <div className="calc-assumptions">
              <span className="calc-formula-label">Related assumptions</span>
              <ul className="calc-assumption-list">
                {detail.assumptionRefs.map((refId) => {
                  const entry = assumptionMap[refId];
                  if (!entry) return null;
                  return (
                    <li key={refId}>
                      <button
                        type="button"
                        className="calc-assumption-link"
                        onClick={() => onAssumptionClick?.(refId)}
                      >
                        <span>{entry.label}</span>
                        <span className="calc-assumption-value">
                          {entry.unit === 'ratio' || (typeof entry.unit === 'string' && entry.unit.startsWith('ratio/'))
                            ? formatPct(entry.value)
                            : entry.unit === 'USD' ||
                                (typeof entry.unit === 'string' && entry.unit.startsWith('USD'))
                              ? formatCurrency(entry.value, 2)
                              : formatNumber(entry.value, 2)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {detail.notes ? <p className="calc-notes">{detail.notes}</p> : null}
        </div>
      </aside>
    </>
  );
}

/** Wrap a metric card so the whole card is clickable */
export function CalcMetricCard({ calcId, onShow, highlight, children }) {
  if (!calcId || !onShow) {
    return <div className={`metric-card ${highlight ? 'highlight' : ''}`}>{children}</div>;
  }

  return (
    <button
      type="button"
      className={`metric-card calc-metric-card ${highlight ? 'highlight' : ''}`}
      onClick={() => onShow(calcId)}
      title="View calculation"
    >
      {children}
      <span className="calc-hint" aria-hidden="true">ⓘ</span>
    </button>
  );
}

/** Clickable table header that explains the column */
export function CalcTh({ calcId, onShow, children }) {
  if (!calcId || !onShow) return <th>{children}</th>;

  return (
    <th>
      <button type="button" className="calc-th-trigger" onClick={() => onShow(calcId)}>
        {children}
        <span className="calc-th-icon" aria-hidden="true">ⓘ</span>
      </button>
    </th>
  );
}

/** Clickable table cell for calculated values */
export function CalcTd({ calcId, onShow, children, className = '' }) {
  if (!calcId || !onShow) {
    return <td className={className}>{children}</td>;
  }

  return (
    <td className={className}>
      <button type="button" className="calc-td-trigger" onClick={() => onShow(calcId)}>
        {children}
      </button>
    </td>
  );
}
