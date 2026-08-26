import React, { useMemo, useState } from 'react';
import SiteNav from '../components/SiteNav';
import { getPrimaryDesignLayouts, ADDITIONAL_LAYOUT_SHEETS } from '../data/layoutsGallery';
import { appUrl } from '../data/platUrls';

const FILTERS = [
  { id: 'all', label: 'All Designs' },
  { id: 'single-family', label: 'Single-Family' },
  { id: 'fourplex', label: 'Townhome / Fourplex' },
];

export default function LayoutsPage() {
  const [filter, setFilter] = useState('all');
  const designs = useMemo(() => getPrimaryDesignLayouts(), []);

  const filtered = designs.filter((design) => filter === 'all' || design.category === filter);
  const sheets = ADDITIONAL_LAYOUT_SHEETS.filter(
    (sheet) => filter === 'all' || sheet.category === filter,
  );

  return (
    <div className="gallery-app">
      <header className="gallery-header">
        <div>
          <h1>Layouts</h1>
          <p>Floor plans, product sheets, and exterior renderings · Delta Crossing</p>
        </div>
        <SiteNav current="layouts" />
      </header>

      <main className="gallery-main">
        <section className="gallery-hero">
          <h2>Building layouts &amp; renderings</h2>
          <p>
            Browse single-family and townhome / fourplex options with matching exterior renderings and
            floor-plan sheets. Open any design for a full-screen view with rendering on top and layout
            below.
          </p>
        </section>

        <div className="gallery-filters" role="tablist" aria-label="Design category">
          {FILTERS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={`btn ${filter === entry.id ? 'active' : ''}`}
              onClick={() => setFilter(entry.id)}
              aria-pressed={filter === entry.id}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <h3 className="section-label">Primary design options</h3>
        <div className="design-grid">
          {filtered.map((design) => (
            <article key={design.id} className="design-card">
              <div className="design-card-media">
                <img className="rendering" src={design.renderingUrl} alt={`${design.name} rendering`} loading="lazy" />
                <img className="layout" src={design.layoutUrl} alt={`${design.name} layout`} loading="lazy" />
              </div>
              <div className="design-card-body">
                <span className="design-card-tag">
                  {design.category === 'single-family' ? 'Single-Family' : 'Townhome / Fourplex'}
                </span>
                <h3>{design.name}</h3>
                <div className="design-card-meta">{design.summary}</div>
                <p>{design.description}</p>
                <div className="design-card-actions">
                  <a
                    href={`${appUrl('design-viewer.html')}?design=${encodeURIComponent(design.id)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open full view
                  </a>
                </div>
              </div>
            </article>
          ))}
        </div>

        {sheets.length > 0 && (
          <>
            <h3 className="section-label">Additional layout sheets</h3>
            <div className="sheet-grid">
              {sheets.map((sheet) => (
                <article key={sheet.id} className="sheet-card">
                  <img src={sheet.imageUrl} alt={sheet.title} loading="lazy" />
                  <div className="sheet-card-body">
                    <h3>{sheet.title}</h3>
                    <p>{sheet.subtitle}</p>
                    <a className="open-link" href={sheet.imageUrl} target="_blank" rel="noreferrer">
                      Open sheet
                    </a>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
