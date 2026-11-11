// Thin client for the NOAA EMAG2v3 ArcGIS MapServer REST endpoints.
// Only endpoints whose behavior was checked against the live service are used:
//   GET {service}?f=json        (availability check)
//   GET {service}/legend?f=json (legend swatches as base64 PNG)
//   GET {service}/export        (rendered map image)
//   GET {service}/identify      (pixel values at a point)

import {
  EMAG_DATA_SOURCE_CODE_LAYER_ID,
  EMAG_LAYERS,
  EMAG_SERVICE_URL,
  EMAG_SOURCE_NAME,
  EMAG_PRODUCT_URL,
} from '../data/emag2v3';
import type { LatLon, PointQueryResult } from '../data/types';
import { parseCell } from './emagParse';

const TIMEOUT_MS = 15000;

// Add ?simulateServiceFailure to the page URL to test the unavailable state.
// It points requests at a closed local port so they fail quickly; no fallback data is used.
const SIMULATE_FAILURE =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('simulateServiceFailure');
const SERVICE_URL = SIMULATE_FAILURE ? 'http://127.0.0.1:9/unavailable/MapServer' : EMAG_SERVICE_URL;

async function fetchJson(url: string, outer?: AbortSignal): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const onOuter = () => ctrl.abort();
  outer?.addEventListener('abort', onOuter);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { error?: { message?: string } };
    // ArcGIS reports some failures as HTTP 200 with an { error } body.
    if (body && typeof body === 'object' && 'error' in body && body.error) {
      throw new Error(body.error.message ?? 'Service error');
    }
    return body;
  } finally {
    clearTimeout(t);
    outer?.removeEventListener('abort', onOuter);
  }
}

/** Confirms the service responds and still lists the layers this app expects. */
export async function checkServiceAvailable(): Promise<void> {
  const meta = (await fetchJson(`${SERVICE_URL}?f=json`)) as {
    layers?: { id: number; name: string }[];
  };
  const layers = meta.layers ?? [];
  for (const l of Object.values(EMAG_LAYERS)) {
    const found = layers.find((x) => x.id === l.id);
    if (!found || found.name !== l.serviceName) {
      throw new Error(`Layer ${l.id} ("${l.serviceName}") not found as expected`);
    }
  }
}

/** Returns legend swatch data URLs keyed by layer id. */
export async function fetchLegendImages(): Promise<Record<number, string>> {
  const data = (await fetchJson(`${SERVICE_URL}/legend?f=json`)) as {
    layers?: { layerId: number; legend: { imageData: string; contentType: string }[] }[];
  };
  const out: Record<number, string> = {};
  for (const l of data.layers ?? []) {
    const first = l.legend?.[0];
    if (first) out[l.layerId] = `data:${first.contentType};base64,${first.imageData}`;
  }
  return out;
}

/** Builds an export URL for a Web Mercator view (bbox in EPSG:3857 meters). */
export function exportImageUrl(
  layerId: number,
  bbox3857: [number, number, number, number],
  width: number,
  height: number,
): string {
  const params = new URLSearchParams({
    bbox: bbox3857.join(','),
    bboxSR: '3857',
    imageSR: '3857',
    size: `${Math.round(width)},${Math.round(height)}`,
    format: 'png32',
    transparent: 'true',
    layers: `show:${layerId}`,
    f: 'image',
  });
  return `${SERVICE_URL}/export?${params.toString()}`;
}

/** Queries the grid cell values at a single point. Missing cells come back as null. Pass a signal to cancel. */
export async function identifyAt(p: LatLon, signal?: AbortSignal): Promise<PointQueryResult> {
  const ids = [
    EMAG_LAYERS.upward.id,
    EMAG_LAYERS.sealevel.id,
    EMAG_LAYERS.error.id,
    EMAG_DATA_SOURCE_CODE_LAYER_ID,
  ];
  const d = 0.5;
  const params = new URLSearchParams({
    geometry: `${p.lon},${p.lat}`,
    geometryType: 'esriGeometryPoint',
    sr: '4326',
    layers: `all:${ids.join(',')}`,
    tolerance: '0',
    mapExtent: `${p.lon - d},${p.lat - d},${p.lon + d},${p.lat + d}`,
    imageDisplay: '400,400,96',
    returnGeometry: 'false',
    f: 'json',
  });
  const data = (await fetchJson(`${SERVICE_URL}/identify?${params.toString()}`, signal)) as {
    results?: { layerId: number; attributes: Record<string, string> }[];
  };
  const byId = new Map<number, unknown>();
  for (const r of data.results ?? []) {
    // Attribute key observed as "Stretch.Pixel Value" or "UniqueValue.Pixel Value".
    const key = Object.keys(r.attributes).find((k) => k.endsWith('Pixel Value'));
    byId.set(r.layerId, key ? r.attributes[key] : undefined);
  }
  return {
    location: p,
    queriedAt: new Date().toISOString(),
    dataOrigin: 'verified-public-source',
    sourceName: EMAG_SOURCE_NAME,
    sourceUrl: EMAG_PRODUCT_URL,
    ...parseCell({
      upward: byId.get(EMAG_LAYERS.upward.id),
      sealevel: byId.get(EMAG_LAYERS.sealevel.id),
      error: byId.get(EMAG_LAYERS.error.id),
      code: byId.get(EMAG_DATA_SOURCE_CODE_LAYER_ID),
    }),
  };
}
