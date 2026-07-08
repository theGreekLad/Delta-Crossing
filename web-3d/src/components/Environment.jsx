import React, { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

function Tree({ x, z, scale }) {
  const ref = useRef();
  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.4 + x * 0.01) * 0.04;
    }
  });

  return (
    <group ref={ref} position={[x, 0, z]} scale={scale}>
      <mesh position={[0, 1.5 * scale, 0]} castShadow>
        <cylinderGeometry args={[0.25 * scale, 0.35 * scale, 3 * scale, 6]} />
        <meshStandardMaterial color="#5c4033" roughness={0.9} />
      </mesh>
      <mesh position={[0, 4 * scale, 0]} castShadow>
        <coneGeometry args={[1.8 * scale, 3.5 * scale, 7]} />
        <meshStandardMaterial color="#2d6a3e" roughness={0.85} />
      </mesh>
      <mesh position={[0, 5.5 * scale, 0]} castShadow>
        <coneGeometry args={[1.3 * scale, 2.5 * scale, 7]} />
        <meshStandardMaterial color="#3d8a52" roughness={0.85} />
      </mesh>
    </group>
  );
}

export default function Trees({ trees }) {
  return (
    <group>
      {trees.map((tree, index) => (
        <Tree key={index} x={tree.x} z={tree.z} scale={tree.scale} />
      ))}
    </group>
  );
}

export function Ground({ bounds, satelliteOverlay, showSatelliteOverlay }) {
  const { minX, maxX, minZ, maxZ } = bounds;
  const width = maxX - minX;
  const depth = maxZ - minZ;
  const span = Math.max(width, depth);
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.1, cz]} receiveShadow>
        <planeGeometry args={[span * 3, span * 3]} />
        <meshStandardMaterial color="#3a3a3a" roughness={0.92} metalness={0.04} />
      </mesh>

      {showSatelliteOverlay && satelliteOverlay && (
        <SatelliteOverlay overlay={satelliteOverlay} />
      )}
    </group>
  );
}

function SatelliteOverlay({ overlay }) {
  const [texture, setTexture] = useState(null);
  const { width, depth, centerX, centerZ } = overlay;

  useEffect(() => {
    let cancelled = false;
    let loadedTexture = null;
    const loader = new THREE.TextureLoader();

    loader.load(
      overlay.textureUrl,
      (nextTexture) => {
        loadedTexture = nextTexture;
        nextTexture.colorSpace = THREE.SRGBColorSpace;
        if (!cancelled) setTexture(nextTexture);
      },
      undefined,
      () => {
        if (!cancelled) setTexture(null);
      },
    );

    return () => {
      cancelled = true;
      loadedTexture?.dispose();
      setTexture(null);
    };
  }, [overlay.textureUrl]);

  if (!texture) return null;

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[centerX, 0.25, centerZ]}>
      <planeGeometry args={[width, depth]} />
      <meshBasicMaterial map={texture} transparent opacity={0.92} toneMapped={false} />
    </mesh>
  );
}
