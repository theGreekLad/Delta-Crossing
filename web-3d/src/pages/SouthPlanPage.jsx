import React, { useEffect, useMemo, useState } from 'react';
import SiteNav from '../components/SiteNav';
import { appUrl, platUrl } from '../data/platUrls';
import {
  CONCEPT_OPTIONS,
  SOUTH_NAV_LINKS,
  loadConcepts,
  readInitialConcept,
  rememberConcept,
} from '../southParcel/southParcelSite';

const SETBACKS = "Front 25' · side 10' · rear 10' · corner street side 20'";
const CHECK_LABELS = {
  area: 'Lot area (R-4)',
  frontage: 'Frontage / width',
  fits: 'Building fits',
  setbacks: 'Inside setback envelope',
  parking: '3 side-by-side stalls per unit',
  openSpace: '500 SF private open space per unit',
  unitFrontage: 'Every unit lot touches the ROW',
};
const STATUS_TEXT = { pass: 'Pass', fail: 'Fail', check: 'Verify', 'n/a': 'N/A' };

function fmt(value, digits = 0) {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function ringPath(ring) {
  return `M${ring.map(([x, y]) => `${x} ${-y}`).join('L')}Z`;
}

/** One polygon given as a list of rings (outer + holes). */
function polygonPath(rings) {
  return rings.map(ringPath).join(' ');
}

function linePoints(points) {
  return points.map(([x, y]) => `${x},${-y}`).join(' ');
}

function centroid(ring) {
  let x = 0;
  let y = 0;
  ring.forEach(([px, py]) => {
    x += px;
    y += py;
  });
  return [x / ring.length, y / ring.length];
}

function SvgText({ at, children, size = 12, className = '', rotate = 0 }) {
  const [x, y] = at;
  return (
    <text
      x={x}
      y={-y}
      fontSize={size}
      className={className}
      textAnchor="middle"
      dominantBaseline="central"
      transform={rotate ? `rotate(${rotate} ${x} ${-y})` : undefined}
    >
      {children}
    </text>
  );
}

function lotKind(lot) {
  if (lot.existing) return 'existing';
  return lot.type === 'TH' ? 'th' : 'sf';
}

function lotTitle(lot) {
  if (lot.existing) return `Lot ${lot.id} · Phase 1 single-family lot`;
  if (lot.type === 'TH') return `Lot ${lot.id} · ${lot.units}-unit townhome building`;
  return `Lot ${lot.id} · Single-family`;
}

function PlanSvg({ data, concept, selectedId, onSelect }) {
  const ctx = data.base.context;
  const [xMin, yMin, xMax, yMax] = ctx.view;
  const lots = [...data.base.existingLots, ...concept.lots];
  const surfaces = concept.surfaces;
  const streetA = concept.streets.streetA.centerline;
  const aLabelAt = streetA[Math.floor(streetA.length * 0.45)];
  const parcelA = data.base.polygons.parcelA;
  const [paX, paY] = centroid(parcelA);

  return (
    <svg
      className="sp-plan-svg"
      viewBox={`${xMin} ${-yMax} ${xMax - xMin} ${yMax - yMin}`}
      role="img"
      aria-label={`Concept ${concept.id} site plan`}
    >
      <defs>
        <pattern id="sp-hatch" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="14" className="sp-hatch-line" />
        </pattern>
      </defs>
      <rect x={xMin} y={-yMax} width={xMax - xMin} height={yMax - yMin} className="sp-paper" />

      {[...ctx.deltaEstates, ...ctx.phase1Band, ...ctx.commercial].map((rings, i) => (
        <path key={`ctx-${i}`} d={polygonPath(rings)} className="sp-context" />
      ))}
      {ctx.phase1Lots.map((lot) => (
        <g key={`p1-${lot.id}`}>
          <path d={ringPath(lot.polygon)} className="sp-context-lot" />
          <SvgText at={centroid(lot.polygon)} size={13} className="sp-muted">
            {lot.id}
          </SvgText>
        </g>
      ))}

      {surfaces.row.map((rings, i) => <path key={`row-${i}`} d={polygonPath(rings)} className="sp-row" />)}
      {surfaces.sidewalk.map((rings, i) => <path key={`sw-${i}`} d={polygonPath(rings)} className="sp-sidewalk" />)}
      {surfaces.curb.map((rings, i) => <path key={`cg-${i}`} d={polygonPath(rings)} className="sp-curb" />)}
      {surfaces.asphalt.map((rings, i) => <path key={`as-${i}`} d={polygonPath(rings)} className="sp-asphalt" />)}
      {concept.centerlines.map((line, i) => (
        <polyline key={`cl-${i}`} points={linePoints(line)} className="sp-centerline" />
      ))}

      <path d={ringPath(parcelA)} className="sp-retention" />
      <path d={ringPath(parcelA)} className="sp-retention-hatch" />
      {concept.openSpace.os1.map((ring, i) => <path key={`os-${i}`} d={ringPath(ring)} className="sp-open" />)}
      <path d={ringPath(data.base.polygons.parcelC)} className="sp-canal" />

      {lots.map((lot) => {
        const kind = lotKind(lot);
        const selected = selectedId === lot.id;
        const [cx, cy] = lot.footprints.length ? centroid(lot.footprints[0]) : centroid(lot.polygon);
        return (
          <g
            key={lot.id}
            className={`sp-lot sp-lot-${kind} ${selected ? 'is-selected' : ''}`}
            onClick={() => onSelect(lot.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') onSelect(lot.id);
            }}
          >
            <title>{`${lotTitle(lot)} — ${fmt(lot.areaSqFt)} SF`}</title>
            <path d={ringPath(lot.polygon)} className="sp-lot-fill" />
            {lot.envelope.map((ring, i) => <path key={`env-${i}`} d={ringPath(ring)} className="sp-envelope" />)}
            {lot.driveways.map((ring, i) => <path key={`dw-${i}`} d={ringPath(ring)} className="sp-driveway" />)}
            {lot.footprints.map((ring, i) => <path key={`fp-${i}`} d={ringPath(ring)} className="sp-footprint" />)}
            {lot.unitLots.map((unit) => (
              <g key={unit.id}>
                <path d={ringPath(unit.polygon)} className="sp-unit-line" />
                <SvgText at={centroid(unit.footprint)} size={13} className="sp-on-building">
                  {unit.id}
                </SvgText>
              </g>
            ))}
            {lot.type === 'TH' ? null : (
              <SvgText at={[cx, cy]} size={15} className="sp-on-building">
                {lot.id}
              </SvgText>
            )}
          </g>
        );
      })}

      {(ctx.projectBoundary || []).map((rings, i) => (
        <path key={`pb-${i}`} d={polygonPath(rings)} className="sp-boundary" />
      ))}

      {concept.lots
        .filter((lot) => lot.type === 'TH')
        .map((lot) => {
          const [x] = centroid(lot.polygon);
          const ys = lot.footprints.flat().map(([, y]) => y);
          const y = lot.tier === 'north' ? Math.max(...ys) + 12 : Math.min(...ys) - 12;
          return (
            <SvgText key={`lbl-${lot.id}`} at={[x, y]} size={10.5} className="sp-label">
              {`Lot ${lot.id} · ${lot.units} units`}
            </SvgText>
          );
        })}

      <SvgText at={[560, 257.72]} size={14} className="sp-street-label">
        JASPER DRIVE (450 North · collector)
      </SvgText>
      <SvgText at={[196, 196]} size={13} className="sp-street-label" rotate={-81}>
        HARVEST LANE
      </SvgText>
      <SvgText at={[aLabelAt[0], concept.stats.streetAY]} size={13} className="sp-street-label">
        {"STREET A (60' ROW)"}
      </SvgText>
      <SvgText at={[ctx.emeraldX + 1, 212]} size={11} className="sp-street-label" rotate={-90}>
        STREET B
      </SvgText>
      <SvgText at={[ctx.emeraldX, 330]} size={11} className="sp-muted">
        EMERALD WAY
      </SvgText>
      <SvgText at={[ctx.moonstoneX, 330]} size={11} className="sp-muted">
        MOONSTONE DR.
      </SvgText>
      <SvgText at={[231, -80]} size={12} className="sp-muted" rotate={-90}>
        DAYS AVE.
      </SvgText>
      <SvgText at={[560, -55]} size={15} className="sp-muted">
        DELTA ESTATES (existing homes)
      </SvgText>
      <SvgText at={[1080, 70]} size={13} className="sp-muted">
        PHASE 2 / COMMERCIAL
      </SvgText>
      <SvgText at={[paX - 25, paY - 15]} size={13} className="sp-green-label">
        PARCEL A · RETENTION
      </SvgText>
      <SvgText at={[15, 112]} size={11} className="sp-green-label" rotate={-90}>
        PARCEL C · CANAL BUFFER
      </SvgText>
    </svg>
  );
}

function LotDetail({ lot }) {
  if (!lot) {
    return (
      <div className="sp-panel-empty">
        <p>Click any lot on the plan to see its size, building, parking and the code checks it passes.</p>
        <p className="sp-muted-text">Dashed red lines are the setback envelopes ({SETBACKS}).</p>
      </div>
    );
  }
  return (
    <div className="sp-lot-detail">
      <h3>{lotTitle(lot)}</h3>
      <dl className="sp-facts">
        <dt>Lot area</dt>
        <dd>
          {fmt(lot.areaSqFt)} SF <span>(min {fmt(lot.minAreaSqFt)})</span>
        </dd>
        {lot.existing && lot.platAreaSqFt ? (
          <>
            <dt>Plat area</dt>
            <dd>{fmt(lot.platAreaSqFt)} SF</dd>
          </>
        ) : null}
        <dt>Frontage</dt>
        <dd>
          {fmt(lot.frontageFt, 1)}&apos; <span>(min {lot.minFrontageFt}&apos;{lot.corner ? ', corner' : ''})</span>
        </dd>
        <dt>Width at setback</dt>
        <dd>{fmt(lot.widthAtSetbackFt, 1)}&apos;</dd>
        <dt>Building</dt>
        <dd>{lot.design}</dd>
        <dt>Livable area</dt>
        <dd>{fmt(lot.livableSqFt)} SF</dd>
        {lot.rearOnCollector ? (
          <>
            <dt>Rear yard</dt>
            <dd>Backs onto Jasper Drive — 10&apos; planting buffer</dd>
          </>
        ) : null}
      </dl>
      <ul className="sp-checks">
        {Object.entries(lot.checks).map(([key, ok]) => (
          <li key={key} className={ok ? 'ok' : 'bad'}>
            <span aria-hidden="true">{ok ? '✓' : '✕'}</span> {CHECK_LABELS[key] || key}
          </li>
        ))}
      </ul>
      {lot.unitLots.length ? (
        <table className="proforma-table sp-unit-table">
          <thead>
            <tr>
              <th>Unit</th>
              <th>Unit lot</th>
              <th>Open space</th>
              <th>Stalls</th>
            </tr>
          </thead>
          <tbody>
            {lot.unitLots.map((unit) => (
              <tr key={unit.id}>
                <td>
                  {lot.id}-{unit.id}
                </td>
                <td>{fmt(unit.areaSqFt)} SF</td>
                <td>{fmt(unit.openSpaceSqFt)} SF</td>
                <td>{unit.stalls}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

export default function SouthPlanPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [conceptId, setConceptId] = useState(readInitialConcept);
  const [selectedId, setSelectedId] = useState(() => new URLSearchParams(window.location.search).get('lot'));

  useEffect(() => {
    loadConcepts().then(setData).catch(setError);
  }, []);

  const concept = useMemo(() => data?.concepts.find((c) => c.id === conceptId) || data?.concepts[0], [data, conceptId]);
  const selectedLot = useMemo(() => {
    if (!data || !concept || !selectedId) return null;
    return [...data.base.existingLots, ...concept.lots].find((lot) => lot.id === selectedId) || null;
  }, [data, concept, selectedId]);

  const selectLot = (id) => {
    setSelectedId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('lot', id);
    else url.searchParams.delete('lot');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  };

  const chooseConcept = (id) => {
    selectLot(null);
    setConceptId(id);
    rememberConcept(id);
  };

  if (error) {
    return (
      <div className="sp-app sp-loading">
        <p>Failed to load the concept layouts: {error.message}</p>
      </div>
    );
  }
  if (!data || !concept) {
    return (
      <div className="sp-app sp-loading">
        <p>Loading concept layouts…</p>
      </div>
    );
  }

  const s = concept.stats;
  const q = concept.quantities;
  const storm = concept.stormwater;
  const sheetBase = platUrl(`data/south-parcel/${concept.sheet.png.replace('.png', '')}`);

  return (
    <div className="sp-app">
      <header className="proforma-header sp-header">
        <div>
          <h1>South Parcel Concept Plan</h1>
          <p>
            Land south of Jasper Drive · Phase 1 Lots 116–118 (prelim Lots 17–19), Harvest Lane, the Future Phase block
            and Parcel A · Delta City R-4
          </p>
          <div className="variant-switch" role="group" aria-label="Concept layout">
            {CONCEPT_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={option.id === concept.id ? 'active' : ''}
                aria-pressed={option.id === concept.id}
                onClick={() => chooseConcept(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <SiteNav current="south-plan" links={SOUTH_NAV_LINKS} className="proforma-header-actions" />
      </header>

      <main className="sp-main">
        <p className="section-lead sp-summary">
          <strong>
            Concept {concept.id}: {concept.name}.
          </strong>{' '}
          {concept.summary} Every lot below passes the R-4 lot, setback, parking and townhome rules; open the{' '}
          <a href={appUrl(`south-proforma.html?concept=${concept.id}`)}>proforma</a> to see what it earns.
        </p>

        <div className="metric-grid">
          <div className="metric-card highlight">
            <span>Dwelling units</span>
            <strong>{s.units}</strong>
          </div>
          <div className="metric-card">
            <span>Single-family / townhome</span>
            <strong>
              {s.sfUnits} / {s.thUnits}
            </strong>
          </div>
          <div className="metric-card">
            <span>Density</span>
            <strong>{fmt(s.densityPerGrossAcre, 1)} units / gross ac</strong>
          </div>
          <div className="metric-card">
            <span>New street (A + B)</span>
            <strong>{fmt(q.newStreetCenterlineFt)} LF</strong>
          </div>
          <div className="metric-card">
            <span>Harvest Lane (moved from main)</span>
            <strong>{fmt(q.harvestLaneCenterlineFt)} LF</strong>
          </div>
          <div className="metric-card">
            <span>Storm volume to hold</span>
            <strong>{fmt(storm.requiredVolumeCf)} CF</strong>
          </div>
        </div>

        <div className="sp-plan-layout">
          <div className="sp-plan-card">
            <PlanSvg data={data} concept={concept} selectedId={selectedId} onSelect={selectLot} />
            <div className="sp-legend">
              <span><i className="sw sf" /> New single-family lot</span>
              <span><i className="sw th" /> Townhome building lot</span>
              <span><i className="sw existing" /> Phase 1 Lots 116–118</span>
              <span><i className="sw drive" /> 27&apos; driveway = 3 stalls</span>
              <span><i className="sw retention" /> Retention / open space</span>
              <span><i className="sw envelope" /> Setback envelope</span>
            </div>
          </div>
          <aside className="sp-panel">
            <LotDetail lot={selectedLot} />
          </aside>
        </div>

        <section className="proforma-section">
          <h2>Code Compliance</h2>
          <p className="section-lead">
            Checked by scripts/south_parcel_concept.py against the ordinances in Supporting Docs. Amber items are not
            failures; they need confirmation from the city engineer or canal company.
          </p>
          <div className="sp-table-wrap">
            <table className="proforma-table sp-compliance">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Rule</th>
                  <th>Requirement</th>
                  <th>This concept</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {concept.compliance.map((rule) => (
                  <tr key={rule.id}>
                    <td>
                      <span className={`sp-status sp-status-${rule.status.replace('/', '')}`}>
                        {STATUS_TEXT[rule.status] || rule.status}
                      </span>
                    </td>
                    <td>{rule.label}</td>
                    <td>{rule.requirement}</td>
                    <td>{rule.detail}</td>
                    <td className="sp-muted-text">{rule.citation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="proforma-section">
          <h2>Quantities &amp; Stormwater</h2>
          <div className="sp-two-col">
            <table className="proforma-table">
              <tbody>
                <tr><td>Street A/B centerline (60&apos; ROW)</td><td>{fmt(q.newStreetCenterlineFt)} LF</td></tr>
                <tr><td>Harvest Lane south of Jasper</td><td>{fmt(q.harvestLaneCenterlineFt)} LF</td></tr>
                <tr><td>Asphalt (41&apos; ST-02 section)</td><td>{fmt(q.asphaltSqFt)} SF</td></tr>
                <tr><td>Curb &amp; gutter</td><td>{fmt(q.curbGutterLf)} LF</td></tr>
                <tr><td>Sidewalk (5&apos;, both sides)</td><td>{fmt(q.sidewalkSqFt)} SF</td></tr>
                <tr><td>Water / sewer main</td><td>{fmt(q.waterMainLf)} LF each</td></tr>
                <tr><td>Storm drain to Parcel A</td><td>{fmt(q.stormDrainLf)} LF</td></tr>
                <tr><td>Sewer / storm manholes</td><td>{q.sewerManholes} / {q.stormManholes}</td></tr>
                <tr><td>Street lights / fire hydrants</td><td>{q.streetLights} / {q.fireHydrants}</td></tr>
                <tr><td>Parcel C ditch piping (if live)</td><td>{fmt(q.ditchPipeLf)} LF</td></tr>
              </tbody>
            </table>
            <table className="proforma-table">
              <tbody>
                <tr><td>Design storm</td><td>{storm.designStorm}</td></tr>
                <tr><td>Rainfall</td><td>{storm.rainfallIn} in ({storm.rainfallSource})</td></tr>
                <tr><td>Contributing area</td><td>{fmt(storm.contributingSqFt)} SF</td></tr>
                <tr><td>Impervious</td><td>{fmt(storm.imperviousPct, 1)}%</td></tr>
                <tr><td>Runoff coefficient</td><td>{fmt(storm.runoffCoefficient, 2)}</td></tr>
                <tr><td>Volume to hold</td><td>{fmt(storm.requiredVolumeCf)} CF ({fmt(storm.requiredVolumeAcFt, 2)} ac-ft)</td></tr>
                <tr><td>Added basin depth</td><td>≈ {fmt(storm.addedDepthIn, 1)} in over Parcel A + new open space</td></tr>
              </tbody>
            </table>
          </div>
          <p className="section-lead">{storm.note}</p>
          <ul className="sp-notes">
            {q.notes.map((note) => <li key={note}>{note}</li>)}
          </ul>
          <p className="sp-downloads">
            Plan sheet: <a href={`${sheetBase}.png`} target="_blank" rel="noreferrer">PNG</a> ·{' '}
            <a href={`${sheetBase}.svg`} target="_blank" rel="noreferrer">SVG</a> · Data:{' '}
            <a href={platUrl('data/south-parcel/concepts.json')} target="_blank" rel="noreferrer">concepts.json</a>
          </p>
        </section>
      </main>
    </div>
  );
}
