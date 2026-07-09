import React, { useMemo } from 'react';
import * as THREE from 'three';
import { getDesignById } from '../../data/buildingCatalog';

function PitchedRoof({ width, depth, wallHeight, color, overhang = 1.2, ridgeScale = 0.18 }) {
  const geometry = useMemo(() => {
    const hw = width / 2 + overhang;
    const hd = depth / 2 + overhang;
    const ridge = Math.max(4.5, width * ridgeScale);
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

function LowPitchRoof({ width, depth, wallHeight, color, overhang = 0.8 }) {
  const thickness = 1.2;
  return (
    <mesh position={[0, wallHeight + thickness / 2, 0]} castShadow>
      <boxGeometry args={[width + overhang * 2, thickness, depth + overhang * 2]} />
      <meshStandardMaterial color={color} roughness={0.85} />
    </mesh>
  );
}

function UnitRoof({ roofType, width, depth, wallHeight, color }) {
  if (roofType === 'low-pitch') {
    return <LowPitchRoof width={width} depth={depth} wallHeight={wallHeight} color={color} />;
  }
  const ridgeScale = roofType === 'craftsman-gable' ? 0.22 : 0.18;
  return (
    <PitchedRoof
      width={width}
      depth={depth}
      wallHeight={wallHeight}
      color={color}
      ridgeScale={ridgeScale}
      overhang={roofType === 'craftsman-gable' ? 1.4 : 1.2}
    />
  );
}

function FourplexUnit({ unitWidth, depth, style, isEndUnit, unitIndex }) {
  const wall = style.wallHeight;
  const bodyColor = unitIndex % 2 === 0 ? style.bodyLight : style.bodyDark;
  const garageW = isEndUnit ? Math.min(unitWidth * 0.68, 20) : Math.min(unitWidth * 0.72, 12);
  const garageD = depth * 0.52;
  const garageH = wall * 0.78;
  const livingD = depth - garageD * 0.55;
  const livingZ = -depth * 0.12;

  return (
    <group>
      <mesh position={[0, wall / 2, livingZ]} castShadow receiveShadow>
        <boxGeometry args={[unitWidth * 0.96, wall, livingD]} />
        <meshStandardMaterial color={bodyColor} roughness={0.78} />
      </mesh>

      <mesh position={[0, 2.2, depth / 2 - 1.2]} castShadow receiveShadow>
        <boxGeometry args={[unitWidth * 0.94, 4.4, 2.4]} />
        <meshStandardMaterial color={style.stone} roughness={0.92} />
      </mesh>

      <mesh position={[0, garageH / 2, depth * 0.14]} castShadow receiveShadow>
        <boxGeometry args={[garageW, garageH, garageD]} />
        <meshStandardMaterial color={bodyColor} roughness={0.8} />
      </mesh>

      <mesh position={[0, garageH * 0.42, depth * 0.14 + garageD / 2 + 0.12]}>
        <boxGeometry args={[garageW * 0.82, garageH * 0.72, 0.28]} />
        <meshStandardMaterial color={style.garage} roughness={0.65} metalness={0.15} />
      </mesh>

      <UnitRoof
        roofType={style.roofType}
        width={unitWidth * 0.96}
        depth={depth}
        wallHeight={wall}
        color={style.roof}
      />

      {style.roofType === 'craftsman-gable' && (
        <mesh position={[0, wall + 5, livingZ - livingD * 0.15]} castShadow>
          <boxGeometry args={[unitWidth * 0.35, 4, unitWidth * 0.35]} />
          <meshStandardMaterial color={style.trim} roughness={0.88} />
        </mesh>
      )}

      <mesh position={[0, 5.5, depth / 2 + 0.8]}>
        <boxGeometry args={[unitWidth * 0.22, 11, 0.35]} />
        <meshStandardMaterial color="#2c241c" roughness={0.7} />
      </mesh>

      {style.roofType !== 'low-pitch' && (
        <mesh position={[0, 3.8, depth / 2 + 1.2]} castShadow>
          <boxGeometry args={[0.8, 7.6, 0.8]} />
          <meshStandardMaterial color={style.trim} roughness={0.85} />
        </mesh>
      )}

      <mesh position={[0, wall * 0.55, depth / 2 + 0.2]}>
        <boxGeometry args={[unitWidth * 0.18, 3.2, 0.3]} />
        <meshStandardMaterial color="#1a3040" roughness={0.25} metalness={0.3} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, depth / 2 + 10]} receiveShadow>
        <planeGeometry args={[garageW * 1.1, 16]} />
        <meshStandardMaterial color="#4a4a4a" roughness={0.92} />
      </mesh>
    </group>
  );
}

export default function FourplexModel({ designId, center, rotation }) {
  const design = getDesignById(designId);
  if (!design) return null;

  const { style, unitWidths, width, depth } = design;
  const [cx, cz] = center;

  let cursor = -width / 2;

  return (
    <group position={[cx, 0, cz]} rotation={[0, rotation, 0]}>
      {unitWidths.map((unitWidth, index) => {
        const x = cursor + unitWidth / 2;
        cursor += unitWidth;
        const isEndUnit = index === 0 || index === unitWidths.length - 1;
        return (
          <group key={index} position={[x, 0, 0]}>
            <FourplexUnit
              unitWidth={unitWidth}
              depth={depth}
              style={style}
              isEndUnit={isEndUnit}
              unitIndex={index}
            />
          </group>
        );
      })}
    </group>
  );
}
