import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';

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

export function Ground({ bounds, groundTextureUrl, showPlatOverlay }) {
  const { minX, maxX, minZ, maxZ } = bounds;
  const width = maxX - minX;
  const depth = maxZ - minZ;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.1, cz]} receiveShadow>
        <planeGeometry args={[width + 300, depth + 300]} />
        <meshStandardMaterial color="#3a3a3a" roughness={0.92} metalness={0.04} />
      </mesh>

      {showPlatOverlay && (
        <PlatOverlay bounds={{ width, depth, cx, cz }} groundTextureUrl={groundTextureUrl} />
      )}
    </group>
  );
}

function PlatOverlay({ bounds, groundTextureUrl }) {
  const platTexture = useTexture(groundTextureUrl);
  const { width, depth, cx, cz } = bounds;

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.25, cz]}>
      <planeGeometry args={[width * 0.98, depth * 0.98]} />
      <meshBasicMaterial map={platTexture} transparent opacity={0.88} toneMapped={false} />
    </mesh>
  );
}
