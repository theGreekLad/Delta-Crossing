import React, { useMemo } from 'react';
import * as THREE from 'three';
import { polygonCentroid, polygonShapeOnGround } from '../../utils/geometry';

const SF_PALETTE = ['#e8dcc8', '#f0e6d6', '#ddd0bc', '#e6d8c4', '#f2ebe0'];
const TH_PALETTE = ['#d4c4a8', '#cbb89a', '#dcc8b0', '#c8b498'];
const COMM_PALETTE = ['#c8beb0', '#b8aea0', '#d0c6b8'];
const ROOF_SF = ['#5c4a3a', '#6b5344', '#4a3c32', '#7a5c48'];
const ROOF_TH = ['#4a5560', '#5a6570', '#3d4852'];
const ROOF_COMM = ['#6b7280', '#5a616c', '#747b86'];

function seededPick(palette, seed) {
  return palette[Math.abs(seed) % palette.length];
}

function hashSeed(lot) {
  return (lot.lotNumber || lot.blockNumber || 0) * 17 + (lot.id?.length || 0) * 13;
}

function Yard({ polygon, color }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} receiveShadow>
      <shapeGeometry args={[polygonShapeOnGround(polygon)]} />
      <meshStandardMaterial color={color} roughness={0.95} />
    </mesh>
  );
}

