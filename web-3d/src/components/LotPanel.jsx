export default function LotPanel({ lot, onClose }) {
  if (!lot) return null;

  const typeLabels = {
    'single-family': 'Single-Family Home',
    townhome: 'Townhome',
    commercial: 'Commercial Block',
  };

  const typeLabel = typeLabels[lot.type] || lot.type;

  return (
    <div className="side-panel">
      <button className="close-btn" onClick={onClose} aria-label="Close">
        ×
      </button>
      <h2>{lot.label}</h2>
      <span className="lot-type">{typeLabel}</span>

      <div className="detail-grid">
        {lot.lotNumber != null && (
          <div className="detail-item">
            <div className="label">Lot Number</div>
            <div className="value">{lot.lotNumber}</div>
          </div>
        )}
        {lot.blockNumber != null && (
          <div className="detail-item">
            <div className="label">Block</div>
            <div className="value">{lot.blockNumber}</div>
          </div>
        )}
        {lot.sqft != null && (
          <div className="detail-item">
            <div className="label">Square Feet</div>
            <div className="value">{lot.sqft.toLocaleString()}</div>
          </div>
        )}
        {lot.phase != null && (
          <div className="detail-item">
            <div className="label">Phase</div>
            <div className="value">Phase {lot.phase}</div>
          </div>
        )}
      </div>

      {lot.centroid && (
        <p className="panel-note" style={{ borderTop: 'none', paddingTop: 0 }}>
          Centroid: {lot.centroid[0]}, {lot.centroid[1]}
        </p>
      )}

      <p className="panel-note">
        Position and footprint from the official preliminary plat map extraction pipeline.
      </p>
    </div>
  );
}
