import React, { useMemo } from 'react';
import { getDesignById, BUILDING_CATALOG } from '../data/buildingCatalog';
import { appUrl } from '../data/platUrls';

function readDesignId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('design') || '';
}

export default function DesignViewerPage() {
  const designId = useMemo(() => readDesignId(), []);
  const design = getDesignById(designId) || BUILDING_CATALOG[0];

  if (!design) {
    return (
      <div className="design-viewer">
        <header className="design-viewer-header">
          <h1>Design not found</h1>
          <a className="btn" href={appUrl('index.html')}>
            Back to 3D View
          </a>
        </header>
      </div>
    );
  }

  const summary =
    design.category === 'single-family'
      ? `${design.width}' × ${design.depth}' · ${design.dwellingSqFt}`
      : `${design.width}' × ${design.depth}' · End ${design.endUnitSqFt} · Middle ${design.middleUnitSqFt}`;

  return (
    <div className="design-viewer">
      <header className="design-viewer-header">
        <div>
          <p className="design-viewer-eyebrow">Delta Crossing</p>
          <h1>{design.name}</h1>
          <p className="design-viewer-summary">{summary}</p>
        </div>
        <a className="btn" href={appUrl('index.html')}>
          Back to 3D View
        </a>
      </header>

      <main className="design-viewer-scroll">
        <section className="design-viewer-section">
          <h2>Rendering</h2>
          <img src={design.renderingUrl} alt={`${design.name} exterior rendering`} />
        </section>

        <section className="design-viewer-section">
          <h2>Floor Plan Layout</h2>
          <img src={design.layoutUrl} alt={`${design.name} floor plan layout`} />
        </section>
      </main>
    </div>
  );
}
