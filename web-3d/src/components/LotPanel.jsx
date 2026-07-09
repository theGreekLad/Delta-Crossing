import React from 'react';
import { BUILDING_CATALOG, getDesignById, lotFitsFourplex } from '../data/buildingCatalog';

export default function LotPanel({
  lot,
  onClose,
  placement,
  onPlaceDesign,
  onAdjustPlacement,
  onClearPlacement,
  onResetPlacementOrientation,
  yawStep,
  nudgeStep,
}) {
  if (!lot) return null;

  const typeLabels = {
    'single-family': 'Single-Family Home',
    townhome: 'Townhome',
    commercial: 'Commercial Block',
  };

  const typeLabel = typeLabels[lot.type] || lot.type;
  const building = lot.building;
  const selectedDesign = placement?.designId ? getDesignById(placement.designId) : null;
  const showCatalog = lot.type !== 'commercial';
  const fitsFourplex = lotFitsFourplex(lot);

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

      {showCatalog && (
        <section className="building-catalog">
          <h3 className="catalog-heading">Building Designs</h3>
          {!fitsFourplex && (
            <p className="panel-note catalog-warning">
              Buildable pad may be narrow for a 108&apos; fourplex — placement is allowed but verify setbacks.
            </p>
          )}
          <div className="catalog-grid">
            {BUILDING_CATALOG.map((design) => {
              const isSelected = placement?.designId === design.id;
              return (
                <button
                  key={design.id}
                  type="button"
                  className={`catalog-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => onPlaceDesign(lot.id, design.id)}
                >
                  <img src={design.renderingUrl} alt={design.name} loading="lazy" />
                  <span className="catalog-card-name">{design.shortName}</span>
                </button>
              );
            })}
          </div>

          {selectedDesign && placement && (
            <div className="placement-controls">
              <div className="placement-summary">
                <strong>{selectedDesign.name}</strong>
                <span>
                  {selectedDesign.width}&apos; × {selectedDesign.depth}&apos; · End {selectedDesign.endUnitSqFt} · Middle{' '}
                  {selectedDesign.middleUnitSqFt}
                </span>
                <p>{selectedDesign.description}</p>
              </div>

              <div className="placement-preview">
                <a href={selectedDesign.layoutUrl} target="_blank" rel="noreferrer">
                  <img src={selectedDesign.layoutUrl} alt={`${selectedDesign.name} layout`} loading="lazy" />
                  <span>View floor plan layout</span>
                </a>
              </div>

              <div className="adjust-group">
                <span className="adjust-label">Rotate</span>
                <div className="adjust-row">
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => onAdjustPlacement(lot.id, { yawDelta: -yawStep })}
                  >
                    −
                  </button>
                  <span className="adjust-value">
                    {Math.round(((placement.yawOffset * 180) / Math.PI) * 10) / 10}°
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => onAdjustPlacement(lot.id, { yawDelta: yawStep })}
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="adjust-group">
                <span className="adjust-label">Nudge</span>
                <div className="nudge-pad">
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => onAdjustPlacement(lot.id, { nudgeDelta: [0, -nudgeStep] })}
                  >
                    N
                  </button>
                  <div className="nudge-pad-middle">
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => onAdjustPlacement(lot.id, { nudgeDelta: [-nudgeStep, 0] })}
                    >
                      W
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => onAdjustPlacement(lot.id, { nudgeDelta: [nudgeStep, 0] })}
                    >
                      E
                    </button>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => onAdjustPlacement(lot.id, { nudgeDelta: [0, nudgeStep] })}
                  >
                    S
                  </button>
                </div>
                <span className="adjust-hint">
                  Offset {placement.nudge[0].toFixed(0)}&apos; E/W · {placement.nudge[1].toFixed(0)}&apos; N/S (local)
                </span>
              </div>

              <div className="placement-actions">
                <button type="button" className="btn btn-sm" onClick={() => onResetPlacementOrientation(lot.id)}>
                  Reset orientation
                </button>
                <button type="button" className="btn btn-sm" onClick={() => onClearPlacement(lot.id)}>
                  Remove building
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {building && (
        <>
          <p className="panel-note" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.75rem' }}>
            <strong>R-4 setbacks applied:</strong> {building.setbacks.front}&apos; front
            {building.frontStreet ? ` (${building.frontStreet})` : ''}, {building.setbacks.rear}&apos; rear,{' '}
            {building.setbacks.left}&apos; / {building.setbacks.right}&apos; sides
            {building.isCornerLot ? ' (corner lot)' : ''}.
          </p>
          {building.secondaryStreet && (
            <p className="panel-note">
              Corner frontage: {building.secondaryStreet} (20&apos; street side).
            </p>
          )}
          <p className="panel-note">
            Buildable pad ~{building.buildableSqFt.toLocaleString()} sq ft · Modeled height {building.wallHeight}&apos; (max{' '}
            {35}&apos;).
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
        Footprint placement uses Delta City R-4 standards (DCC 18.24.040). Street orientation is inferred from plat road
        labels; verify against recorded plat bearings before permitting.
      </p>
    </div>
  );
}
