// Builds the "Planning review only" export. This is a plain JSON record for people to read
// and discuss. It is not a mission file and is not formatted for any vehicle or Navy tool.

import type { CandidateArea, DataMode, LatLon, PointQueryResult, RouteStop } from '../data/types';
import {
  EMAG_DOI_URL,
  EMAG_LAYERS,
  EMAG_PRODUCT_URL,
  EMAG_RESOLUTION,
  EMAG_SERVICE_URL,
  EMAG_SOURCE_NAME,
  type EmagLayerKey,
} from '../data/emag2v3.ts';
import { METERS_PER_NMI } from './geodesy.ts';
import { EMAG_ERROR_MEANING, EMAG_GRID_SPACING, EMAG_GRID_SPACING_NOTE, EMAG_LATEST_GRID_FILE, EMAG_README_URL, EMAG_VERSION } from '../data/emag2v3.ts';
import { checksFor, FURTHER_CHECKS, REVIEW_LIMITATIONS } from './reviewModel.ts';

export const UNRESOLVED_ASSUMPTIONS = [
  'Route sketches are straight geodesic segments; they may cross land, restricted areas, or other constraints and are not feasible-route recommendations.',
  'No assessment has been made of whether any marked area can support magnetic navigation. Navigation usefulness: not validated.',
  'Map resolution, magnetic map error, and vehicle position error are different quantities; none of them is a vehicle navigation accuracy.',
  'Illustrative candidate areas are demonstration annotations and do not represent real magnetic navigation opportunities.',
  'No arrival time, energy use, drift, position improvement, or mission success estimates are made by this tool.',
  'Depth/altitude of the vehicle relative to the magnetic map reference elevation has not been considered.',
];

export interface ReviewInputs {
  dataMode: DataMode;
  publicServiceStatus: 'not-requested' | 'loading' | 'available' | 'unavailable';
  activeMagneticLayer: EmagLayerKey | null;
  start: LatLon | null;
  destination: LatLon | null;
  waypoints: RouteStop[];
  demoAreasVisible: boolean;
  /** Ids the reviewer marked for review (user locations are always marked). */
  markedIds?: string[];
  routeOrigin: 'user' | 'illustrative';
  referenceMeters: number | null;
  alternativeMeters: number | null;
  routeEvaluationReason: string;
  candidates: CandidateArea[];
  pointQueries: PointQueryResult[];
  /** User-entered: what the reviewer is asked to assess. */
  reviewPurpose?: string;
  /** True for the temporary "Open example" review. */
  isExample?: boolean;
}

const m = (v: number | null) =>
  v === null ? null : { meters: Math.round(v), kilometres: +(v / 1000).toFixed(2), nauticalMiles: +(v / METERS_PER_NMI).toFixed(2) };

