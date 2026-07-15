const STORAGE_KEY = 'delta-crossings-proforma-overrides';
/** Query param used for shareable assumption scenarios. */
export const SCENARIO_PARAM = 'scenario';

function sanitizeOverrides(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const next = { ...parsed };
  // Legacy fixed $/home sale prices must not be read as $/sqft.
  delete next.sf_sale_price;
  delete next.townhome_sale_price;
  // Engineering / studies are fixed model constants, not editable assumptions.
  delete next.engineering_total;
  delete next.studies_total;
  const cleaned = {};
  for (const [id, value] of Object.entries(next)) {
    const num = Number(value);
    if (!Number.isFinite(num)) continue;
    cleaned[id] = num;
  }
  return cleaned;
}

export function loadOverrides() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return sanitizeOverrides(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function saveOverrides(overrides) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeOverrides(overrides)));
}

export function clearOverrides() {
  localStorage.removeItem(STORAGE_KEY);
}

function bytesToBase64Url(bytes) {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(encoded) {
  const padded = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (padded.length % 4)) % 4;
  const base64 = padded + '='.repeat(padLength);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Encode assumption overrides into a URL-safe scenario token. */
export function encodeScenario(overrides) {
  const cleaned = sanitizeOverrides(overrides);
  const json = JSON.stringify(cleaned);
  return bytesToBase64Url(new TextEncoder().encode(json));
}

/** Decode a scenario token back into assumption overrides. */
export function decodeScenario(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const json = new TextDecoder().decode(base64UrlToBytes(token.trim()));
    return sanitizeOverrides(JSON.parse(json));
  } catch {
    return null;
  }
}

/** Read `?scenario=` from a URL / search string. Returns null if absent or invalid. */
export function readScenarioFromSearch(search = typeof window !== 'undefined' ? window.location.search : '') {
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  const token = params.get(SCENARIO_PARAM);
  if (!token) return null;
  return decodeScenario(token);
}

/**
 * Apply a shared scenario from the current URL once.
 * Returns the applied overrides, or null if the URL has no scenario param.
 */
export function applyScenarioFromUrl() {
  if (typeof window === 'undefined') return null;
  const fromUrl = readScenarioFromSearch(window.location.search);
  if (fromUrl == null) return null;
  saveOverrides(fromUrl);
  return fromUrl;
}

/** Build a shareable URL for the given overrides (defaults to current page URL). */
export function buildScenarioShareUrl(overrides = loadOverrides(), href = typeof window !== 'undefined' ? window.location.href : '') {
  const url = new URL(href, typeof window !== 'undefined' ? window.location.origin : 'https://example.com');
  url.searchParams.set(SCENARIO_PARAM, encodeScenario(overrides));
  return url.toString();
}

/** Drop the scenario query param from the address bar without reloading. */
export function clearScenarioFromUrl() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has(SCENARIO_PARAM)) return;
  url.searchParams.delete(SCENARIO_PARAM);
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

export function mergeAssumptions(defaults, overrides = loadOverrides()) {
  return {
    ...defaults,
    assumptions: defaults.assumptions.map((entry) => ({
      ...entry,
      value: overrides[entry.id] ?? entry.value,
    })),
  };
}

export function getAssumptionMap(mergedDefaults) {
  const map = {};
  mergedDefaults.assumptions.forEach((entry) => {
    map[entry.id] = Number(entry.value);
  });
  return map;
}

export function setOverride(id, value) {
  const overrides = loadOverrides();
  if (value === '' || value == null || Number.isNaN(Number(value))) {
    delete overrides[id];
  } else {
    overrides[id] = Number(value);
  }
  saveOverrides(overrides);
  return overrides;
}

export function formatCurrency(value, digits = 0) {
  if (value == null || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

export function formatNumber(value, digits = 0) {
  if (value == null || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

export function isRatioUnit(unit) {
  return unit === 'ratio' || (typeof unit === 'string' && unit.startsWith('ratio/'));
}

export function formatPct(value, digits = 1) {
  if (value == null || Number.isNaN(value)) return '—';
  return `${(value * 100).toFixed(digits)}%`;
}
