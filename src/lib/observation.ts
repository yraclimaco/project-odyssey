// Builds and describes the observation saved with a marked location. Pure: no React or network code.
import type { LatLon, PointQueryResult, SavedObservation } from '../data/types';
import { EMAG_LAYERS, EMAG_PRODUCT_URL, EMAG_SOURCE_NAME, type EmagLayerKey } from '../data/emag2v3.ts';

/** The anomaly layer whose value is shown and saved. The error-estimate map layer shows the 4 km value. */
export const anomalyLayerFor = (shown: EmagLayerKey): 'upward' | 'sealevel' => (shown === 'sealevel' ? 'sealevel' : 'upward');

export interface ObservationInput {
  location: LatLon;
  layer: 'upward' | 'sealevel';
  locationIsDemo: boolean;
  savedAt?: string;
  state:
    | { kind: 'result'; result: PointQueryResult }
    | { kind: 'failed'; reason: string }
    | { kind: 'not-loaded' }
    | { kind: 'pending' };
}

export function buildObservation(i: ObservationInput): SavedObservation {
  const info = EMAG_LAYERS[i.layer];
  const base: SavedObservation = {
    status: 'not-loaded',
    location: { lat: i.location.lat, lon: i.location.lon },
    layer: i.layer,
    layerName: info.serviceName,
    datasetName: EMAG_SOURCE_NAME,
    sourceUrl: EMAG_PRODUCT_URL,
    value: null,
    unit: null,
    referenceElevation: info.referenceElevation,
    errorEstimateNT: null,
    dataSourceCode: null,
    dataSourceName: null,
    notes: [],
    queriedAt: null,
    savedAt: i.savedAt ?? new Date().toISOString(),
    failureReason: null,
    valueOrigin: null,
    locationIsDemo: i.locationIsDemo,
    query: null,
  };
  const s = i.state;
  if (s.kind === 'not-loaded') return base;
  if (s.kind === 'pending') return { ...base, status: 'pending' };
  if (s.kind === 'failed') return { ...base, status: 'failed', failureReason: s.reason };
  const r = s.result;
  const value = i.layer === 'sealevel' ? r.seaLevelNT : r.upwardContinuedNT;
  return {
    ...base,
    status: value === null ? 'no-value' : 'value',
    value,
    unit: value === null ? null : 'nT',
    errorEstimateNT: r.errorEstimateNT,
    dataSourceCode: r.dataSourceCode,
    dataSourceName: r.dataSourceName,
    notes: r.notes ?? [],
    queriedAt: r.queriedAt,
    valueOrigin: 'verified-public-source',
    query: r,
  };
}

/** Short layer name for the UI, e.g. "Anomaly at 4 km altitude". */
export const layerShortName = (layer: 'upward' | 'sealevel') =>
  layer === 'sealevel' ? 'Anomaly at sea level' : 'Anomaly at 4 km altitude';

/** One-line description of a saved observation's main value. Zero is a real value. */
export function observationHeadline(o: SavedObservation | null | undefined): string {
  if (!o) return 'No observation saved (marked in an earlier version)';
  switch (o.status) {
    case 'value': return `${o.value!.toFixed(1)} nT`;
    case 'no-value': return 'No value at this point (source has no data for this cell)';
    case 'failed': return `Could not retrieve${o.failureReason ? ` (${o.failureReason})` : ''}`;
    case 'pending': return 'Request did not finish';
    default: return 'Magnetic map was not loaded when marked';
  }
}

/** A "pending" observation left over after the page closed mid-request is saved as failed. */
export function settleStaleObservation(o: SavedObservation | null | undefined): SavedObservation | null | undefined {
  if (!o || o.status !== 'pending') return o;
  return { ...o, status: 'failed', failureReason: 'The request did not finish before the page closed' };
}
