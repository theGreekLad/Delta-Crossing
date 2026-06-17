(function () {
  const state = {
    manifest: null,
    sheets: {},
    activeSheetId: null,
    viewer: null,
    overlay: null,
    lotGroup: null,
    lots: [],
    selectedLotId: null,
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
    state.selectedLotId = null;
    updateSheetTabs();
    showLoading(true);
    clearInfoPanel();

    if (!state.sheets[sheetId]) {
      const lots = await fetchJson(sheet.lotsFile);
      state.sheets[sheetId] = { sheet, lots };
    }

    state.lots = state.sheets[sheetId].lots;
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

    state.lots.forEach((lot) => {
      const path = document.createElementNS(svgNS, "path");
      path.dataset.lotId = lot.id;
      path.setAttribute("class", "lot-shape");
      path.setAttribute("vector-effect", "non-scaling-stroke");

      const pathData =
        lot.polygon
          .slice(0, -1)
          .map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`)
          .join(" ") + " Z";

      path.setAttribute("d", pathData);
      path.addEventListener("click", (event) => {
        event.stopPropagation();
        selectLot(lot.id, { zoom: false });
      });
      group.appendChild(path);
    });

    overlay.appendChild(group);
    state.viewer.element.appendChild(overlay);
    state.overlay = overlay;
    state.lotGroup = group;
    updateLotSelectionStyles();
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
  }

  function updateLotSelectionStyles() {
    if (!state.lotGroup) return;
    state.lotGroup.querySelectorAll(".lot-shape").forEach((path) => {
      path.classList.toggle("selected", path.dataset.lotId === state.selectedLotId);
    });
  }

  function selectLot(lotId, options = { zoom: true }) {
    const lot = state.lots.find((entry) => entry.id === lotId);
    if (!lot) return;

    state.selectedLotId = lotId;
    updateLotSelectionStyles();
    updateInfoPanel(lot);
    updateDeepLink(lot.lotNumber);

    if (options.zoom) {
      zoomToLot(lot);
    }
  }

  function updateInfoPanel(lot) {
    const sheet = getActiveSheet();
    els.infoEmpty.classList.add("hidden");
    els.infoContent.classList.remove("hidden");
    els.infoTitle.textContent = `Lot ${lot.lotNumber}`;
    els.infoLotNumber.textContent = lot.lotNumber;
    els.infoSheet.textContent = sheet ? sheet.title : state.activeSheetId;
    els.infoCentroid.textContent = `${lot.centroid[0]}, ${lot.centroid[1]}`;
    els.infoBounds.textContent = lot.bounds.join(", ");

    if (lot.rendering) {
      els.renderPlaceholder.innerHTML = `<img src="${lot.rendering}" alt="Lot ${lot.lotNumber} rendering" style="max-width:100%;border-radius:0.6rem;" />`;
    } else {
      els.renderPlaceholder.textContent =
        "3D vertical mock-up rendering will appear here once assets are added for this lot.";
    }
  }

  function clearInfoPanel() {
    els.infoEmpty.classList.remove("hidden");
    els.infoContent.classList.add("hidden");
  }

  function zoomToLot(lot) {
    const [minX, minY, maxX, maxY] = lot.bounds;
    const padding = 40;
    const rect = state.viewer.viewport.imageToViewportRectangle(
      new OpenSeadragon.Rect(minX - padding, minY - padding, maxX - minX + padding * 2, maxY - minY + padding * 2)
    );
    state.viewer.viewport.fitBoundsWithConstraints(rect);
  }

  function focusLotSearch(rawValue) {
    const lotNumber = parseInt(String(rawValue).trim(), 10);
    if (!Number.isFinite(lotNumber)) return;
    const lot = state.lots.find((entry) => entry.lotNumber === lotNumber);
    if (!lot) {
      window.alert(`Lot ${lotNumber} was not found on this sheet.`);
      return;
    }
    selectLot(lot.id, { zoom: true });
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
