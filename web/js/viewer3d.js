import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  addTreesForLot,
  computeFeetPerPixel,
  createCommercialBuilding,
  createCoordinateTransform,
  createLotPad,
  createSingleFamilyHome,
  createTownhome,
} from "./lotGeometry.js";

const state = {
  manifest: null,
  sheets: {},
  activeSheetId: "sheet1",
  lots: [],
  commercial: [],
  selectedParcelId: null,
  buildingGroups: new Map(),
  scene: null,
  camera: null,
  renderer: null,
  controls: null,
  transform: null,
  raycaster: new THREE.Raycaster(),
  pointer: new THREE.Vector2(),
  animationId: null,
};

const els = {
  canvasHost: document.getElementById("canvas-host"),
  loading: document.getElementById("loading"),
  lotSearch: document.getElementById("lot-search"),
  infoEmpty: document.getElementById("info-empty"),
  infoContent: document.getElementById("info-content"),
  infoTitle: document.getElementById("info-title"),
  infoLotNumber: document.getElementById("info-lot-number"),
  infoLotType: document.getElementById("info-lot-type"),
  infoSquareFeet: document.getElementById("info-square-feet"),
  infoPhase: document.getElementById("info-phase"),
  infoSheet: document.getElementById("info-sheet"),
  infoCentroid: document.getElementById("info-centroid"),
  infoBounds: document.getElementById("info-bounds"),
  renderPlaceholder: document.getElementById("render-placeholder"),
  zoomLabel: document.getElementById("zoom-label"),
  viewHint: document.getElementById("view-hint"),
};

async function init() {
  bindControls();
  const manifest = await fetchJson("data/manifest.json");
  state.manifest = manifest;
  await loadSheet("sheet1");
  initScene();
  buildWorld();
  applyDeepLink();
  animate();
}

function bindControls() {
  document.getElementById("btn-reset").addEventListener("click", resetView);
  document.getElementById("btn-fullscreen").addEventListener("click", toggleFullscreen);
  document.getElementById("btn-focus-lot").addEventListener("click", () => {
    if (state.selectedParcelId) {
      focusParcel(state.selectedParcelId);
    }
  });

  els.lotSearch.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      focusLotSearch(els.lotSearch.value);
    }
  });

  window.addEventListener("resize", onResize);
  els.canvasHost.addEventListener("pointerdown", onPointerDown);
}

async function loadSheet(sheetId) {
  const sheet = state.manifest.sheets.find((entry) => entry.id === sheetId);
  if (!sheet) return;

  state.activeSheetId = sheetId;
  state.selectedParcelId = null;
  clearInfoPanel();

  if (!state.sheets[sheetId]) {
    const lots = await fetchJson(sheet.lotsFile);
    const commercial = sheet.commercialFile ? await fetchJson(sheet.commercialFile) : [];
    state.sheets[sheetId] = { sheet, lots, commercial };
  }

  state.lots = state.sheets[sheetId].lots;
  state.commercial = state.sheets[sheetId].commercial;
}

function getActiveSheet() {
  return state.manifest.sheets.find((entry) => entry.id === state.activeSheetId);
}

function initScene() {
  const sheet = getActiveSheet();
  const feetPerPixel = computeFeetPerPixel(state.lots);
  state.transform = createCoordinateTransform(sheet.pixelWidth, sheet.pixelHeight, feetPerPixel);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xb8d4f0);
  scene.fog = new THREE.Fog(0xb8d4f0, 1200, 4200);

  const camera = new THREE.PerspectiveCamera(52, getAspect(), 0.5, 8000);
  camera.position.set(0, 1400, 900);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(els.canvasHost.clientWidth, els.canvasHost.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  els.canvasHost.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.screenSpacePanning = true;
  controls.minDistance = 18;
  controls.maxDistance = 3200;
  controls.maxPolarAngle = Math.PI / 2.05;
  controls.target.set(0, 0, 0);
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.PAN,
  };

  const hemi = new THREE.HemisphereLight(0xeaf4ff, 0x4a6741, 0.55);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff5e6, 1.35);
  sun.position.set(-600, 900, 400);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 3000;
  const shadowSpan = Math.max(state.transform.mapWidthFeet, state.transform.mapHeightFeet) * 0.65;
  sun.shadow.camera.left = -shadowSpan;
  sun.shadow.camera.right = shadowSpan;
  sun.shadow.camera.top = shadowSpan;
  sun.shadow.camera.bottom = -shadowSpan;
  sun.shadow.bias = -0.0008;
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0xc8ddff, 0.35);
  fill.position.set(500, 300, -600);
  scene.add(fill);

  state.scene = scene;
  state.camera = camera;
  state.renderer = renderer;
  state.controls = controls;

  controls.addEventListener("change", updateZoomLabel);
  updateZoomLabel();
}

