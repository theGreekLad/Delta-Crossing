import { useCallback, useEffect, useState } from 'react';
import Scene3D from './components/Scene3D';
import LotPanel from './components/LotPanel';
import { usePlatSite } from './data/usePlatSite';
import { platUrl, appUrl } from './data/platUrls';

export default function App() {
  const { site, error, loading } = usePlatSite('sheet1');
  const [selectedLot, setSelectedLot] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [showPlatOverlay, setShowPlatOverlay] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!site) return;

    const params = new URLSearchParams(window.location.search);
    const lotParam = parseInt(params.get('lot') || '', 10);
    if (!Number.isFinite(lotParam)) return;

    const match =
      site.lots.find((lot) => lot.lotNumber === lotParam) ||
      site.lots.find((lot) => lot.blockNumber === lotParam);
    if (match) setSelectedLot(match);
  }, [site]);

  const handleSelect = useCallback((lot) => {
    setSelectedLot(lot);
    const params = new URLSearchParams(window.location.search);
    const number = lot.lotNumber ?? lot.blockNumber;
    if (number != null) {
      params.set('lot', String(number));
      window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
    }
  }, []);

  const handleClose = useCallback(() => {
    setSelectedLot(null);
    const params = new URLSearchParams(window.location.search);
    params.delete('lot');
    const query = params.toString();
    window.history.replaceState({}, '', query ? `${window.location.pathname}?${query}` : window.location.pathname);
  }, []);

  const handleSearch = useCallback(
    (event) => {
      if (event.key !== 'Enter' || !site) return;
      event.preventDefault();

      const query = searchQuery.trim();
      if (!query) return;

      const commercialMatch = query.match(/^c(?:u|ommercial)?[\s-]*(\d+)$/i);
      if (commercialMatch) {
        const blockNumber = parseInt(commercialMatch[1], 10);
        const unit = site.lots.find((lot) => lot.blockNumber === blockNumber);
        if (unit) {
          handleSelect(unit);
          return;
        }
        window.alert(`Commercial block ${blockNumber} was not found.`);
        return;
      }

      const lotNumber = parseInt(query, 10);
      if (!Number.isFinite(lotNumber)) return;

      const lot = site.lots.find((entry) => entry.lotNumber === lotNumber);
      if (lot) {
        handleSelect(lot);
        return;
      }

      window.alert(`Lot ${query} was not found.`);
    },
    [handleSelect, searchQuery, site],
  );

  const resetView = useCallback(() => {
    setSelectedLot(null);
    window.location.href = window.location.pathname;
  }, []);

  if (loading) {
    return (
      <div className="app loading-screen">
        <p>Loading plat data...</p>
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

  const { project, stats } = site;

  return (
    <div className="app">
      <header className="header">
        <div className="header-brand">
          <h1>{project.name}</h1>
          <p>
            {project.phase} · {project.location}
          </p>
        </div>
        <div className="header-actions">
          <label className="search-box">
            <span className="sr-only">Find lot</span>
            <input
              type="search"
              placeholder="Find lot # or CU #..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={handleSearch}
              autoComplete="off"
            />
          </label>
          <button
            type="button"
            className={`btn ${showPlatOverlay ? 'active' : ''}`}
            onClick={() => setShowPlatOverlay((value) => !value)}
          >
            Plat Overlay
          </button>
          <button type="button" className="btn" onClick={resetView}>
            Reset View
          </button>
          <a className="btn btn-primary" href={platUrl('index.html')}>
            Plat Map
          </a>
          <a className="btn" href={appUrl('proforma.html')}>
            Proforma
          </a>
        </div>
      </header>

      <div className="viewer-wrap">
        <Scene3D
          site={site}
          selectedLot={selectedLot}
          onSelect={handleSelect}
          onHover={setHoveredId}
          hoveredId={hoveredId}
          showPlatOverlay={showPlatOverlay}
        />

        {showWelcome && (
          <div className="welcome-overlay" onAnimationEnd={() => setShowWelcome(false)}>
            <div className="welcome-card">
              <h2>Delta Crossings</h2>
              <p>Explore the plat in 3D — click any lot or commercial block for details</p>
            </div>
          </div>
        )}

        <div className="stats-bar">
          <div className="stat-chip">
            <strong>{stats.totalLots}</strong> residential lots
          </div>
          <div className="stat-chip">
            <strong>{stats.singleFamilyLots}</strong> single-family
          </div>
          <div className="stat-chip">
            <strong>{stats.townhomeLots}</strong> townhomes
          </div>
          <div className="stat-chip">
            <strong>{stats.commercialBlocks}</strong> commercial blocks
          </div>
          {stats.platAligned && <div className="stat-chip">Plat aligned</div>}
          {stats.zoning && <div className="stat-chip">{stats.zoning} setbacks</div>}
        </div>

        <LotPanel lot={selectedLot} onClose={handleClose} />

        <div className="legend">
          <h3>Legend</h3>
          <div className="legend-item">
            <div className="legend-swatch" style={{ background: '#3a3a3a' }} />
            Roads &amp; street network
          </div>
          <div className="legend-item">
            <div className="legend-swatch" style={{ background: '#8fbc8f' }} />
            Single-Family Lots
          </div>
          <div className="legend-item">
            <div className="legend-swatch" style={{ background: '#d4c4a8' }} />
            Townhomes
          </div>
          <div className="legend-item">
            <div className="legend-swatch" style={{ background: '#c8beb0' }} />
            Commercial Blocks
          </div>
          <div className="legend-item">
            <div className="legend-swatch" style={{ background: '#c4b896' }} />
            Future Development
          </div>
          <div className="legend-item">
            <div className="legend-swatch" style={{ background: '#5a9a6a' }} />
            Open Space / Retention
          </div>
          <div className="legend-item">
            <div className="legend-swatch" style={{ background: '#4a90a4', opacity: 0.5 }} />
            Modeled building pad (R-4 setbacks)
          </div>
          <div className="legend-item">
            <div className="legend-swatch" style={{ background: '#4a90a4' }} />
            Canal
          </div>
          <div className="legend-item">
            <div className="legend-swatch" style={{ background: '#2e6b9e' }} />
            Pickleball / Courts
          </div>
        </div>

        <div className="controls-hint">
          <kbd>Scroll</kbd> zoom · <kbd>Drag</kbd> rotate · <kbd>Right-drag</kbd> pan ·{' '}
          <kbd>Click</kbd> lot or block
        </div>
      </div>

      <footer className="app-footer">{project.disclaimer}</footer>
    </div>
  );
}
