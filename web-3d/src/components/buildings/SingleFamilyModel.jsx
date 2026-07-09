import React, { useMemo } from 'react';
import * as THREE from 'three';
import { getDesignById } from '../../data/buildingCatalog';

function PitchedRoof({ width, depth, wallHeight, color, overhang = 1.4, ridgeScale = 0.2 }) {
  const geometry = useMemo(() => {
    const hw = width / 2 + overhang;
    const hd = depth / 2 + overhang;
    const ridge = Math.max(5, width * ridgeScale);
    const positions = new Float32Array([
      -hw, 0, hd, hw, 0, hd, 0, ridge, 0,
      hw, 0, -hd, -hw, 0, -hd, 0, ridge, 0,
      -hw, 0, -hd, -hw, 0, hd, 0, ridge, 0,
      hw, 0, hd, hw, 0, -hd, 0, ridge, 0,
    ]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    return geo;
  }, [width, depth, overhang, ridgeScale]);

  return (
    <mesh geometry={geometry} position={[0, wallHeight, 0]} castShadow>
      <meshStandardMaterial color={color} roughness={0.82} side={THREE.DoubleSide} />
    </mesh>
  );
}

function LowPitchRoof({ width, depth, wallHeight, color, overhang = 1 }) {
  const thickness = 1.4;
  return (
    <mesh position={[0, wallHeight + thickness / 2, 0]} castShadow>
      <boxGeometry args={[width + overhang * 2, thickness, depth + overhang * 2]} />
      <meshStandardMaterial color={color} roughness={0.85} />
    </mesh>
  );
}

function HouseRoof({ roofType, width, depth, wallHeight, color }) {
  if (roofType === 'low-pitch') {
    return <LowPitchRoof width={width} depth={depth} wallHeight={wallHeight} color={color} />;
  }
  const ridgeScale = roofType === 'craftsman-gable' ? 0.24 : 0.2;
  return (
    <PitchedRoof
      width={width}
      depth={depth}
      wallHeight={wallHeight}
      color={color}
      ridgeScale={ridgeScale}
      overhang={roofType === 'craftsman-gable' ? 1.6 : 1.4}
    />
  );
}

export default function SingleFamilyModel({ designId, center, rotation }) {
  const design = getDesignById(designId);
  if (!design || design.category !== 'single-family') return null;

  const { style, width, depth } = design;
  const [cx, cz] = center;
  const wall = style.wallHeight;
  const garageW = Math.min(width * 0.48, 22);
  const garageD = depth * 0.42;
  const garageH = wall * 0.78;
  const livingW = width * 0.58;
  const livingD = depth * 0.72;

  return (
    <group position={[cx, 0, cz]} rotation={[0, rotation, 0]}>
      {/* Main living mass */}
      <mesh position={[-width * 0.12, wall / 2, -depth * 0.08]} castShadow receiveShadow>
        <boxGeometry args={[livingW, wall, livingD]} />
        <meshStandardMaterial color={style.bodyLight} roughness={0.78} />
      </mesh>

      {/* Stone base band */}
      <mesh position={[-width * 0.12, 2.1, -depth * 0.08]} castShadow receiveShadow>
        <boxGeometry args={[livingW * 1.01, 4.2, livingD * 1.01]} />
        <meshStandardMaterial color={style.stone} roughness={0.92} />
      </mesh>

      {/* Garage wing */}
      <mesh position={[width * 0.28, garageH / 2, depth * 0.12]} castShadow receiveShadow>
        <boxGeometry args={[garageW, garageH, garageD]} />
        <meshStandardMaterial color={style.bodyDark} roughness={0.8} />
      </mesh>

      {/* Garage door */}
      <mesh position={[width * 0.28, garageH * 0.42, depth * 0.12 + garageD / 2 + 0.12]}>
        <boxGeometry args={[garageW * 0.78, garageH * 0.72, 0.28]} />
        <meshStandardMaterial color={style.garage} roughness={0.65} metalness={0.15} />
      </mesh>

      <HouseRoof
        roofType={style.roofType}
        width={livingW}
        depth={livingD}
        wallHeight={wall}
        color={style.roof}
      />

      {/* Garage roof */}
      {style.roofType === 'low-pitch' ? (
        <mesh position={[width * 0.28, garageH + 0.7, depth * 0.12]} castShadow>
          <boxGeometry args={[garageW + 1.5, 1.2, garageD + 1.5]} />
          <meshStandardMaterial color={style.roof} roughness={0.85} />
        </mesh>
      ) : (
        <HouseRoof
          roofType={style.roofType}
          width={garageW}
          depth={garageD}
          wallHeight={garageH}
          color={style.roof}
        />
      )}

      {/* Front porch slab */}
      <mesh position={[-width * 0.18, 0.4, depth / 2 - 2]} receiveShadow>
        <boxGeometry args={[livingW * 0.45, 0.8, 6]} />
        <meshStandardMaterial color="#c4b8a4" roughness={0.88} />
      </mesh>

      {/* Porch posts */}
      {[-livingW * 0.12, livingW * 0.08].map((x, index) => (
        <mesh key={index} position={[-width * 0.18 + x, 4.2, depth / 2 + 0.5]} castShadow>
          <boxGeometry args={[0.7, 8, 0.7]} />
          <meshStandardMaterial color={style.trim} roughness={0.85} />
        </mesh>
      ))}

      {/* Front door */}
      <mesh position={[-width * 0.18, 5.2, depth / 2 - 5.2]}>
        <boxGeometry args={[3.2, 8.5, 0.35]} />
        <meshStandardMaterial color="#2c241c" roughness={0.7} />
      </mesh>

      {/* Windows */}
      <mesh position={[-width * 0.28, wall * 0.55, depth / 2 - 5]}>
        <boxGeometry args={[4.5, 3.5, 0.3]} />
        <meshStandardMaterial color="#1a3040" roughness={0.25} metalness={0.3} />
      </mesh>
      <mesh position={[-width * 0.05, wall * 0.55, depth / 2 - 5]}>
        <boxGeometry args={[4.5, 3.5, 0.3]} />
        <meshStandardMaterial color="#1a3040" roughness={0.25} metalness={0.3} />
      </mesh>

      {style.roofType === 'craftsman-gable' && (
        <mesh position={[-width * 0.12, wall + 4.5, -depth * 0.2]} castShadow>
          <boxGeometry args={[livingW * 0.28, 5, livingW * 0.28]} />
          <meshStandardMaterial color={style.trim} roughness={0.88} />
        </mesh>
      )}

      {/* Driveway */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[width * 0.28, 0.05, depth / 2 + 10]} receiveShadow>
        <planeGeometry args={[garageW * 1.15, 18]} />
        <meshStandardMaterial color="#4a4a4a" roughness={0.92} />
      </mesh>
    </group>
  );
}
