// Pure helpers for point checks against the magnetic grid. No React or network code here.
import type { LatLon, PointQueryResult } from '../data/types';

export interface Probe {
  /** Increments for every new request; responses for older ids are ignored. */
  requestId: number;
  location: LatLon;
  status: 'loading' | 'done' | 'error';
  result?: PointQueryResult;
  error?: string;
}

/** Applies a finished request only if it is still the current one, so a slow earlier response
 * can never appear under a newer location. */
export function acceptProbe(current: Probe | null, requestId: number, update: Partial<Probe>): Probe | null {
  if (!current || current.requestId !== requestId) return current;
  return { ...current, ...update };
}

export type ValueState =
  | { kind: 'not-loaded' }
  | { kind: 'area' } // a polygon has no single value; the user must pick a point
  | { kind: 'loading' }
  | { kind: 'value'; value: number; unit: 'nT'; at: LatLon }
  | { kind: 'no-value'; at: LatLon }
  | { kind: 'failed'; message: string };

const same = (a: LatLon, b: LatLon) => a.lat === b.lat && a.lon === b.lon;

/**
 * What to show for the selected point (or area).
 * - `point`: the exact selected point, or null for an area.
 * - `areaProbeAllowed`: for an area, a probe at a point the user chose inside it may be shown,
 *   always labeled with that point, never as an area-wide value.
 */
export function valueState(
  probe: Probe | null,
  point: LatLon | null,
  magneticReady: boolean,
  field: 'upwardContinuedNT' | 'seaLevelNT' | 'errorEstimateNT',
): ValueState {
  if (!magneticReady) return { kind: 'not-loaded' };
  if (point === null && !probe) return { kind: 'area' };
  if (!probe) return { kind: 'loading' };
  if (point !== null && !same(probe.location, point)) return { kind: 'loading' }; // never show another point's value
  if (probe.status === 'loading') return { kind: 'loading' };
  if (probe.status === 'error') return { kind: 'failed', message: probe.error ?? 'Request failed' };
  const v = probe.result?.[field] ?? null;
  return v === null ? { kind: 'no-value', at: probe.location } : { kind: 'value', value: v, unit: 'nT', at: probe.location };
}
