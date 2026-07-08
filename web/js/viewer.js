(function () {
  const state = {
    manifest: null,
    sheets: {},
    activeSheetId: null,
    viewer: null,
    overlay: null,
    lotGroup: null,
    lots: [],
    commercial: [],
    selectedParcelId: null,
  };

  const els = {
    viewer: document.getElementById("viewer"),
    loading: document.getElementById("loading"),
    sheetTabs: document.getElementById("sheet-tabs"),
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
  };

  async function init() {
    bindControls();
    const manifest = await fetchJson("data/manifest.json");
    state.manifest = manifest;
    buildSheetTabs(manifest.sheets);
    await loadSheet(manifest.sheets[0].id);
  }

  function bindControls() {
    document.getElementById("btn-zoom-in").addEventListener("click", () => {
      if (state.viewer) state.viewer.viewport.zoomBy(1.4);
    });
    document.getElementById("btn-zoom-out").addEventListener("click", () => {
      if (state.viewer) state.viewer.viewport.zoomBy(0.7);
    });
    document.getElementById("btn-reset").addEventListener("click", resetView);
    document.getElementById("btn-rotate-left").addEventListener("click", () => rotateBy(-90));
    document.getElementById("btn-rotate-right").addEventListener("click", () => rotateBy(90));
    document.getElementById("btn-fullscreen").addEventListener("click", toggleFullscreen);
    els.lotSearch.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        focusLotSearch(els.lotSearch.value);
      }
    });
  }

  function buildSheetTabs(sheets) {
    els.sheetTabs.innerHTML = "";
    sheets.forEach((sheet) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "sheet-tab";
      button.textContent = sheet.title;
      button.dataset.sheetId = sheet.id;
      button.setAttribute("role", "tab");
      button.addEventListener("click", () => loadSheet(sheet.id));
      els.sheetTabs.appendChild(button);
    });
  }

  async function loadSheet(sheetId) {
    const sheet = state.manifest.sheets.find((entry) => entry.id === sheetId);
    if (!sheet) return;

    state.activeSheetId = sheetId;
    state.selectedParcelId = null;
    updateSheetTabs();
    showLoading(true);
    clearInfoPanel();

    if (!state.sheets[sheetId]) {
      const lots = await fetchJson(sheet.lotsFile);
      const commercial = sheet.commercialFile ? await fetchJson(sheet.commercialFile) : [];
      state.sheets[sheetId] = { sheet, lots, commercial };
    }

    state.lots = state.sheets[sheetId].lots;
    state.commercial = state.sheets[sheetId].commercial;
    destroyViewer();
    state.viewer = OpenSeadragon({
      element: els.viewer,
      prefixUrl: "",
      tileSources: sheet.tileSource,
      showNavigationControl: false,
      showZoomControl: false,
      showHomeControl: false,
      showFullPageControl: false,
      animationTime: 0.8,
      springStiffness: 8,
      maxZoomPixelRatio: 3,
      gestureSettingsMouse: { clickToZoom: false, dblClickToZoom: true },
      gestureSettingsTouch: { pinchRotate: true },
    });

    state.viewer.addHandler("open", () => {
      state.viewer.viewport.goHome(false);
      mountLotOverlay();
      updateOverlayTransform();
      showLoading(false);
      applyDeepLink();
    });

    state.viewer.addHandler("animation", updateOverlayTransform);
    state.viewer.addHandler("resize", updateOverlayTransform);
    state.viewer.addHandler("rotate", updateOverlayTransform);
  }

  function getActiveSheet() {
    return state.manifest.sheets.find((entry) => entry.id === state.activeSheetId);
  }

  function updateSheetTabs() {
    [...els.sheetTabs.querySelectorAll(".sheet-tab")].forEach((button) => {
      button.classList.toggle("active", button.dataset.sheetId === state.activeSheetId);
      button.setAttribute("aria-selected", button.classList.contains("active") ? "true" : "false");
    });
  }

  function destroyViewer() {
    if (state.viewer) {
      state.viewer.destroy();
      state.viewer = null;
    }
    state.overlay = null;
    state.lotGroup = null;
    state.commercialGroup = null;
  }

  function polygonToPathData(polygon) {
    return (
      polygon
        .slice(0, -1)
        .map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`)
        .join(" ") + " Z"
    );
  }

  function mountParcelPaths(group, parcels, className) {
    const svgNS = "http://www.w3.org/2000/svg";

    parcels.forEach((parcel) => {
      const path = document.createElementNS(svgNS, "path");
      path.dataset.parcelId = parcel.id;
      path.setAttribute("class", className);
      path.setAttribute("vector-effect", "non-scaling-stroke");
      path.setAttribute("d", polygonToPathData(parcel.polygon));
      path.addEventListener("click", (event) => {
        event.stopPropagation();
        selectParcel(parcel.id, { zoom: false });
      });
      group.appendChild(path);
    });
  }

  function mountLotOverlay() {
    if (!state.viewer) return;

    if (state.overlay?.parentElement) {
      state.overlay.remove();
    }

    const svgNS = "http://www.w3.org/2000/svg";
    const overlay = document.createElementNS(svgNS, "svg");
    overlay.setAttribute("id", "lot-overlay");
    overlay.setAttribute("class", "lot-overlay");
    overlay.setAttribute("aria-hidden", "true");

    const group = document.createElementNS(svgNS, "g");
    group.setAttribute("id", "lot-shapes");
    mountParcelPaths(group, state.lots, "lot-shape");

    const commercialGroup = document.createElementNS(svgNS, "g");
    commercialGroup.setAttribute("id", "commercial-shapes");
    mountParcelPaths(commercialGroup, state.commercial, "commercial-shape");

    overlay.appendChild(group);
    overlay.appendChild(commercialGroup);
    state.viewer.element.appendChild(overlay);
    state.overlay = overlay;
    state.lotGroup = group;
    state.commercialGroup = commercialGroup;
    updateSelectionStyles();
  }

  function updateOverlayTransform() {
    if (!state.viewer?.isOpen() || !state.lotGroup) return;

    const sheet = getActiveSheet();
    if (!sheet) return;

    const width = sheet.pixelWidth;
    const height = sheet.pixelHeight;
    const viewport = state.viewer.viewport;
    const topLeft = viewport.imageToViewerElementCoordinates(new OpenSeadragon.Point(0, 0));
    const topRight = viewport.imageToViewerElementCoordinates(new OpenSeadragon.Point(width, 0));
    const bottomLeft = viewport.imageToViewerElementCoordinates(new OpenSeadragon.Point(0, height));

    const matrix = [
      (topRight.x - topLeft.x) / width,
      (topRight.y - topLeft.y) / width,
      (bottomLeft.x - topLeft.x) / height,
      (bottomLeft.y - topLeft.y) / height,
      topLeft.x,
      topLeft.y,
    ];

    state.lotGroup.setAttribute("transform", `matrix(${matrix.join(" ")})`);
    if (state.commercialGroup) {
      state.commercialGroup.setAttribute("transform", `matrix(${matrix.join(" ")})`);
    }
  }

  function updateSelectionStyles() {
    [state.lotGroup, state.commercialGroup].forEach((group) => {
      if (!group) return;
      group.querySelectorAll("path").forEach((path) => {
        path.classList.toggle("selected", path.dataset.parcelId === state.selectedParcelId);
      });
    });
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

  function getParcelSearchLabel(parcel) {
    if (parcel.type === "commercial") {
      return `Commercial Units ${parcel.blockNumber}`;
    }
    return `Lot ${parcel.lotNumber}`;
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

  function selectParcel(parcelId, options = { zoom: true }) {
    const parcel = findParcel(parcelId);
    if (!parcel) return;

    state.selectedParcelId = parcelId;
    updateSelectionStyles();
    updateInfoPanel(parcel);
    updateDeepLink(getParcelNumber(parcel));

    if (options.zoom) {
      zoomToParcel(parcel);
    }
  }

  function updateInfoPanel(parcel) {
    const sheet = getActiveSheet();
    const isCommercial = parcel.type === "commercial";
    els.infoEmpty.classList.add("hidden");
    els.infoContent.classList.remove("hidden");
    els.infoTitle.textContent = isCommercial
      ? `${parcel.label} ${parcel.blockNumber}`
      : `Lot ${parcel.lotNumber}`;
    els.infoLotNumber.textContent = isCommercial
      ? `Block ${parcel.blockNumber}`
      : parcel.lotNumber;
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
      els.renderPlaceholder.textContent = isCommercial
        ? "Commercial unit details and renderings can be added here later."
        : "3D vertical mock-up rendering will appear here once assets are added for this lot.";
    }
  }

  function clearInfoPanel() {
    els.infoEmpty.classList.remove("hidden");
    els.infoContent.classList.add("hidden");
  }

  function zoomToParcel(parcel) {
    const [minX, minY, maxX, maxY] = parcel.bounds;
    const padding = 40;
    const rect = state.viewer.viewport.imageToViewportRectangle(
      new OpenSeadragon.Rect(minX - padding, minY - padding, maxX - minX + padding * 2, maxY - minY + padding * 2)
    );
    state.viewer.viewport.fitBoundsWithConstraints(rect);
  }

  function focusLotSearch(rawValue) {
    const query = String(rawValue).trim();
    if (!query) return;

    const commercialMatch = query.match(/^c(?:u|ommercial)?[\s-]*(\d+)$/i);
    if (commercialMatch) {
      const blockNumber = parseInt(commercialMatch[1], 10);
      const unit = state.commercial.find((entry) => entry.blockNumber === blockNumber);
      if (unit) {
        selectParcel(unit.id, { zoom: true });
        return;
      }
      window.alert(`Commercial block ${blockNumber} was not found on this sheet.`);
      return;
    }

    const number = parseInt(query, 10);
    if (!Number.isFinite(number)) return;

    const lot = state.lots.find((entry) => entry.lotNumber === number);
    if (lot) {
      selectParcel(lot.id, { zoom: true });
      return;
    }

    window.alert(`Lot or unit ${query} was not found on this sheet.`);
  }

  function resetView() {
    if (!state.viewer) return;
    state.viewer.viewport.setRotation(0);
    state.viewer.viewport.goHome(false);
    updateOverlayTransform();
  }

  function rotateBy(degrees) {
    if (!state.viewer) return;
    state.viewer.viewport.setRotation(state.viewer.viewport.getRotation() + degrees);
    updateOverlayTransform();
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
    const sheet = params.get("sheet");
    if (sheet && sheet !== state.activeSheetId && state.manifest.sheets.some((entry) => entry.id === sheet)) {
      loadSheet(sheet).then(() => {
        if (Number.isFinite(lot)) focusLotSearch(String(lot));
      });
      return;
    }
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
    const link3d = document.getElementById("link-3d");
    if (link3d) {
      link3d.href = `3d/index.html?${params.toString()}`;
    }
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
    els.viewer.innerHTML = `<div style="padding:2rem;color:#842029;">${error.message}</div>`;
    console.error(error);
  });
})();
