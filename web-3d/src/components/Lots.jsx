import { useMemo } from 'react';
import * as THREE from 'three';
import { polygonShape, polygonCentroid } from '../utils/geometry';

function buildingHeight(lot) {
  switch (lot.type) {
    case 'commercial':
      return { wall: 28 + (lot.blockNumber || 1) * 2, roof: 2 };
    case 'townhome':
      return { wall: 32, roof: 4 };
    default:
      return { wall: lot.sqft > 6500 ? 20 : 14, roof: 8 };
  }
}

function Home({ lot, selected, hovered, onSelect, onHover }) {
  const lotPoly = lot.polygon;
  const [cx, cz] = polygonCentroid(lotPoly);

  const { width, depth } = useMemo(() => {
    const xs = lotPoly.map(([x]) => x);
    const zs = lotPoly.map(([, z]) => z);
    return {
      width: Math.max(...xs) - Math.min(...xs),
      depth: Math.max(...zs) - Math.min(...zs),
    };
  }, [lotPoly]);

  const { wall, roof } = buildingHeight(lot);
  const highlight = selected ? '#5bbfb0' : hovered ? '#7ecfc3' : lot.color;
  const isCommercial = lot.type === 'commercial';
  const isTownhome = lot.type === 'townhome';

  const bodyScaleW = isTownhome ? 0.98 : isCommercial ? 0.94 : 0.78;
  const bodyScaleD = isTownhome ? 0.96 : isCommercial ? 0.92 : 0.72;

  const bodyColor = isCommercial
    ? '#d4c4a8'
    : isTownhome
      ? '#d4c4a8'
      : '#e8dcc8';

  return (
    <group
      position={[cx, 0, cz]}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(lot);
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        onHover(lot.id);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        onHover(null);
        document.body.style.cursor = 'default';
      }}
    >
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]} receiveShadow>
        <shapeGeometry args={[polygonShape(lotPoly.map(([x, z]) => [x - cx, z - cz]))]} />
        <meshStandardMaterial
          color={highlight}
          transparent
          opacity={selected ? 0.9 : hovered ? 0.75 : 0.55}
          roughness={0.9}
        />
      </mesh>

      <group>
        <mesh position={[0, wall / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[width * bodyScaleW, wall, depth * bodyScaleD]} />
          <meshStandardMaterial color={bodyColor} roughness={0.75} />
        </mesh>

        <mesh position={[0, wall + roof / 2, 0]} castShadow>
          <boxGeometry args={[width * (bodyScaleW + 0.04), roof, depth * (bodyScaleD + 0.04)]} />
          <meshStandardMaterial color={lot.roofColor || '#5a4a3a'} roughness={0.85} />
        </mesh>
      </group>

      {isTownhome &&
        [-0.32, 0, 0.32].map((unitOffset, index) => (
          <mesh key={index} position={[width * unitOffset, wall * 0.55, 0]} castShadow>
            <boxGeometry args={[width * 0.14, wall * 0.9, depth * 0.65]} />
            <meshStandardMaterial color="#dcc8a8" roughness={0.8} />
          </mesh>
        ))}

      {lot.type === 'single-family' && (
        <group>
          <mesh position={[0, 5, depth * bodyScaleD * 0.28]} castShadow>
            <boxGeometry args={[width * bodyScaleW * 0.42, 10, depth * bodyScaleD * 0.32]} />
            <meshStandardMaterial color="#ccc5b8" roughness={0.8} />
          </mesh>
        </group>
      )}

      {(selected || hovered) && (
        <mesh position={[0, wall + roof + 4, 0]}>
          <sphereGeometry args={[2, 8, 8]} />
          <meshStandardMaterial color="#d4a853" emissive="#d4a853" emissiveIntensity={0.4} />
        </mesh>
      )}
    </group>
  );
}

export default function Lots({ lots, selectedId, onSelect, onHover, hoveredId }) {
  return (
    <group>
      {lots.map((lot) => (
        <Home
          key={lot.id}
          lot={lot}
          selected={selectedId === lot.id}
          hovered={hoveredId === lot.id}
          onSelect={onSelect}
          onHover={onHover}
        />
      ))}
    </group>
  );
}
