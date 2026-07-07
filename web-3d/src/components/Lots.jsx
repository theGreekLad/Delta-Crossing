import { useMemo } from 'react';
import { polygonShapeOnGround, polygonCentroid } from '../utils/geometry';

function Home({ lot, selected, hovered, onSelect, onHover }) {
  const lotPoly = lot.polygon;
  const building = lot.building;
  const highlight = selected ? '#5bbfb0' : hovered ? '#7ecfc3' : lot.color;
  const isTownhome = lot.type === 'townhome';

  const hasFootprint = building && building.width > 1 && building.depth > 1;
  const [cx, cz] = hasFootprint ? building.center : polygonCentroid(lotPoly);
  const rotation = hasFootprint ? building.rotation : 0;
  const width = hasFootprint ? building.width : 0;
  const depth = hasFootprint ? building.depth : 0;
  const wall = hasFootprint ? building.wallHeight : 12;

  const bodyColor =
    lot.type === 'commercial' ? '#d4c4a8' : isTownhome ? '#d4c4a8' : '#e8dcc8';

  const footprintOutline = useMemo(() => {
    if (!hasFootprint) return null;
    const halfW = width / 2;
    const halfD = depth / 2;
    return [
      [-halfW, -halfD],
      [halfW, -halfD],
      [halfW, halfD],
      [-halfW, halfD],
    ];
  }, [hasFootprint, width, depth]);

  return (
    <group
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
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]} receiveShadow>
        <shapeGeometry args={[polygonShapeOnGround(lotPoly)]} />
        <meshStandardMaterial
          color={highlight}
          transparent
          opacity={selected ? 0.9 : hovered ? 0.75 : 0.55}
          roughness={0.9}
        />
      </mesh>

      {hasFootprint && (
        <group position={[cx, 0, cz]} rotation={[0, rotation, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
            <shapeGeometry args={[polygonShapeOnGround(footprintOutline)]} />
            <meshBasicMaterial color="#4a90a4" transparent opacity={0.22} />
          </mesh>

          <mesh position={[0, wall / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[width, wall, depth]} />
            <meshStandardMaterial color={bodyColor} roughness={0.75} />
          </mesh>

          {isTownhome &&
            [-0.32, 0, 0.32].map((unitOffset, index) => (
              <mesh key={index} position={[width * unitOffset, wall * 0.55, 0]} castShadow>
                <boxGeometry args={[width * 0.12, wall * 0.88, depth * 0.62]} />
                <meshStandardMaterial color="#dcc8a8" roughness={0.8} />
              </mesh>
            ))}

          {(selected || hovered) && (
            <mesh position={[0, wall + 3, 0]}>
              <sphereGeometry args={[2, 8, 8]} />
              <meshStandardMaterial color="#d4a853" emissive="#d4a853" emissiveIntensity={0.4} />
            </mesh>
          )}
        </group>
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
