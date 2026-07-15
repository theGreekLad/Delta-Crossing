const STORAGE_KEY = 'delta-crossings-proforma-overrides';

export function loadOverrides() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    // Legacy fixed $/home sale prices must not be read as $/sqft.
    delete parsed.sf_sale_price;
    delete parsed.townhome_sale_price;
    // Engineering / studies are fixed model constants, not editable assumptions.
    delete parsed.engineering_total;
    delete parsed.studies_total;
    return parsed;
  } catch {
    return {};
  }
}

export function saveOverrides(overrides) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

export function clearOverrides() {
  localStorage.removeItem(STORAGE_KEY);
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
