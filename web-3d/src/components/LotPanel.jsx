import React from 'react';

export default function LotPanel({ lot, onClose }) {
  if (!lot) return null;

  const typeLabels = {
    'single-family': 'Single-Family Home',
    townhome: 'Townhome',
    commercial: 'Commercial Block',
  };

  const typeLabel = typeLabels[lot.type] || lot.type;
  const building = lot.building;

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
            <div className="label">Lot Area</div>
            <div className="value">{lot.sqft.toLocaleString()} sq ft</div>
          </div>
        )}
        {building?.dwellingSqFt != null && (
          <div className="detail-item">
            <div className="label">Modeled Dwelling</div>
            <div className="value">{building.dwellingSqFt.toLocaleString()} sq ft</div>
          </div>
        )}
        {building?.targetSqFt != null && (
          <div className="detail-item">
            <div className="label">Target Range</div>
            <div className="value">2,000–2,500 sq ft</div>
          </div>
        )}
        {lot.phase != null && (
          <div className="detail-item">
            <div className="label">Phase</div>
            <div className="value">Phase {lot.phase}</div>
          </div>
        )}
        {building?.zoning && (
          <div className="detail-item">
            <div className="label">Zoning</div>
            <div className="value">{building.zoning}</div>
          </div>
        )}
      </div>

      {building && (
        <>
          <p className="panel-note" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.75rem' }}>
            <strong>R-4 setbacks applied:</strong> {building.setbacks.front}&apos; front
            {building.frontStreet ? ` (${building.frontStreet})` : ''}, {building.setbacks.rear}&apos; rear,
            {' '}
            {building.setbacks.left}&apos; / {building.setbacks.right}&apos; sides
            {building.isCornerLot ? ' (corner lot)' : ''}.
          </p>
          {building.secondaryStreet && (
            <p className="panel-note">
              Corner frontage: {building.secondaryStreet} (20&apos; street side).
            </p>
          )}
          <p className="panel-note">
            Buildable pad ~{building.buildableSqFt.toLocaleString()} sq ft · Modeled height {building.wallHeight}&apos; (max {35}&apos;).
          </p>
          {building.complianceNote && (
            <p className="panel-note" style={{ color: '#e8c170' }}>
              {building.complianceNote}
            </p>
          )}
        </>
      )}

      {lot.centroid && (
        <p className="panel-note" style={{ borderTop: 'none', paddingTop: 0 }}>
          Centroid: {lot.centroid[0]}, {lot.centroid[1]}
        </p>
      )}

      <p className="panel-note">
        Footprint placement uses Delta City R-4 standards (DCC 18.24.040). Street orientation is inferred from plat road labels; verify against recorded plat bearings before permitting.
      </p>
    </div>
  );
}
