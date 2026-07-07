export const PLAT_WEB_ROOT = import.meta.env.DEV ? '/plat-web' : '..';

export function platUrl(relativePath) {
  return `${PLAT_WEB_ROOT}/${relativePath.replace(/^\//, '')}`;
}

/** Same-origin links between built Vite pages (3d, proforma). */
export function appUrl(relativePath) {
  const clean = relativePath.replace(/^\//, '');
  return import.meta.env.DEV ? `/${clean}` : `./${clean}`;
}

export function groundTextureUrl(tileSource) {
  return platUrl(tileSource.replace('.dzi', '_files/14/0_0.jpg'));
}
