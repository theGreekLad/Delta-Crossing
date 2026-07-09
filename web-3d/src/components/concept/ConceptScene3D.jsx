import React, { Suspense, useRef, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Sky, ContactShadows, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import Trees from '../Environment';
import ConceptBuildings from './ConceptBuildings';
import ConceptAmenities, { ConceptGround } from './ConceptAmenities';
import { cameraTargetFromBounds } from '../../utils/geometry';

function SceneContent({ site, controlsRef, cameraPreset }) {
  const { cx, cz, span } = cameraTargetFromBounds(site.bounds);
  const maxDistance = span * 3.2;
  const isDusk = cameraPreset === 'dusk';

  const presets = {
    aerial: {
      position: [cx - span * 0.15, span * 1.05, cz + span * 0.35],
      target: [cx, 0, cz],
      maxPolar: Math.PI / 2.35,
    },
    street: {
      position: [cx - span * 0.35, span * 0.22, cz + span * 0.45],
      target: [cx - span * 0.05, 0, cz],
      maxPolar: Math.PI / 2.15,
    },
    dusk: {
      position: [cx + span * 0.4, span * 0.55, cz + span * 0.5],
      target: [cx, 0, cz],
      maxPolar: Math.PI / 2.25,
    },
  };

  const preset = presets[cameraPreset] || presets.aerial;

  useEffect(() => {
    if (!controlsRef.current) return;
    controlsRef.current.target.set(preset.target[0], preset.target[1], preset.target[2]);
    controlsRef.current.update();
  }, [cameraPreset, controlsRef, preset.target]);

  return (
    <>
      <PerspectiveCamera makeDefault position={preset.position} fov={42} near={8} far={span * 10} />
      <OrbitControls
        ref={controlsRef}
        target={preset.target}
        enableDamping
        dampingFactor={0.07}
        minDistance={80}
        maxDistance={maxDistance}
        maxPolarAngle={preset.maxPolar}
        minPolarAngle={Math.PI / 14}
        enablePan
        panSpeed={1.4}
        zoomSpeed={1.15}
        rotateSpeed={0.45}
      />

      <ambientLight intensity={isDusk ? 0.35 : 0.55} />
      <directionalLight
        position={isDusk ? [200, 80, -300] : [450, 520, 280]}
        intensity={isDusk ? 0.85 : 1.45}
        color={isDusk ? '#ffb070' : '#fff5e6'}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={span * 4}
        shadow-camera-left={-1400}
        shadow-camera-right={1400}
        shadow-camera-top={1400}
        shadow-camera-bottom={-1400}
      />
      <directionalLight
        position={[-220, 180, -160]}
        intensity={isDusk ? 0.2 : 0.4}
        color="#b0c4de"
      />
      {isDusk && <hemisphereLight args={['#ff9a5c', '#1a2030', 0.45]} />}

      <Sky
        distance={450000}
        sunPosition={isDusk ? [80, 12, -200] : [400, 120, 280]}
        inclination={isDusk ? 0.48 : 0.55}
        azimuth={0.22}
        mieCoefficient={0.005}
        rayleigh={isDusk ? 1.4 : 0.7}
        turbidity={isDusk ? 8 : 3}
      />

      <fog attach="fog" args={[isDusk ? '#c48a6a' : '#c5d4e2', span * 3.5, span * 9]} />

      <ConceptGround bounds={site.bounds} />
      <ConceptAmenities areas={site.siteAreas} />
      <ConceptBuildings lots={site.lots} />
      <Trees trees={site.trees} />

      <ContactShadows
        position={[cx, 0.02, cz]}
        opacity={0.35}
        scale={span * 2.2}
        blur={2.8}
        far={180}
      />
    </>
  );
}

export default function ConceptScene3D({ site, cameraPreset = 'aerial' }) {
  const controlsRef = useRef();

  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      gl={{
        antialias: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: cameraPreset === 'dusk' ? 1.05 : 1.15,
      }}
    >
      <Suspense fallback={null}>
        <SceneContent
          key={cameraPreset}
          site={site}
          controlsRef={controlsRef}
          cameraPreset={cameraPreset}
        />
      </Suspense>
    </Canvas>
  );
}
