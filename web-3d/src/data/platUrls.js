export const PLAT_WEB_ROOT = import.meta.env.DEV ? '/plat-web' : '..';

export function platUrl(relativePath) {
  return `${PLAT_WEB_ROOT}/${relativePath.replace(/^\//, '')}`;
}

export function groundTextureUrl(tileSource) {
  return platUrl(tileSource.replace('.dzi', '_files/14/0_0.jpg'));
}
