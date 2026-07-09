import React, { useMemo } from 'react';
import { polygonCentroid, polygonShapeOnGround } from '../../utils/geometry';

const AREA_COLORS = {
  road: '#3a3a3a',
  'future-development': '#c4b896',
  'open-space': '#5a9a6a',
  park: '#6eab68',
  pool: '#5eb8cc',
  pickleball: '#2e6b9e',
  canal: '#4a90a4',
};

function buildShape(polygon, holes = []) {
  const [cx, cz] = polygonCentroid(polygon);
  const shape = polygonShapeOnGround(polygon.map(([x, z]) => [x - cx, z - cz]));
  holes.forEach((hole) => {
    const holeShape = polygonShapeOnGround(hole.map(([x, z]) => [x - cx, z - cz]));
    shape.holes.push(holeShape);
  });
  return { shape, cx, cz };
}

function AreaPad({ area, color, elevation = 0.08, opacity = 1, roughness = 0.9 }) {
  const { shape, cx, cz } = useMemo(
    () => buildShape(area.polygon, area.holes || []),
    [area.polygon, area.holes],
  );

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, elevation, cz]} receiveShadow>
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial
        color={color}
        transparent={opacity < 1}
        opacity={opacity}
        roughness={roughness}
      />
    </mesh>
  );
}

function PoolDeck({ area }) {
  const [cx, cz] = polygonCentroid(area.polygon);
  const xs = area.polygon.map(([x]) => x);
  const zs = area.polygon.map(([, z]) => z);
  const width = Math.max(...xs) - Math.min(...xs);
  const depth = Math.max(...zs) - Math.min(...zs);

  return (
    <group>
      <AreaPad area={area} color="#d4cfc4" elevation={0.06} roughness={0.85} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.12, cz]} receiveShadow>
        <planeGeometry args={[width * 0.55, depth * 0.45]} />
        <meshStandardMaterial color="#4db8d0" roughness={0.12} metalness={0.35} />
      </mesh>
      {/* Pool edge coping */}
      <mesh position={[cx, 0.35, cz - depth * 0.28]} castShadow>
        <boxGeometry args={[width * 0.55, 0.5, 1.2]} />
        <meshStandardMaterial color="#e8e4dc" roughness={0.7} />
      </mesh>
      {/* Cabana */}
      <mesh position={[cx + width * 0.28, 5, cz]} castShadow>
        <boxGeometry args={[14, 10, 10]} />
        <meshStandardMaterial color="#e8dcc8" roughness={0.8} />
      </mesh>
      <mesh position={[cx + width * 0.28, 10.5, cz]} castShadow>
        <boxGeometry args={[16, 1, 12]} />
        <meshStandardMaterial color="#5c4a3a" roughness={0.85} />
      </mesh>
    </group>
  );
}

function PickleballCourt({ area }) {
  const [cx, cz] = polygonCentroid(area.polygon);
  const xs = area.polygon.map(([x]) => x);
  const zs = area.polygon.map(([, z]) => z);
  const width = Math.max(...xs) - Math.min(...xs);
  const depth = Math.max(...zs) - Math.min(...zs);
  const courtW = Math.min(width * 0.85, 44);
  const courtD = Math.min(depth * 0.85, 20);

  return (
    <group>
      <AreaPad area={area} color="#3d7a4a" elevation={0.05} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.1, cz]} receiveShadow>
        <planeGeometry args={[courtW, courtD]} />
        <meshStandardMaterial color="#2e6b9e" roughness={0.55} />
      </mesh>
      {/* Net posts */}
      <mesh position={[cx, 2.5, cz - courtD / 2]} castShadow>
        <cylinderGeometry args={[0.25, 0.25, 5, 8]} />
        <meshStandardMaterial color="#cccccc" metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[cx, 2.5, cz + courtD / 2]} castShadow>
        <cylinderGeometry args={[0.25, 0.25, 5, 8]} />
        <meshStandardMaterial color="#cccccc" metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[cx, 4.2, cz]}>
        <boxGeometry args={[0.15, 0.15, courtD]} />
        <meshStandardMaterial color="#f0f0f0" />
      </mesh>
    </group>
  );
}

