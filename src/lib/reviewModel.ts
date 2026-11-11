// Builds the human-readable planning review from application state. Pure: no DOM, no network.
// Every value here comes from app state; user-entered text is passed through as plain strings and
// is rendered by React as text (never as HTML).

import type { Geometry } from 'geojson';
import type { CandidateArea, DataMode, LatLon, PointQueryResult, RouteStop, SavedObservation } from '../data/types';
import {
  EMAG_DOI_URL,
  EMAG_ERROR_MEANING,
  EMAG_GRID_SPACING,
  EMAG_GRID_SPACING_NOTE,
  EMAG_LATEST_GRID_FILE,
  EMAG_LAYERS,
  EMAG_PRODUCT_URL,
  EMAG_README_URL,
  EMAG_SOURCE_NAME,
  EMAG_VERSION,
  type EmagLayerKey,
} from '../data/emag2v3.ts';
import { routeDistanceSummary, type DistanceUnit } from './geodesy.ts';
import { shortLatLon } from './format.ts';
import { pointInPolygon } from './geometry.ts';
import { layerShortName, observationHeadline } from './observation.ts';

export const REVIEW_LIMITATIONS = [
  'Marked locations have not been validated for navigation.',
  'Route sketches do not check obstacles or vehicle constraints.',
  'A point value describes one grid cell. It is not an assessment of the surrounding area.',
  'Magnetic values are referenced to 4 km altitude or to sea level. Suitability at mission depth has not been assessed.',
  'Grid spacing is not positional accuracy, and the source error estimate describes the map, not vehicle position.',
];

/** Questions this tool does not answer. Always "Not assessed": no answers are generated. */
export const FURTHER_CHECKS = [
  { label: 'Suitability at mission depth', status: 'Not assessed' },
  { label: 'Vehicle sensor compatibility', status: 'Not assessed' },
  { label: 'Whether the location could support a useful position update', status: 'Not assessed' },
];

export interface ReviewModelInput {
  createdAt: Date;
  dataMode: DataMode;
  magneticReady: boolean;
  activeLayer: EmagLayerKey | null;
  start: LatLon | null;
  destination: LatLon | null;
  waypoints: RouteStop[];
  referenceMeters: number | null;
  alternativeMeters: number | null;
  unit: DistanceUnit;
  routeOrigin: 'user' | 'illustrative';
  routeNote: string;
  candidates: CandidateArea[];
  markedIds: string[];
  pointQueries: PointQueryResult[];
  /** Demo areas visible on the map when the review was opened. */
  showDemoAreas?: boolean;
  /** True for the temporary "Open example" review. */
  isExample?: boolean;
}

export interface PointCheck {
  at: string;
  queriedAt: string;
  upward: string;
  seaLevel: string;
  error: string;
  sourceCode: string;
  notes: string[];
}

export interface ObservationView {
  status: SavedObservation['status'] | 'missing';
  headline: string;
  layer: string;
  dataset: string;
  reference: string;
  error: string;
  sourceId: string;
  at: string;
  queriedAt: string | null;
  savedAt: string | null;
  notes: string[];
}

export interface ReviewLocation {
  id: string;
  name: string;
  kind: 'Your location' | 'Demo area (fictional)' | 'Example location (illustrative)';
  isDemo: boolean;
  isArea: boolean;
  where: string;
  why: string; // user-entered, may be empty
  /** Free text from the older "What still needs checking?" field, if any. */
  legacyQuestions: string;
  linkedStops: string[];
  /** Saved observation for a point location; null for areas. */
  observation: ObservationView | null;
  /** Point checks inside an area (point values, never area values). */
  pointChecks: PointCheck[];
  stillToCheck: { label: string; status: string }[];
  geometry: Geometry;
}

const nt = (v: number | null) => (v === null ? 'No value at this point' : `${v.toFixed(1)} nT`);

function toCheck(q: PointQueryResult): PointCheck {
  return {
    at: shortLatLon(q.location),
    queriedAt: q.queriedAt,
    upward: nt(q.upwardContinuedNT),
    seaLevel: nt(q.seaLevelNT),
    error: q.errorEstimateNT === null ? 'Not provided by source at this point' : `${q.errorEstimateNT.toFixed(1)} nT`,
    sourceCode:
      q.dataSourceCode === null ? 'Not provided by source' : `${q.dataSourceCode}${q.dataSourceName ? ` (${q.dataSourceName})` : ''}`,
    notes: q.notes ?? [],
  };
}

