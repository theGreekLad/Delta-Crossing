import React, { Suspense, useMemo, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrthographicCamera, MapControls } from '@react-three/drei';
import * as THREE from 'three';
import Trees from '../Environment';
import ConceptBuildings from './ConceptBuildings';
import ConceptAmenities, { ConceptGround } from './ConceptAmenities';
import { cameraTargetFromBounds } from '../../utils/geometry';

function FitOrtho({ span }) {
  const { camera, size } = useThree();

  useEffect(() => {
    if (!camera.isOrthographicCamera) return;
    const aspect = size.width / Math.max(size.height, 1);
    const half = span * 0.58;
    camera.left = -half * aspect;
    camera.right = half * aspect;
    camera.top = half;
    camera.bottom = -half;
    camera.updateProjectionMatrix();
  }, [camera, size, span]);

  return null;
}

function CameraLookDown({ cx, cz }) {
  const { camera } = useThree();
  useEffect(() => {
    camera.up.set(0, 0, -1);
    camera.lookAt(cx, 0, cz);
    camera.updateProjectionMatrix();
  }, [camera, cx, cz]);
  return null;
}

function TopDownScene({ site }) {
  const { cx, cz, span } = cameraTargetFromBounds(site.bounds);

  return (
    <>
      <OrthographicCamera makeDefault position={[cx, span * 2, cz]} near={1} far={span * 8} />
      <FitOrtho span={span} />
      <CameraLookDown cx={cx} cz={cz} />
      <MapControls
        enableRotate={false}
        enableDamping
        dampingFactor={0.1}
        minZoom={0.35}
        maxZoom={4}
        target={[cx, 0, cz]}
      />
      <ambientLight intensity={0.75} />
      <directionalLight
        position={[cx + 200, span, cz + 100]}
        intensity={1.1}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={span * 4}
        shadow-camera-left={-span}
        shadow-camera-right={span}
        shadow-camera-top={span}
        shadow-camera-bottom={-span}
      />
      <directionalLight position={[cx - 150, span * 0.5, cz - 120]} intensity={0.35} color="#d0e0f0" />

      <color attach="background" args={['#b8c9a8']} />

      <ConceptGround bounds={site.bounds} />
      <ConceptAmenities areas={site.siteAreas} />
      <ConceptBuildings lots={site.lots} />
      <Trees trees={site.trees} />
    </>
  );
}

/** Pure SVG aerial plan — crisp 2D conceptual drawing */
export function ConceptPlan2D({ site }) {
  const { bounds, lots, siteAreas } = site;
  const pad = 40;
  const width = bounds.maxX - bounds.minX + pad * 2;
  const height = bounds.maxZ - bounds.minZ + pad * 2;
  const ox = bounds.minX - pad;
  const oz = bounds.minZ - pad;

  const toSvg = ([x, z]) => [x - ox, z - oz];
  const polyPoints = (polygon) => polygon.map((pt) => toSvg(pt).join(',')).join(' ');

  const areaFills = {
    road: '#3a3a3a',
    park: '#6eab68',
    pool: '#5eb8cc',
    pickleball: '#2e6b9e',
    'open-space': '#5a9a6a',
    'future-development': '#c4b896',
    canal: '#4a90a4',
  };

  const sortedAreas = useMemo(
    () =>
      [...(siteAreas || [])].sort((a, b) => {
        const order = ['road', 'future-development', 'open-space', 'park', 'pool', 'pickleball'];
        return order.indexOf(a.type) - order.indexOf(b.type);
      }),
    [siteAreas],
  );

  return (
    <div className="concept-plan-wrap">
      <svg
        className="concept-plan-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Conceptual master plan aerial drawing"
      >
        <defs>
          <pattern id="grass-hatch" width="12" height="12" patternUnits="userSpaceOnUse">
            <rect width="12" height="12" fill="#7a9a62" />
            <path d="M0 12 L12 0" stroke="#6a8a52" strokeWidth="0.6" opacity="0.35" />
          </pattern>
          <filter id="soft-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="2" dy="3" stdDeviation="3" floodOpacity="0.25" />
          </filter>
        </defs>

        <rect width={width} height={height} fill="url(#grass-hatch)" />

        {sortedAreas.map((area) => (
          <polygon
            key={area.id}
            points={polyPoints(area.polygon)}
            fill={areaFills[area.type] || '#888'}
            opacity={area.type === 'road' ? 1 : 0.92}
            stroke={area.type === 'road' ? '#2a2a2a' : 'none'}
            strokeWidth={area.type === 'road' ? 1 : 0}
          />
        ))}

        {lots.map((lot) => {
          const isComm = lot.type === 'commercial';
          const isTh = lot.type === 'townhome';
          const yard = isComm ? '#9a958c' : isTh ? '#5f8f52' : '#6a9a5a';
          const building = lot.building;
          let footprint = null;
          if (building && building.width > 1) {
            const [bcx, bcz] = building.center;
            const hw = building.width / 2;
            const hd = building.depth / 2;
            const cos = Math.cos(building.rotation);
            const sin = Math.sin(building.rotation);
            footprint = [
              [-hw, -hd],
              [hw, -hd],
              [hw, hd],
              [-hw, hd],
            ].map(([lx, lz]) => [bcx + lx * cos + lz * sin, bcz - lx * sin + lz * cos]);
          }

          return (
            <g key={lot.id}>
              <polygon
                points={polyPoints(lot.polygon)}
                fill={yard}
                stroke="#4a6a3a"
                strokeWidth="0.8"
                opacity="0.95"
              />
              {footprint && (
                <polygon
                  points={polyPoints(footprint)}
                  fill={isComm ? '#c8beb0' : isTh ? '#d4c4a8' : '#e8dcc8'}
                  stroke={isComm ? '#6b7280' : '#5c4a3a'}
                  strokeWidth="1.2"
                  filter="url(#soft-shadow)"
                />
              )}
              {footprint && !isComm && (
                <line
                  x1={toSvg(footprint[0])[0]}
                  y1={toSvg(footprint[0])[1]}
                  x2={toSvg(footprint[1])[0]}
                  y2={toSvg(footprint[1])[1]}
                  stroke="#5c4a3a"
                  strokeWidth="2.5"
                  opacity="0.55"
                />
              )}
            </g>
          );
        })}

        <g transform={`translate(${pad}, ${pad})`}>
          <rect width="420" height="78" rx="4" fill="rgba(15,20,25,0.82)" />
          <text x="18" y="32" fill="#f0f2f5" fontFamily="Instrument Serif, Georgia, serif" fontSize="26">
            Delta Crossings — Conceptual Master Plan
          </text>
          <text x="18" y="56" fill="#8b95a5" fontFamily="DM Sans, sans-serif" fontSize="13">
            Aerial site plan · R-4 residential &amp; commercial concept
          </text>
        </g>
      </svg>
    </div>
  );
}

export default function ConceptScene2D({ site, mode = 'render' }) {
  if (mode === 'plan') {
    return <ConceptPlan2D site={site} />;
  }

  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.2 }}
    >
      <Suspense fallback={null}>
        <TopDownScene site={site} />
      </Suspense>
    </Canvas>
  );
}
