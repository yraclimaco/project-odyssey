// Geodesic distances on the WGS84 ellipsoid using GeographicLib (Karney's algorithm).
import * as GeographicLib from 'geographiclib-geodesic';
import type { LatLon } from '../data/types';

// The package is CommonJS: bundlers expose named exports, plain Node exposes them on `default`.
type GL = typeof GeographicLib;
const lib: GL = (GeographicLib as GL & { default?: GL }).default ?? GeographicLib;
const geod = lib.Geodesic.WGS84;

export const METERS_PER_NMI = 1852; // international nautical mile (exact definition)

/** Geodesic distance in meters between two points. Identical points return 0. */
export function distanceMeters(a: LatLon, b: LatLon): number {
  const r = geod.Inverse(a.lat, a.lon, b.lat, b.lon);
  return r.s12 ?? 0;
}

/** Total geodesic length in meters of a polyline through the given points. */
export function pathLengthMeters(points: LatLon[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distanceMeters(points[i - 1], points[i]);
  return total;
}

/** Densify a path along geodesics so it can be drawn accurately on a Mercator map. */
export function densifyGeodesic(points: LatLon[], stepMeters = 5000): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const line = geod.InverseLine(a.lat, a.lon, b.lat, b.lon);
    const n = Math.max(1, Math.ceil(line.s13 / stepMeters));
    for (let k = 0; k < n; k++) {
      const p = line.Position((line.s13 * k) / n);
      out.push([p.lat2 ?? a.lat, p.lon2 ?? a.lon]);
    }
  }
  const last = points[points.length - 1];
  if (last) out.push([last.lat, last.lon]);
  return out;
}

export function formatDistance(meters: number): string {
  const nmi = meters / METERS_PER_NMI;
  const km = meters / 1000;
  return `${nmi.toFixed(1)} nmi (${km.toFixed(1)} km)`;
}

export function formatLatLon(p: LatLon): string {
  const ns = p.lat >= 0 ? 'N' : 'S';
  const ew = p.lon >= 0 ? 'E' : 'W';
  return `${Math.abs(p.lat).toFixed(4)}° ${ns}, ${Math.abs(p.lon).toFixed(4)}° ${ew}`;
}

export type DistanceUnit = 'nmi' | 'km';

/** One unit at a time, always to 0.1, so every row of a summary has the same precision.
 * The underlying meters are unchanged. */
export function formatDistanceIn(meters: number, unit: DistanceUnit): string {
  const v = unit === 'nmi' ? meters / METERS_PER_NMI : meters / 1000;
  // Avoid "-0.0" from rounding noise.
  const shown = Math.abs(v) < 0.05 ? 0 : v;
  return `${shown.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${unit}`;
}

export interface RouteDistanceSummary {
  direct: string;
  withStops: string | null;
  /** Difference computed from full-precision meters, then rounded for display. */
  extra: string | null;
  extraMeters: number | null;
}

/** Direct route, route with stops, and extra distance, formatted consistently. */
export function routeDistanceSummary(directMeters: number, withStopsMeters: number | null, unit: DistanceUnit): RouteDistanceSummary {
  if (withStopsMeters === null) return { direct: formatDistanceIn(directMeters, unit), withStops: null, extra: null, extraMeters: null };
  const extraMeters = withStopsMeters - directMeters;
  const extraText = formatDistanceIn(extraMeters, unit);
  return {
    direct: formatDistanceIn(directMeters, unit),
    withStops: formatDistanceIn(withStopsMeters, unit),
    extra: extraText.startsWith('0.0') || extraText.startsWith('-') ? extraText : `+${extraText}`,
    extraMeters,
  };
}