export function observationView(o: SavedObservation | null | undefined, at: LatLon): ObservationView {
  if (!o) {
    return {
      status: 'missing',
      headline: observationHeadline(o),
      layer: '—',
      dataset: EMAG_SOURCE_NAME,
      reference: '—',
      error: 'Not recorded',
      sourceId: 'Not recorded',
      at: shortLatLon(at),
      queriedAt: null,
      savedAt: null,
      notes: [],
    };
  }
  const answered = o.status === 'value' || o.status === 'no-value';
  return {
    status: o.status,
    headline: observationHeadline(o),
    layer: layerShortName(o.layer),
    dataset: o.datasetName,
    reference: o.referenceElevation,
    error: !answered
      ? 'Not retrieved'
      : o.errorEstimateNT === null
        ? 'Not provided by source at this point'
        : `${o.errorEstimateNT.toFixed(1)} nT (map error, not position error)`,
    sourceId: !answered
      ? 'Not retrieved'
      : o.dataSourceCode === null
        ? 'Not provided by source'
        : `${o.dataSourceCode}${o.dataSourceName ? ` (${o.dataSourceName})` : ''}`,
    at: shortLatLon(o.location),
    queriedAt: o.queriedAt,
    savedAt: o.savedAt,
    notes: o.notes ?? [],
  };
}

function extent(c: CandidateArea): string {
  if (c.geometry.type === 'Point') {
    const [lon, lat] = c.geometry.coordinates;
    return `${lat.toFixed(4)}°, ${lon.toFixed(4)}° (${shortLatLon({ lat, lon })})`;
  }
  const ring = c.geometry.coordinates[0];
  const lats = ring.map((q) => q[1]);
  const lons = ring.map((q) => q[0]);
  const fmt = (a: number, pos: string, neg: string) => `${Math.abs(a).toFixed(2)}°${a >= 0 ? pos : neg}`;
  return `Area within ${fmt(Math.min(...lats), 'N', 'S')}–${fmt(Math.max(...lats), 'N', 'S')}, ${fmt(Math.min(...lons), 'E', 'W')}–${fmt(Math.max(...lons), 'E', 'W')} (${ring.length - 1}-point outline)`;
}

/** Which point checks belong to a location: exact point match, or a point inside an area's outline. */
export function checksFor(c: CandidateArea, queries: PointQueryResult[]): PointQueryResult[] {
  if (c.geometry.type === 'Point') {
    const [lon, lat] = c.geometry.coordinates;
    return queries.filter((q) => q.location.lat === lat && q.location.lon === lon);
  }
  const poly = c.geometry;
  return queries.filter((q) => pointInPolygon(q.location, poly));
}

export const isMarkedCandidate = (c: CandidateArea, markedIds: string[]) => c.dataOrigin === 'user' || markedIds.includes(c.id);

const kindOf = (c: CandidateArea): ReviewLocation['kind'] =>
  c.dataOrigin === 'user' ? 'Your location' : c.example ? 'Example location (illustrative)' : 'Demo area (fictional)';

