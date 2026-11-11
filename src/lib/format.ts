import type { LatLon } from '../data/types';

/** Short, readable position, e.g. "32.55°N, 117.60°W". Full precision stays in the export. */
export const shortLatLon = (p: LatLon) =>
  `${Math.abs(p.lat).toFixed(2)}°${p.lat >= 0 ? 'N' : 'S'}, ${Math.abs(p.lon).toFixed(2)}°${p.lon >= 0 ? 'E' : 'W'}`;