export function buildReview(i: ReviewInputs) {
  const usingPublic = i.dataMode === 'public' && i.publicServiceStatus === 'available';
  return {
    label: 'Planning review only',
    disclaimer:
      'Pre-mission planning discussion record. Not a mission plan, not a navigation product, and not formatted for any vehicle or existing mission-planning tool.',
    generatedAt: new Date().toISOString(),
    tool: 'Project Odyssey pre-mission planning map (UC San Diego student prototype)',
    exampleReview: i.isExample
      ? 'Example review. Route, review location, and note are illustrative. Magnetic values, if present, were returned by NOAA for that point.'
      : null,
    reviewPurpose: {
      text: (i.reviewPurpose ?? '').trim() || null,
      status: (i.reviewPurpose ?? '').trim() ? 'Entered by the reviewer; not verified.' : 'Purpose not entered.',
    },
    dataStatus: usingPublic
      ? 'Magnetic data loaded (NOAA EMAG2v3)'
      : i.dataMode === 'public'
        ? `Couldn't load magnetic data (service status: ${i.publicServiceStatus})`
        : 'Demo data only (no magnetic data loaded)',
    demoAreas: {
      visibleWhenSaved: i.demoAreasVisible,
      note: 'Demo areas are illustrative, not verified navigation checkpoints.',
    },
    dataSources: [
      {
        layer: 'Basemap land outlines',
        dataOrigin: 'verified-public-source',
        sourceName: 'Natural Earth 1:50m land (via world-atlas npm package)',
        sourceUrl: 'https://www.naturalearthdata.com/',
      },
      usingPublic && i.activeMagneticLayer
        ? {
            layer: EMAG_LAYERS[i.activeMagneticLayer].serviceName,
            dataOrigin: 'verified-public-source',
            sourceName: EMAG_SOURCE_NAME,
            sourceUrl: EMAG_PRODUCT_URL,
            serviceUrl: EMAG_SERVICE_URL,
            doi: EMAG_DOI_URL,
            resolution: EMAG_RESOLUTION,
            version: EMAG_VERSION,
            gridFile: EMAG_LATEST_GRID_FILE,
            gridFileNote: 'The map service does not state which grid file it serves.',
            gridSpacing: EMAG_GRID_SPACING,
            gridSpacingNote: EMAG_GRID_SPACING_NOTE,
            errorEstimateMeaning: EMAG_ERROR_MEANING,
            formatFile: EMAG_README_URL,
            surveyDate: null,
            surveyDateStatus: 'Not provided by source',
            unit: EMAG_LAYERS[i.activeMagneticLayer].unit,
            referenceElevation: EMAG_LAYERS[i.activeMagneticLayer].referenceElevation,
          }
        : {
            layer: 'Magnetic anomaly layer',
            dataOrigin: null,
            status:
              i.dataMode === 'public'
                ? `Not shown (public service status: ${i.publicServiceStatus})`
                : 'Not shown (illustrative mode uses no magnetic data)',
          },
      {
        layer: 'Candidate areas',
        dataOrigin: 'illustrative and/or user',
        note: 'See dataOrigin on each candidate.',
      },
    ],
    route: {
      label: 'Route sketches — not feasible-route recommendations',
      pointsOrigin: i.routeOrigin,
      distanceMethod: 'Geodesic on WGS84 ellipsoid (GeographicLib, Karney 2013)',
      start: i.start,
      destination: i.destination,
      intermediateStops: i.waypoints.map((w, n) => {
        const area = w.areaId ? i.candidates.find((c) => c.id === w.areaId) : undefined;
        return {
          stop: n + 1,
          lat: w.lat,
          lon: w.lon,
          linkedLocation: area
            ? {
                id: area.id,
                label: area.label,
                dataOrigin: area.dataOrigin,
                relation: area.geometry.type === 'Polygon' ? 'user-chosen point inside area' : 'at marked location',
              }
            : null,
          note: 'User-chosen point. Not a validated checkpoint.',
        };
      }),
      directRouteDistance: m(i.referenceMeters),
      withStopsDistance: m(i.alternativeMeters),
      extraDistance:
        i.referenceMeters !== null && i.alternativeMeters !== null
          ? m(i.alternativeMeters - i.referenceMeters)
          : null,
      routeNote: i.routeEvaluationReason || null,
    },
    candidateAnnotations: i.candidates.map((c) => ({
      ...c,
      reviewQuestions: c.reviewQuestions ?? '',
      userEntered: {
        whyReview: c.reviewerNote,
        openQuestions: c.reviewQuestions ?? '',
        note: 'Entered by the reviewer; not verified.',
      },
      markedForReview: c.dataOrigin === 'user' || (i.markedIds ?? []).includes(c.id),
      isExample: !!c.example,
      savedObservation:
        c.geometry.type === 'Polygon'
          ? { status: 'not applicable', note: 'Areas have no single value. See point checks inside the area.' }
          : c.observation ?? { status: 'not recorded', note: 'Marked before observations were saved, or not marked.' },
      linkedStops: i.waypoints.map((w, n) => (w.areaId === c.id ? n + 1 : null)).filter((x) => x !== null),
      pointChecksInside: checksFor(c, i.pointQueries).map((q) => q.queriedAt),
      navigationUsefulness: 'not validated',
      furtherChecks: FURTHER_CHECKS,
    })),
    publicGridPointQueries: i.pointQueries.map((q) => ({
      ...q,
      units: 'nT',
      note: 'Grid-cell values returned by the public service; null means no value at this point. Error estimate is map error, not position error.',
    })),
    limitations: REVIEW_LIMITATIONS,
    unresolvedAssumptions: UNRESOLVED_ASSUMPTIONS,
  };
}

export function downloadJson(obj: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
