export const PLACEMENT_STORAGE_KEY = 'delta-crossings-building-placements';

/** ±15 degrees */
export const YAW_MAX = (15 * Math.PI) / 180;

/** ±8 feet along local X/Z */
export const NUDGE_MAX = 8;

export const YAW_STEP = (2 * Math.PI) / 180;
export const NUDGE_STEP = 1;

/**
 * @typedef {Object} LotPlacement
 * @property {string} designId
 * @property {number} yawOffset
 * @property {[number, number]} nudge
 */

/**
 * @returns {Record<string, LotPlacement>}
 */
export function loadPlacements() {
  try {
    const raw = localStorage.getItem(PLACEMENT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return Object.fromEntries(
      Object.entries(parsed).map(([lotId, value]) => [lotId, clampPlacement(value)]),
    );
  } catch {
    return {};
  }
}

/**
 * @param {Record<string, LotPlacement>} placements
 */
export function savePlacements(placements) {
  localStorage.setItem(PLACEMENT_STORAGE_KEY, JSON.stringify(placements));
}

/**
 * @param {Partial<LotPlacement> | null | undefined} placement
 * @returns {LotPlacement}
 */
export function clampPlacement(placement) {
  const yawOffset = Math.max(-YAW_MAX, Math.min(YAW_MAX, placement?.yawOffset ?? 0));
  const nudgeX = Math.max(-NUDGE_MAX, Math.min(NUDGE_MAX, placement?.nudge?.[0] ?? 0));
  const nudgeZ = Math.max(-NUDGE_MAX, Math.min(NUDGE_MAX, placement?.nudge?.[1] ?? 0));
  return {
    designId: placement?.designId ?? '',
    yawOffset,
    nudge: [nudgeX, nudgeZ],
  };
}

/**
 * @param {{ center: [number, number], rotation: number }} building
 * @param {LotPlacement} placement
 */
export function computePlacementTransform(building, placement) {
  const rotation = building.rotation + placement.yawOffset;
  const [nudgeX, nudgeZ] = placement.nudge;
  const cos = Math.cos(building.rotation);
  const sin = Math.sin(building.rotation);
  const worldX = nudgeX * cos - nudgeZ * sin;
  const worldZ = nudgeX * sin + nudgeZ * cos;
  return {
    center: [building.center[0] + worldX, building.center[1] + worldZ],
    rotation,
  };
}

/**
 * @param {LotPlacement} placement
 * @param {{ yawDelta?: number, nudgeDelta?: [number, number] }} delta
 * @returns {LotPlacement}
 */
export function adjustPlacement(placement, delta) {
  return clampPlacement({
    designId: placement.designId,
    yawOffset: placement.yawOffset + (delta.yawDelta ?? 0),
    nudge: [
      placement.nudge[0] + (delta.nudgeDelta?.[0] ?? 0),
      placement.nudge[1] + (delta.nudgeDelta?.[1] ?? 0),
    ],
  });
}

/**
 * Deterministic pick so the same lot gets a stable "random" design across reloads
 * until the user changes it.
 * @param {string} lotId
 * @param {number} optionCount
 */
function seededIndex(lotId, optionCount) {
  if (optionCount <= 0) return 0;
  let hash = 0;
  for (let i = 0; i < lotId.length; i += 1) {
    hash = (hash * 31 + lotId.charCodeAt(i)) >>> 0;
  }
  return hash % optionCount;
}

/**
 * Ensure every residential lot has a placement from the matching catalog.
 * Keeps existing placements when the design still matches the lot type.
 *
 * @param {Array<{ id: string, type?: string }>} lots
 * @param {Record<string, LotPlacement>} existing
 * @param {(lot: { id: string, type?: string }) => Array<{ id: string, category: string }>} getCatalogForLot
 * @param {(designId: string) => { category?: string } | undefined} getDesignById
 * @returns {Record<string, LotPlacement>}
 */
export function seedRandomPlacements(lots, existing, getCatalogForLot, getDesignById) {
  const next = { ...existing };
  let changed = false;

  for (const lot of lots) {
    if (lot.type === 'commercial') {
      if (next[lot.id]) {
        delete next[lot.id];
        changed = true;
      }
      continue;
    }

    const catalog = getCatalogForLot(lot);
    if (!catalog.length) continue;

    const current = next[lot.id];
    const currentDesign = current?.designId ? getDesignById(current.designId) : null;
    const stillValid =
      currentDesign && catalog.some((design) => design.id === current.designId);

    if (stillValid) continue;

    const pick = catalog[seededIndex(lot.id, catalog.length)];
    next[lot.id] = clampPlacement({
      designId: pick.id,
      yawOffset: 0,
      nudge: [0, 0],
    });
    changed = true;
  }

  return changed ? next : existing;
}
