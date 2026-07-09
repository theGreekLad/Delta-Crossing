import React, { useState } from 'react';
import { usePlatSite } from '../data/usePlatSite';
import SiteNav from '../components/SiteNav';
import ConceptScene3D from '../components/concept/ConceptScene3D';
import ConceptScene2D, { ConceptPlan2D } from '../components/concept/ConceptScene2D';

const VIEWS = [
  { id: '3d', label: '3D Rendering' },
  { id: '2d-render', label: '2D Aerial' },
  { id: '2d-plan', label: 'Site Plan' },
];

const CAMERA_PRESETS = [
  { id: 'aerial', label: 'Aerial' },
  { id: 'street', label: 'Street' },
  { id: 'dusk', label: 'Dusk' },
];

export default function ConceptsPage() {
  const { site, error, loading } = usePlatSite('sheet1');
  const [view, setView] = useState('3d');
  const [cameraPreset, setCameraPreset] = useState('aerial');
  const [showWelcome, setShowWelcome] = useState(true);

  if (loading) {
    return (
      <div className="app loading-screen">
        <p>Loading conceptual master plan...</p>
      </div>
    );
  }

  if (error || !site) {
    return (
      <div className="app loading-screen error">
        <p>Failed to load plat data: {error?.message || 'Unknown error'}</p>
      </div>
    );
  }

  return (
    <div className="app concepts-app">
      <header className="header">
        <div className="header-brand">
          <h1>Conceptual Drawings</h1>
          <p>Delta Crossings · Master plan concept · Delta City, Utah</p>
        </div>
        <SiteNav
          current="concepts"
          extra={
            <>
              <nav className="concept-tabs" aria-label="Drawing views">
                {VIEWS.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={`btn ${view === entry.id ? 'active' : ''}`}
                    onClick={() => setView(entry.id)}
                    aria-pressed={view === entry.id}
                  >
                    {entry.label}
                  </button>
                ))}
              </nav>
              {view === '3d' && (
                <div className="concept-camera-presets" role="group" aria-label="Camera angle">
                  {CAMERA_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className={`btn btn-sm ${cameraPreset === preset.id ? 'active' : ''}`}
                      onClick={() => setCameraPreset(preset.id)}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              )}
            </>
          }
        />
      </header>

      <div className="viewer-wrap concept-viewer">
        {view === '3d' && <ConceptScene3D site={site} cameraPreset={cameraPreset} />}
        {view === '2d-render' && <ConceptScene2D site={site} mode="render" />}
        {view === '2d-plan' && <ConceptPlan2D site={site} />}

        {showWelcome && (
          <div className="welcome-overlay" onAnimationEnd={() => setShowWelcome(false)}>
            <div className="welcome-card">
              <h2>Conceptual Drawings</h2>
              <p>
                A finished-look master plan concept built from the preliminary plat — homes, amenities,
                and streetscape as they might appear at build-out.
              </p>
            </div>
          </div>
        )}

        <div className="stats-bar concept-stats">
          <div className="stat-chip">
            <strong>{site.stats.totalLots}</strong> homesites
          </div>
          <div className="stat-chip">
            <strong>{site.stats.singleFamilyLots}</strong> single-family
          </div>
          <div className="stat-chip">
            <strong>{site.stats.townhomeLots}</strong> townhomes
          </div>
          <div className="stat-chip">
            <strong>{site.stats.commercialBlocks}</strong> commercial
          </div>
          <div className="stat-chip">Concept massing</div>
        </div>

        <div className="legend concept-legend">
          <h3>Legend</h3>
          <div className="legend-item">
            <div className="legend-swatch" style={{ background: '#3a3a3a' }} />
            Streets
          </div>
          <div className="legend-item">
            <div className="legend-swatch" style={{ background: '#e8dcc8' }} />
            Single-family homes
          </div>
          <div className="legend-item">
            <div className="legend-swatch" style={{ background: '#d4c4a8' }} />
            Townhomes
          </div>
          <div className="legend-item">
            <div className="legend-swatch" style={{ background: '#c8beb0' }} />
            Commercial
          </div>
          <div className="legend-item">
            <div className="legend-swatch" style={{ background: '#6eab68' }} />
            Parks &amp; open space
          </div>
          <div className="legend-item">
            <div className="legend-swatch" style={{ background: '#5eb8cc' }} />
            Pool / amenities
          </div>
        </div>

        {view === '3d' && (
          <div className="controls-hint">
            <kbd>Scroll</kbd> zoom · <kbd>Drag</kbd> orbit · <kbd>Right-drag</kbd> pan
          </div>
        )}
        {view === '2d-render' && (
          <div className="controls-hint">
            <kbd>Scroll</kbd> zoom · <kbd>Drag</kbd> pan
          </div>
        )}
        {view === '2d-plan' && (
          <div className="controls-hint">Scroll the page to explore the site plan</div>
        )}
      </div>

      <footer className="app-footer">
        Conceptual visualization only — not a construction document. Building forms are illustrative
        massing based on R-4 setbacks and the preliminary plat geometry.
      </footer>
    </div>
  );
}