export function buildReviewModel(i: ReviewModelInput) {
  const marked = i.candidates.filter((c) => isMarkedCandidate(c, i.markedIds));
  const stopLabel = (n: number) => `Stop ${n + 1}`;

  const locations: ReviewLocation[] = marked.map((c) => {
    const isArea = c.geometry.type === 'Polygon';
    const pointAt = c.geometry.type === 'Point' ? { lat: c.geometry.coordinates[1], lon: c.geometry.coordinates[0] } : null;
    return {
      id: c.id,
      name: c.label,
      kind: kindOf(c),
      isDemo: c.dataOrigin === 'illustrative',
      isArea,
      where: extent(c),
      why: c.reviewerNote.trim(),
      legacyQuestions: (c.reviewQuestions ?? '').trim(),
      linkedStops: i.waypoints.map((w, n) => (w.areaId === c.id ? stopLabel(n) : null)).filter((x): x is string => !!x),
      observation: pointAt ? observationView(c.observation, pointAt) : null,
      pointChecks: isArea ? checksFor(c, i.pointQueries).map(toCheck) : [],
      stillToCheck: FURTHER_CHECKS,
      geometry: c.geometry,
    };
  });

  const linkedKeys = new Set(
    marked.flatMap((c) => (c.geometry.type === 'Polygon' ? checksFor(c, i.pointQueries) : [])).map((q) => q.queriedAt + q.location.lat + q.location.lon),
  );
  const observationKeys = new Set(
    marked.map((c) => c.observation?.query).filter((q): q is PointQueryResult => !!q).map((q) => q.queriedAt + q.location.lat + q.location.lon),
  );
  const otherPointCount = i.pointQueries.filter((q) => {
    const k = q.queriedAt + q.location.lat + q.location.lon;
    return !linkedKeys.has(k) && !observationKeys.has(k);
  }).length;

  const hasRoute = !!(i.start && i.destination);
  const demoAreaIds = new Set(i.candidates.filter((c) => c.dataOrigin === 'illustrative').map((c) => c.id));
  const containsDemo =
    !!i.isExample ||
    i.routeOrigin === 'illustrative' ||
    marked.some((c) => c.dataOrigin === 'illustrative') ||
    i.waypoints.some((w) => w.areaId && demoAreaIds.has(w.areaId));

  const dist = hasRoute ? routeDistanceSummary(i.referenceMeters!, i.alternativeMeters, i.unit) : null;
  const route = hasRoute
    ? {
        start: shortLatLon(i.start!),
        destination: shortLatLon(i.destination!),
        pointsAreDemo: i.routeOrigin === 'illustrative',
        stops: i.waypoints.map((w, n) => {
          const loc = w.areaId ? i.candidates.find((c) => c.id === w.areaId) : undefined;
          const link = loc
            ? `${loc.geometry.type === 'Polygon' ? 'inside' : 'at'} ${loc.label}${loc.dataOrigin === 'illustrative' ? (loc.example ? ' (example)' : ' (demo)') : ''}`
            : null;
          return { label: stopLabel(n), at: shortLatLon(w), link };
        }),
        unit: i.unit === 'nmi' ? 'nautical miles (nmi)' : 'kilometres (km)',
        direct: dist!.direct,
        withStops: dist!.withStops ?? 'No stops added',
        extra: dist!.extra ?? 'Not applicable',
        note: i.routeNote.trim(),
      }
    : null;

  const layer = i.activeLayer ? EMAG_LAYERS[i.activeLayer] : null;
  const queryTimes = [
    ...locations.flatMap((l) => (l.observation?.queriedAt ? [{ what: l.name, at: l.observation.queriedAt }] : [])),
    ...locations.flatMap((l) => l.pointChecks.map((c) => ({ what: `${l.name}, point ${c.at}`, at: c.queriedAt }))),
  ];

  const data = {
    magnetic: {
      source: EMAG_SOURCE_NAME,
      sourceUrl: EMAG_PRODUCT_URL,
      doi: EMAG_DOI_URL,
      formatFile: EMAG_README_URL,
      version: EMAG_VERSION,
      gridFile: `${EMAG_LATEST_GRID_FILE}. The map service does not state which grid file it serves.`,
      gridSpacing: `${EMAG_GRID_SPACING}. ${EMAG_GRID_SPACING_NOTE}`,
      layerShown: layer ? `${layer.serviceName} (${layer.unit}, reference: ${layer.referenceElevation})` : 'Magnetic layer not shown',
      errorMeaning: EMAG_ERROR_MEANING,
      surveyDate: 'Not provided by source',
    },
    magneticStatus: i.magneticReady ? 'Loaded' : i.dataMode === 'public' ? 'Could not load magnetic data' : 'Not loaded in this session',
    basemap: 'Land outlines: Natural Earth 1:50m',
    queryTimes,
    otherPointCount,
  };

  const visibleAreas = i.showDemoAreas
    ? i.candidates.filter((c) => c.dataOrigin === 'illustrative' && !c.example && !isMarkedCandidate(c, i.markedIds))
    : [];

  return {
    project: 'Project Odyssey',
    title: i.isExample ? 'Planning review (example)' : 'Planning review',
    createdAt: i.createdAt,
    isExample: !!i.isExample,
    containsDemo,
    demoNotice: i.isExample
      ? 'Example review. The route, review location, and note are illustrative. Any magnetic value shown was returned by NOAA for that point; it does not make the example point a validated navigation opportunity.'
      : containsDemo
        ? 'Contains demo content. Demo areas and example points are fictional and are not verified navigation checkpoints.'
        : null,
    route,
    locations,
    data,
    map: {
      start: i.start,
      destination: i.destination,
      waypoints: i.waypoints,
      locations: locations.map((l) => ({ id: l.id, name: l.name, geometry: l.geometry, isDemo: l.isDemo })),
      areas: visibleAreas.map((c) => ({ id: c.id, name: c.label, geometry: c.geometry })),
      magneticLayer: i.magneticReady && i.activeLayer ? i.activeLayer : null,
    },
    furtherChecks: FURTHER_CHECKS,
    limitations: REVIEW_LIMITATIONS,
  };
}

export type ReviewModel = ReturnType<typeof buildReviewModel>;
