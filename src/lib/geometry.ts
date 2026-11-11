import type { Polygon } from 'geojson';
import type { LatLon } from '../data/types';

/** Ray-casting test on the polygon's outer ring (lon/lat treated as planar; fine for small areas). */
export function pointInPolygon(p: LatLon, poly: Polygon): boolean {
  const ring = poly.coordinates[0];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p.lat !== yj > p.lat && p.lon < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