function ParkAmenity({ area }) {
  const [cx, cz] = polygonCentroid(area.polygon);
  const trees = useMemo(() => {
    const items = [];
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2;
      const r = 18 + (i % 3) * 8;
      items.push({
        x: cx + Math.cos(angle) * r,
        z: cz + Math.sin(angle) * r,
        scale: 0.9 + (i % 3) * 0.15,
      });
    }
    return items;
  }, [cx, cz]);

  return (
    <group>
      <AreaPad area={area} color="#6eab68" elevation={0.05} />
      {/* Play lawn oval */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.08, cz]} receiveShadow>
        <circleGeometry args={[22, 24]} />
        <meshStandardMaterial color="#7ec06a" roughness={0.92} />
      </mesh>
      {/* Pavilion */}
      <mesh position={[cx, 6, cz]} castShadow>
        <cylinderGeometry args={[10, 10, 1.2, 8]} />
        <meshStandardMaterial color="#5c4a3a" roughness={0.85} />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <mesh
          key={i}
          position={[cx + Math.cos((i * Math.PI) / 2) * 7, 3, cz + Math.sin((i * Math.PI) / 2) * 7]}
          castShadow
        >
          <cylinderGeometry args={[0.4, 0.4, 6, 8]} />
          <meshStandardMaterial color="#d4c4a8" roughness={0.8} />
        </mesh>
      ))}
      {trees.map((tree, index) => (
        <group key={index} position={[tree.x, 0, tree.z]} scale={tree.scale}>
          <mesh position={[0, 2, 0]} castShadow>
            <cylinderGeometry args={[0.4, 0.5, 4, 6]} />
            <meshStandardMaterial color="#5c4033" />
          </mesh>
          <mesh position={[0, 5.5, 0]} castShadow>
            <sphereGeometry args={[2.8, 10, 10]} />
            <meshStandardMaterial color="#2d6a3e" roughness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function FuturePad({ area }) {
  return (
    <group>
      <AreaPad area={area} color="#c4b896" elevation={0.05} opacity={0.95} />
      {/* Soft massing placeholders */}
      {(() => {
        const [cx, cz] = polygonCentroid(area.polygon);
        return (
          <mesh position={[cx, 6, cz]} castShadow>
            <boxGeometry args={[50, 12, 35]} />
            <meshStandardMaterial color="#b8ae9a" transparent opacity={0.55} roughness={0.9} />
          </mesh>
        );
      })()}
    </group>
  );
}

function RoadMarkings({ area }) {
  return <AreaPad area={area} color={AREA_COLORS.road} elevation={0.12} roughness={0.88} />;
}

export default function ConceptAmenities({ areas }) {
  if (!areas?.length) return null;

  const sorted = useMemo(
    () =>
      [...areas].sort((a, b) => {
        const order = ['road', 'future-development', 'open-space', 'park', 'pool', 'pickleball', 'canal'];
        return order.indexOf(a.type) - order.indexOf(b.type);
      }),
    [areas],
  );

  return (
    <group>
      {sorted.map((area) => {
        if (area.type === 'road') return <RoadMarkings key={area.id} area={area} />;
        if (area.type === 'pool') return <PoolDeck key={area.id} area={area} />;
        if (area.type === 'pickleball') return <PickleballCourt key={area.id} area={area} />;
        if (area.type === 'park') return <ParkAmenity key={area.id} area={area} />;
        if (area.type === 'future-development') return <FuturePad key={area.id} area={area} />;
        if (area.type === 'open-space') {
          return <AreaPad key={area.id} area={area} color="#5a9a6a" elevation={0.05} />;
        }
        return (
          <AreaPad
            key={area.id}
            area={area}
            color={AREA_COLORS[area.type] || '#888'}
            elevation={0.06}
          />
        );
      })}
    </group>
  );
}

/** Soft ground plane with warm desert-grass tone for concept renders */
export function ConceptGround({ bounds }) {
  const { minX, maxX, minZ, maxZ } = bounds;
  const width = maxX - minX;
  const depth = maxZ - minZ;
  const span = Math.max(width, depth);
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.15, cz]} receiveShadow>
        <planeGeometry args={[span * 3.2, span * 3.2]} />
        <meshStandardMaterial color="#8a7a5c" roughness={0.96} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.05, cz]} receiveShadow>
        <planeGeometry args={[span * 1.15, span * 1.15]} />
        <meshStandardMaterial color="#6b8f5a" roughness={0.94} />
      </mesh>
    </group>
  );
}
