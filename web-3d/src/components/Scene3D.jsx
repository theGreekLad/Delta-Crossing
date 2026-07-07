import { Suspense, useRef, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Sky, ContactShadows, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import Lots from './Lots';
import SiteAreas from './SiteAreas';
import Trees, { Ground } from './Environment';
import { cameraTargetFromBounds } from '../utils/geometry';

function SceneContent({
  site,
  selectedId,
  onSelect,
  onHover,
  hoveredId,
  showPlatOverlay,
  controlsRef,
  selectedLot,
}) {
  const { cx, cz, span } = cameraTargetFromBounds(site.bounds);
  const maxDistance = span * 2.8;

  return (
    <>
      <PerspectiveCamera
        makeDefault
        position={[cx - span * 0.55, span * 0.65, cz + span * 0.55]}
        fov={48}
        near={10}
        far={span * 8}
      />
      <OrbitControls
        ref={controlsRef}
        target={[cx, 0, cz]}
        enableDamping
        dampingFactor={0.08}
        minDistance={120}
        maxDistance={maxDistance}
        maxPolarAngle={Math.PI / 2.2}
        minPolarAngle={Math.PI / 10}
        enablePan
        panSpeed={1.5}
        zoomSpeed={1.2}
        rotateSpeed={0.5}
      />

      <ambientLight intensity={0.5} />
      <directionalLight
        position={[400, 500, 300]}
        intensity={1.3}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={span * 4}
        shadow-camera-left={-1200}
        shadow-camera-right={1200}
        shadow-camera-top={1200}
        shadow-camera-bottom={-1200}
      />
      <directionalLight position={[-200, 200, -150]} intensity={0.35} color="#b0c4de" />

      <Sky
        distance={450000}
        sunPosition={[400, 100, 300]}
        inclination={0.52}
        azimuth={0.25}
        mieCoefficient={0.005}
        rayleigh={0.8}
      />

      <fog attach="fog" args={['#c9d6e3', span * 4, span * 10]} />

      <Ground
        bounds={site.bounds}
        groundTextureUrl={site.groundTextureUrl}
        showPlatOverlay={showPlatOverlay}
      />
      <SiteAreas areas={site.siteAreas} />
      <Lots
        lots={site.lots}
        selectedId={selectedId}
        onSelect={onSelect}
        onHover={onHover}
        hoveredId={hoveredId}
      />
      <Trees trees={site.trees} />

      <ContactShadows position={[cx, 0.01, cz]} opacity={0.3} scale={span * 2} blur={3} far={200} />

      {selectedLot && <FocusOnLot lot={selectedLot} controlsRef={controlsRef} />}
    </>
  );
}

function FocusOnLot({ lot, controlsRef }) {
  const { camera } = useThree();

  useEffect(() => {
    if (!lot?.polygon?.length) return;

    const [cx, cz] = lot.polygon.reduce(
      (acc, [x, z]) => [acc[0] + x / lot.polygon.length, acc[1] + z / lot.polygon.length],
      [0, 0],
    );

    const heightMap = { commercial: 55, townhome: 40, 'single-family': 45 };
    const targetY = heightMap[lot.type] ?? 45;
    const startPos = camera.position.clone();
    const endPos = new THREE.Vector3(cx - 80, targetY, cz + 100);
    const startTarget = controlsRef.current?.target?.clone() ?? new THREE.Vector3(cx, 0, cz);
    const endTarget = new THREE.Vector3(cx, 0, cz);

    let t = 0;
    const animate = () => {
      t += 0.04;
      if (t >= 1) return;
      const ease = 1 - (1 - t) ** 3;
      camera.position.lerpVectors(startPos, endPos, ease);
      if (controlsRef.current) {
        controlsRef.current.target.lerpVectors(startTarget, endTarget, ease);
        controlsRef.current.update();
      }
      requestAnimationFrame(animate);
    };
    animate();
  }, [lot, camera, controlsRef]);

  return null;
}

export default function Scene3D({ site, selectedLot, onSelect, onHover, hoveredId, showPlatOverlay }) {
  const controlsRef = useRef();

  return (
    <Canvas shadows gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}>
      <Suspense fallback={null}>
        <SceneContent
          site={site}
          selectedId={selectedLot?.id}
          onSelect={onSelect}
          onHover={onHover}
          hoveredId={hoveredId}
          showPlatOverlay={showPlatOverlay}
          controlsRef={controlsRef}
          selectedLot={selectedLot}
        />
      </Suspense>
    </Canvas>
  );
}
