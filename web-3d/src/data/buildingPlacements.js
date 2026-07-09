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