function PitchedRoof({ width, depth, wallHeight, color, overhang = 1.2 }) {
  const geometry = useMemo(() => {
    const hw = width / 2 + overhang;
    const hd = depth / 2 + overhang;
    const ridge = Math.max(4.5, width * 0.18);
    const positions = new Float32Array([
      // front slope
      -hw, 0, hd, hw, 0, hd, 0, ridge, 0,
      // back slope
      hw, 0, -hd, -hw, 0, -hd, 0, ridge, 0,
      // left gable
      -hw, 0, -hd, -hw, 0, hd, 0, ridge, 0,
      // right gable
      hw, 0, hd, hw, 0, -hd, 0, ridge, 0,
    ]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    return geo;
  }, [width, depth, overhang]);

  return (
    <mesh geometry={geometry} position={[0, wallHeight, 0]} castShadow>
      <meshStandardMaterial color={color} roughness={0.82} side={THREE.DoubleSide} />
    </mesh>
  );
}

function WindowStrip({ width, height, depth, y, zFace, color = '#1a3040' }) {
  const count = Math.max(2, Math.floor(width / 8));
  const spacing = width / (count + 1);
  return (
    <group>
      {Array.from({ length: count }, (_, index) => (
        <mesh
          key={index}
          position={[-width / 2 + spacing * (index + 1), y, zFace]}
          castShadow={false}
        >
          <boxGeometry args={[Math.min(3.2, spacing * 0.45), height, 0.35]} />
          <meshStandardMaterial color={color} roughness={0.2} metalness={0.35} emissive={color} emissiveIntensity={0.08} />
        </mesh>
      ))}
      {/* Side windows */}
      <mesh position={[width / 2 + 0.05, y, 0]}>
        <boxGeometry args={[0.35, height, Math.min(depth * 0.35, 6)]} />
        <meshStandardMaterial color={color} roughness={0.2} metalness={0.35} />
      </mesh>
    </group>
  );
}

function Driveway({ width, depth, rotation, center }) {
  const driveW = Math.min(width * 0.42, 18);
  const driveD = Math.min(depth * 0.55, 28);
  const [cx, cz] = center;
  const offset = depth * 0.38;
  return (
    <group position={[cx, 0, cz]} rotation={[0, rotation, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, offset]} receiveShadow>
        <planeGeometry args={[driveW, driveD]} />
        <meshStandardMaterial color="#4a4a4a" roughness={0.9} />
      </mesh>
    </group>
  );
}

function SingleFamilyHome({ lot }) {
  const building = lot.building;
  if (!building || building.width < 1) return null;

  const seed = hashSeed(lot);
  const { center, rotation, width, depth } = building;
  const wall = 14 + (seed % 4);
  const bodyColor = seededPick(SF_PALETTE, seed);
  const roofColor = seededPick(ROOF_SF, seed + 3);
  const [cx, cz] = center;
  const garageW = width * 0.38;
  const garageD = depth * 0.55;
  const garageH = wall * 0.72;

  return (
    <group>
      <Yard polygon={lot.polygon} color="#6a9a5a" />
      <Driveway width={width} depth={depth} rotation={rotation} center={center} />
      <group position={[cx, 0, cz]} rotation={[0, rotation, 0]}>
        {/* Main mass */}
        <mesh position={[0, wall / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[width, wall, depth]} />
          <meshStandardMaterial color={bodyColor} roughness={0.78} />
        </mesh>
        <PitchedRoof width={width} depth={depth} wallHeight={wall} color={roofColor} />
        <WindowStrip width={width} height={3.2} depth={depth} y={wall * 0.55} zFace={depth / 2 + 0.2} />

        {/* Garage wing */}
        <mesh position={[width * 0.42, garageH / 2, depth * 0.12]} castShadow receiveShadow>
          <boxGeometry args={[garageW, garageH, garageD]} />
          <meshStandardMaterial color={bodyColor} roughness={0.8} />
        </mesh>
        <mesh position={[width * 0.42, garageH + 0.05, depth * 0.12]} castShadow>
          <boxGeometry args={[garageW + 1, 1.2, garageD + 1]} />
          <meshStandardMaterial color={roofColor} roughness={0.85} />
        </mesh>
        {/* Garage door */}
        <mesh position={[width * 0.42, garageH * 0.42, depth * 0.12 + garageD / 2 + 0.1]}>
          <boxGeometry args={[garageW * 0.72, garageH * 0.7, 0.3]} />
          <meshStandardMaterial color="#3d3d3d" roughness={0.6} />
        </mesh>

        {/* Chimney */}
        <mesh position={[-width * 0.28, wall + 4, -depth * 0.15]} castShadow>
          <boxGeometry args={[2.2, 6, 2.2]} />
          <meshStandardMaterial color="#8a6a55" roughness={0.9} />
        </mesh>

        {/* Front porch slab */}
        <mesh position={[0, 0.4, depth / 2 + 2]} receiveShadow>
          <boxGeometry args={[width * 0.35, 0.8, 5]} />
          <meshStandardMaterial color="#c4b8a4" roughness={0.88} />
        </mesh>
      </group>
    </group>
  );
}

function TownhomeBlock({ lot }) {
  const building = lot.building;
  if (!building || building.width < 1) return null;

  const seed = hashSeed(lot);
  const { center, rotation, width, depth } = building;
  const wall = 22 + (seed % 3);
  const units = Math.max(3, Math.min(6, Math.round(width / 22)));
  const unitW = width / units;
  const [cx, cz] = center;
  const roofColor = seededPick(ROOF_TH, seed);

  return (
    <group>
      <Yard polygon={lot.polygon} color="#5f8f52" />
      <group position={[cx, 0, cz]} rotation={[0, rotation, 0]}>
        {Array.from({ length: units }, (_, index) => {
          const x = -width / 2 + unitW * (index + 0.5);
          const bodyColor = seededPick(TH_PALETTE, seed + index);
          return (
            <group key={index} position={[x, 0, 0]}>
              <mesh position={[0, wall / 2, 0]} castShadow receiveShadow>
                <boxGeometry args={[unitW * 0.96, wall, depth]} />
                <meshStandardMaterial color={bodyColor} roughness={0.76} />
              </mesh>
              <PitchedRoof
                width={unitW * 0.96}
                depth={depth}
                wallHeight={wall}
                color={roofColor}
                overhang={0.6}
              />
              {/* Entry */}
              <mesh position={[0, 4, depth / 2 + 0.15]}>
                <boxGeometry args={[unitW * 0.28, 8, 0.3]} />
                <meshStandardMaterial color="#2c241c" roughness={0.7} />
              </mesh>
              {/* Balcony / upper window */}
              <mesh position={[0, wall * 0.62, depth / 2 + 0.2]}>
                <boxGeometry args={[unitW * 0.4, 3.5, 0.35]} />
                <meshStandardMaterial color="#1a3040" roughness={0.25} metalness={0.3} />
              </mesh>
              {/* Small driveway pad */}
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, depth / 2 + 8]} receiveShadow>
                <planeGeometry args={[unitW * 0.7, 14]} />
                <meshStandardMaterial color="#454545" roughness={0.92} />
              </mesh>
            </group>
          );
        })}
      </group>
    </group>
  );
}

