import React, { useEffect, useState } from 'react';
import SiteNav from '../components/SiteNav';
import { AREA_INFOGRAPHICS } from '../data/areaInfographics';

export default function AreaInfoPage() {
  const [active, setActive] = useState(null);

  useEffect(() => {
    if (!active) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') setActive(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);

  return (
    <div className="gallery-app">
      <header className="gallery-header">
        <div>
          <h1>Delta Area Information</h1>
          <p>Market context, master plan story, and regional advantages · Delta Crossing</p>
        </div>
        <SiteNav current="area" />
      </header>

      <main className="gallery-main">
        <section className="gallery-hero">
          <h2>Know the Delta story</h2>
          <p>
            Infographics covering the executive overview, opportunity, master plan, density options,
            community arrival character, and Delta’s energy transition advantage. Click any card to
            view full-screen.
          </p>
        </section>

        <div className="info-grid">
          {AREA_INFOGRAPHICS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="info-card"
              onClick={() => setActive(item)}
            >
              <img src={item.imageUrl} alt={item.title} loading="lazy" />
              <div className="info-card-body">
                <span className="subtitle">{item.subtitle}</span>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </div>
            </button>
          ))}
        </div>
      </main>

      {active && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={active.title}>
          <div className="lightbox-inner">
            <button type="button" className="lightbox-close" onClick={() => setActive(null)} aria-label="Close">
              ×
            </button>
            <img src={active.imageUrl} alt={active.title} />
            <div className="lightbox-caption">
              <h3>{active.title}</h3>
              <p>
                {active.subtitle} — {active.description}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