function buildWorld() {
  clearWorld();

  const root = new THREE.Group();
  root.name = "development-root";
  state.scene.add(root);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(state.transform.mapWidthFeet * 1.08, state.transform.mapHeightFeet * 1.08),
    new THREE.MeshStandardMaterial({ color: 0x7ea86a, roughness: 0.96, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.2;
  ground.receiveShadow = true;
  root.add(ground);

  loadGroundTexture(ground);

  const buildings = new THREE.Group();
  buildings.name = "buildings";
  root.add(buildings);

  const pads = new THREE.Group();
  pads.name = "pads";
  root.add(pads);

  const trees = new THREE.Group();
  trees.name = "trees";
  root.add(trees);

  state.lots.forEach((lot) => {
    const pad = createLotPad(lot, state.transform);
    pads.add(pad);

    const building =
      lot.lotType === "townhome"
        ? createTownhome(lot, state.transform)
        : createSingleFamilyHome(lot, state.transform);
    buildings.add(building);
    state.buildingGroups.set(lot.id, building);

    const treeGroup = new THREE.Group();
    addTreesForLot(treeGroup, lot, state.transform);
    trees.add(treeGroup);
  });

  state.commercial.forEach((parcel) => {
    const pad = createLotPad({ ...parcel, phase: parcel.phase ?? 2 }, state.transform);
    pads.add(pad);

    const building = createCommercialBuilding(parcel, state.transform);
    buildings.add(building);
    state.buildingGroups.set(parcel.id, building);
  });

  addRoadLabels(root);
  showLoading(false);
  updateSelectionHighlight();
}

function loadGroundTexture(ground) {
  const sheet = getActiveSheet();
  const textureLoader = new THREE.TextureLoader();
  const overviewUrl = `${sheet.tileSource.replace(".dzi", "_files")}/14/0_0.jpg`;

  textureLoader.load(
    overviewUrl,
    (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = state.renderer.capabilities.getMaxAnisotropy();
      ground.material.map = texture;
      ground.material.color.set(0xffffff);
      ground.material.roughness = 0.98;
      ground.material.needsUpdate = true;
    },
    undefined,
    () => {
      // Overview tile unavailable — keep procedural grass ground.
    }
  );
}

function addRoadLabels(root) {
  const sheet = getActiveSheet();
  if (!sheet.roads?.length) return;

  sheet.roads.forEach((road) => {
    if (road.name.includes("PARKING") || road.name.startsWith("%%") || road.name.startsWith("=")) return;

    const world = state.transform.toWorld([road.x, road.y]);
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#334155";
    ctx.font = "bold 26px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(road.name, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(80, 10), material);
    sign.rotation.x = -Math.PI / 2;
    sign.position.set(world.x, 0.35, world.z);
    root.add(sign);
  });
}

function clearWorld() {
  state.buildingGroups.clear();
  const existing = state.scene.getObjectByName("development-root");
  if (existing) state.scene.remove(existing);
}

function onPointerDown(event) {
  if (event.button !== 0) return;

  const rect = state.renderer.domElement.getBoundingClientRect();
  state.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  state.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  state.raycaster.setFromCamera(state.pointer, state.camera);
  const buildingMeshes = [];
  state.buildingGroups.forEach((group) => {
    group.traverse((child) => {
      if (child.isMesh) buildingMeshes.push(child);
    });
  });

  const hits = state.raycaster.intersectObjects(buildingMeshes, false);
  if (!hits.length) return;

  let node = hits[0].object;
  while (node && !node.userData?.parcelId) {
    node = node.parent;
  }
  if (node?.userData?.parcelId) {
    selectParcel(node.userData.parcelId, { focus: false });
  }
}

function findParcel(parcelId) {
  return (
    state.lots.find((entry) => entry.id === parcelId) ||
    state.commercial.find((entry) => entry.id === parcelId)
  );
}

function getParcelNumber(parcel) {
  return parcel.lotNumber ?? parcel.blockNumber;
}

function formatLotType(lotType) {
  if (lotType === "single-family") return "Single family";
  if (lotType === "townhome") return "Townhome";
  return lotType || "—";
}

function formatSquareFeet(squareFeet) {
  if (!Number.isFinite(squareFeet)) return "—";
  return `${squareFeet.toLocaleString()} sq ft`;
}

function selectParcel(parcelId, options = { focus: true }) {
  const parcel = findParcel(parcelId);
  if (!parcel) return;

  state.selectedParcelId = parcelId;
  updateSelectionHighlight();
  updateInfoPanel(parcel);
  updateDeepLink(getParcelNumber(parcel));

  if (options.focus) {
    focusParcel(parcelId);
  }
}

function updateSelectionHighlight() {
  state.buildingGroups.forEach((group, parcelId) => {
    const selected = parcelId === state.selectedParcelId;
    group.traverse((child) => {
      if (!child.isMesh || !child.material?.emissive) return;
      child.material.emissive.setHex(selected ? 0x224488 : 0x000000);
      child.material.emissiveIntensity = selected ? 0.18 : 0;
    });
  });
}

function updateInfoPanel(parcel) {
  const sheet = getActiveSheet();
  const isCommercial = parcel.type === "commercial";
  els.infoEmpty.classList.add("hidden");
  els.infoContent.classList.remove("hidden");
  els.infoTitle.textContent = isCommercial
    ? `${parcel.label} ${parcel.blockNumber}`
    : `Lot ${parcel.lotNumber}`;
  els.infoLotNumber.textContent = isCommercial ? `Block ${parcel.blockNumber}` : parcel.lotNumber;
  els.infoLotType.textContent = isCommercial ? "Commercial" : formatLotType(parcel.lotType);
  els.infoSquareFeet.textContent = isCommercial ? "—" : formatSquareFeet(parcel.squareFeet);
  els.infoPhase.textContent = parcel.phase ? `Phase ${parcel.phase}` : "—";
  els.infoSheet.textContent = sheet ? sheet.title : state.activeSheetId;
  els.infoCentroid.textContent = `${parcel.centroid[0]}, ${parcel.centroid[1]}`;
  els.infoBounds.textContent = parcel.bounds.join(", ");

  if (parcel.rendering) {
    const label = isCommercial
      ? `${parcel.label} ${parcel.blockNumber}`
      : `Lot ${parcel.lotNumber}`;
    els.renderPlaceholder.innerHTML = `<img src="${parcel.rendering}" alt="${label} rendering" style="max-width:100%;border-radius:0.6rem;" />`;
  } else {
    const typeLabel = isCommercial
      ? "Commercial building"
      : parcel.lotType === "townhome"
        ? "Townhome"
        : "Single-family home";
    els.renderPlaceholder.innerHTML = `<div class="render-preview"><span class="render-icon">${parcel.lotType === "townhome" ? "🏘️" : "🏠"}</span><p>3D ${typeLabel} model rendered on this lot.</p></div>`;
  }
}

function clearInfoPanel() {
  els.infoEmpty.classList.remove("hidden");
  els.infoContent.classList.add("hidden");
}

function focusParcel(parcelId) {
  const parcel = findParcel(parcelId);
  const building = state.buildingGroups.get(parcelId);
  if (!parcel || !building) return;

  const box = new THREE.Box3().setFromObject(building);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const distance = Math.max(maxDim * 2.8, 35);

  animateCameraTo(center, distance);
}

function animateCameraTo(target, distance) {
  const startTarget = state.controls.target.clone();
  const startPosition = state.camera.position.clone();
  const endTarget = target.clone();
  const direction = startPosition.clone().sub(startTarget).normalize();
  if (direction.lengthSq() < 0.001) {
    direction.set(0.35, 0.65, 0.85).normalize();
  }
  const endPosition = endTarget.clone().add(direction.multiplyScalar(distance));

  const start = performance.now();
  const duration = 900;

  function step(now) {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - (1 - t) ** 3;
    state.controls.target.lerpVectors(startTarget, endTarget, eased);
    state.camera.position.lerpVectors(startPosition, endPosition, eased);
    state.controls.update();
    if (t < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

function focusLotSearch(rawValue) {
  const query = String(rawValue).trim();
  if (!query) return;

  const commercialMatch = query.match(/^c(?:u|ommercial)?[\s-]*(\d+)$/i);
  if (commercialMatch) {
    const blockNumber = parseInt(commercialMatch[1], 10);
    const unit = state.commercial.find((entry) => entry.blockNumber === blockNumber);
    if (unit) {
      selectParcel(unit.id, { focus: true });
      return;
    }
    window.alert(`Commercial block ${blockNumber} was not found.`);
    return;
  }

  const number = parseInt(query, 10);
  if (!Number.isFinite(number)) return;

  const lot = state.lots.find((entry) => entry.lotNumber === number);
  if (lot) {
    selectParcel(lot.id, { focus: true });
    return;
  }

  window.alert(`Lot or unit ${query} was not found.`);
}

function resetView() {
  state.controls.target.set(0, 0, 0);
  state.camera.position.set(0, 1400, 900);
  state.controls.update();
  updateZoomLabel();
}

function updateZoomLabel() {
  const distance = state.camera.position.distanceTo(state.controls.target);
  let label = "Neighborhood";
  if (distance > 2000) label = "Aerial overview";
  else if (distance > 900) label = "Community";
  else if (distance > 350) label = "Block";
  else if (distance > 120) label = "Street";
  else label = "Street level";

  els.zoomLabel.textContent = label;
  els.viewHint.classList.toggle("hidden", distance < 200);
}

function toggleFullscreen() {
  const target = document.querySelector(".viewer-shell");
  if (!document.fullscreenElement) {
    target.requestFullscreen?.();
  } else {
    document.exitFullscreen?.();
  }
}

function applyDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const lot = parseInt(params.get("lot") || "", 10);
  if (Number.isFinite(lot)) {
    focusLotSearch(String(lot));
  }
}

function updateDeepLink(lotNumber) {
  const params = new URLSearchParams(window.location.search);
  params.set("lot", String(lotNumber));
  params.set("sheet", state.activeSheetId);
  const next = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({}, "", next);
}

function getAspect() {
  const width = els.canvasHost.clientWidth || 1;
  const height = els.canvasHost.clientHeight || 1;
  return width / height;
}

function onResize() {
  if (!state.renderer || !state.camera) return;
  state.camera.aspect = getAspect();
  state.camera.updateProjectionMatrix();
  state.renderer.setSize(els.canvasHost.clientWidth, els.canvasHost.clientHeight);
}

function animate() {
  state.animationId = requestAnimationFrame(animate);
  state.controls.update();
  state.renderer.render(state.scene, state.camera);
}

function showLoading(isLoading) {
  els.loading.classList.toggle("hidden", !isLoading);
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status}`);
  }
  return response.json();
}

init().catch((error) => {
  showLoading(false);
  els.canvasHost.innerHTML = `<div class="load-error">${error.message}</div>`;
  console.error(error);
});