function CommercialBuilding({ lot }) {
  const building = lot.building;
  if (!building || building.width < 1) {
    const [cx, cz] = polygonCentroid(lot.polygon);
    return (
      <group>
        <Yard polygon={lot.polygon} color="#9a958c" />
        <mesh position={[cx, 8, cz]} castShadow receiveShadow>
          <boxGeometry args={[40, 16, 30]} />
          <meshStandardMaterial color="#c8beb0" roughness={0.8} />
        </mesh>
      </group>
    );
  }

  const seed = hashSeed(lot);
  const { center, rotation, width, depth } = building;
  const wall = 18 + (seed % 6);
  const bodyColor = seededPick(COMM_PALETTE, seed);
  const roofColor = seededPick(ROOF_COMM, seed + 2);
  const [cx, cz] = center;
  const storefrontCount = Math.max(3, Math.floor(width / 18));

  return (
    <group>
      <Yard polygon={lot.polygon} color="#9a958c" />
      {/* Parking apron */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.04, cz]} receiveShadow>
        <planeGeometry args={[width * 1.15, depth * 1.15]} />
        <meshStandardMaterial color="#4e4e4e" roughness={0.9} />
      </mesh>
      <group position={[cx, 0, cz]} rotation={[0, rotation, 0]}>
        <mesh position={[0, wall / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[width, wall, depth]} />
          <meshStandardMaterial color={bodyColor} roughness={0.72} />
        </mesh>
        {/* Flat roof parapet */}
        <mesh position={[0, wall + 0.8, 0]} castShadow>
          <boxGeometry args={[width + 1.5, 1.6, depth + 1.5]} />
          <meshStandardMaterial color={roofColor} roughness={0.88} />
        </mesh>
        {/* Canopy */}
        <mesh position={[0, wall * 0.42, depth / 2 + 3]} castShadow>
          <boxGeometry args={[width * 0.92, 0.6, 8]} />
          <meshStandardMaterial color="#3a3a3a" roughness={0.7} metalness={0.2} />
        </mesh>
        {/* Storefront bays */}
        {Array.from({ length: storefrontCount }, (_, index) => {
          const spacing = width / (storefrontCount + 1);
          const x = -width / 2 + spacing * (index + 1);
          return (
            <mesh key={index} position={[x, wall * 0.28, depth / 2 + 0.2]}>
              <boxGeometry args={[Math.min(10, spacing * 0.55), wall * 0.42, 0.4]} />
              <meshStandardMaterial
                color="#1e3a4a"
                roughness={0.15}
                metalness={0.4}
                emissive="#1e3a4a"
                emissiveIntensity={0.12}
              />
            </mesh>
          );
        })}
        {/* Sign band */}
        <mesh position={[0, wall * 0.78, depth / 2 + 0.25]}>
          <boxGeometry args={[width * 0.7, 2.5, 0.4]} />
          <meshStandardMaterial color="#2a2a2a" roughness={0.6} />
        </mesh>
      </group>
    </group>
  );
}

function ConceptHome({ lot }) {
  if (lot.type === 'commercial') return <CommercialBuilding lot={lot} />;
  if (lot.type === 'townhome') return <TownhomeBlock lot={lot} />;
  return <SingleFamilyHome lot={lot} />;
}

export default function ConceptBuildings({ lots }) {
  return (
    <group>
      {lots.map((lot) => (
        <ConceptHome key={lot.id} lot={lot} />
      ))}
    </group>
  );
}
