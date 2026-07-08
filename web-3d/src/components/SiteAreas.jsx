import React, { useMemo } from 'react';
import { polygonCentroid, polygonShapeOnGround } from '../utils/geometry';

const AREA_STYLES = {
  road: {
    color: '#3a3a3a',
    opacity: 1,
    roughness: 0.88,
    metalness: 0.05,
    elevation: 0.14,
  },
  'future-development': {
    color: '#c4b896',
    opacity: 0.92,
    roughness: 0.94,
    metalness: 0,
    elevation: 0.06,
  },
  'open-space': {
    color: '#5a9a6a',
    opacity: 0.88,
    roughness: 0.92,
    metalness: 0,
    elevation: 0.05,
  },
  canal: {
    color: '#4a90a4',
    opacity: 0.9,
    roughness: 0.25,
    metalness: 0.15,
    elevation: 0.04,
  },
  pickleball: {
    color: '#2e6b9e',
    opacity: 0.95,
    roughness: 0.55,
    metalness: 0.05,
    elevation: 0.08,
  },
  park: {
    color: '#7ea86a',
    opacity: 0.9,
    roughness: 0.9,
    metalness: 0,
    elevation: 0.06,
  },
  pool: {
    color: '#6ec4d8',
    opacity: 0.92,
    roughness: 0.15,
    metalness: 0.25,
    elevation: 0.05,
  },
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

function SiteArea({ area }) {
  const style = AREA_STYLES[area.type] || AREA_STYLES.road;
  const { shape, cx, cz } = useMemo(
    () => buildShape(area.polygon, area.holes || []),
    [area.polygon, area.holes],
  );

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, style.elevation, cz]} receiveShadow>
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial
        color={style.color}
        transparent={style.opacity < 1}
        opacity={style.opacity}
        roughness={style.roughness}
        metalness={style.metalness}
      />
    </mesh>
  );
}

export default function SiteAreas({ areas }) {
  if (!areas?.length) return null;

  const sortedAreas = useMemo(
    () =>
      [...areas].sort((left, right) => {
        const order = ['road', 'canal', 'open-space', 'future-development', 'park', 'pool', 'pickleball'];
        return order.indexOf(left.type) - order.indexOf(right.type);
      }),
    [areas],
  );

  return (
    <group>
      {sortedAreas.map((area) => (
        <SiteArea key={area.id} area={area} />
      ))}
    </group>
  );
}

export { AREA_STYLES };
