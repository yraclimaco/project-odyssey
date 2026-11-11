// ILLUSTRATIVE DEMO DATA — NOT REAL OBSERVATIONS.
// These areas are hand-placed demonstration annotations. Their locations were chosen
// only to make the interface easy to demonstrate. They do not establish real magnetic
// navigation opportunities, and no magnetic values, sources, or error estimates exist
// for them (all such fields are null and shown as "Not provided").

import type { CandidateArea } from './types';

const COMMON_LIMITATIONS = [
  'Demonstration annotation only; location was not derived from magnetic data.',
  'No magnetic measurement, map error estimate, or survey source is attached.',
  'A magnetic anomaly, even if present, is not automatically usable for navigation.',
];

/** Closed ring helper: [lon, lat] pairs, first point repeated at the end. */
function ring(coords: [number, number][]): [number, number][][] {
  return [[...coords, coords[0]]];
}

export const ILLUSTRATIVE_CANDIDATES: CandidateArea[] = [
  {
    id: 'demo-area-a',
    label: 'Demo area A',
    geometry: {
      type: 'Polygon',
      coordinates: ring([
        [-119.45, 32.55],
        [-119.05, 32.6],
        [-118.95, 32.3],
        [-119.35, 32.2],
      ]),
    },
    dataOrigin: 'illustrative',
    sourceName: null,
    sourceUrl: null,
    reasonForReview:
      'Demonstration: shows how a planner might flag an area to compare against the magnetic layer before considering it further.',
    resolution: null,
    referenceElevation: null,
    magneticValue: null,
    magneticUnit: null,
    mapErrorEstimate: null,
    limitations: COMMON_LIMITATIONS,
    reviewerNote: '',
    validationStatus: 'Requires validation',
  },
  {
    id: 'demo-area-b',
    label: 'Demo area B',
    geometry: {
      type: 'Polygon',
      coordinates: ring([
        [-120.3, 33.15],
        [-119.85, 33.2],
        [-119.75, 32.9],
        [-120.2, 32.85],
      ]),
    },
    dataOrigin: 'illustrative',
    sourceName: null,
    sourceUrl: null,
    reasonForReview:
      'Demonstration: shows an area where data availability and source coverage would need to be confirmed before any review.',
    resolution: null,
    referenceElevation: null,
    magneticValue: null,
    magneticUnit: null,
    mapErrorEstimate: null,
    limitations: [
      ...COMMON_LIMITATIONS,
      'Proximity to any coastline or island here is coincidental and unassessed.',
    ],
    reviewerNote: '',
    validationStatus: 'Requires validation',
  },
  {
    id: 'demo-area-c',
    label: 'Demo area C',
    geometry: { type: 'Point', coordinates: [-118.4, 31.85] },
    dataOrigin: 'illustrative',
    sourceName: null,
    sourceUrl: null,
    reasonForReview:
      'Demonstration: a single-point annotation, showing how a location (rather than an area) could be marked for review.',
    resolution: null,
    referenceElevation: null,
    magneticValue: null,
    magneticUnit: null,
    mapErrorEstimate: null,
    limitations: COMMON_LIMITATIONS,
    reviewerNote: '',
    validationStatus: 'Requires validation',
  },
];

/**
 * "Open example": one fictional review for presentations and usability tests. The route, the review
 * point, and the note are illustrative. The point was chosen only to sit beside the route so the
 * distance comparison is visible; it was not chosen from magnetic data and is not a validated
 * navigation opportunity. If the magnetic map is loaded, the app queries the real value at this
 * point and shows only what the service returns.
 */
export const EXAMPLE_LOCATION_ID = 'example-location-1';
export const EXAMPLE_REVIEW = {
  start: { lat: 32.55, lon: -117.6 },
  destination: { lat: 33.05, lon: -120.75 },
  point: { lat: 32.45, lon: -119.3 },
  locationName: 'Example review location',
  note: 'Is the available map resolution sufficient to investigate this location further?',
  purpose: 'Example: is the available magnetic data enough to decide whether this location deserves further technical review?',
  routeNote: 'Example route (illustrative). Endpoints are fictional.',
};

export function exampleLocation(): CandidateArea {
  return {
    id: EXAMPLE_LOCATION_ID,
    label: EXAMPLE_REVIEW.locationName,
    geometry: { type: 'Point', coordinates: [EXAMPLE_REVIEW.point.lon, EXAMPLE_REVIEW.point.lat] },
    dataOrigin: 'illustrative',
    example: true,
    sourceName: null,
    sourceUrl: null,
    reasonForReview: 'Example location (illustrative), placed beside the example route to show the distance comparison.',
    resolution: null,
    referenceElevation: null,
    magneticValue: null,
    magneticUnit: null,
    mapErrorEstimate: null,
    limitations: ['Example location. Not chosen from magnetic data and not a validated navigation opportunity.'],
    reviewerNote: EXAMPLE_REVIEW.note,
    reviewQuestions: '',
    validationStatus: 'Requires validation',
    observation: null,
  };
}

/** Illustrative start/destination used by the "Use example route (demo)" button. */
export const ILLUSTRATIVE_ROUTE_EXAMPLE = {
  start: { lat: 32.55, lon: -117.6 },
  destination: { lat: 33.05, lon: -120.75 },
  dataOrigin: 'illustrative' as const,
};

export const DEMO_MAP_CENTER: [number, number] = [32.6, -119.0];
export const DEMO_MAP_ZOOM = 8;
