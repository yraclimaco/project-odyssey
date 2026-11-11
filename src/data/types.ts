// Shared data shapes. Map data lives in src/data; UI code only consumes these types,
// so the illustrative dataset can later be swapped for a verified source.

import type { Point, Polygon } from 'geojson';

/** Where a piece of data came from. Every feature must carry one of these. */
export type DataOrigin =
  | 'illustrative' // made up for the demo; not a real observation
  | 'user' // added by a person using this tool during review
  | 'verified-public-source'; // returned by a documented public service (e.g. NOAA EMAG2v3)

export type ValidationStatus = 'Requires validation';

export interface CandidateArea {
  id: string;
  geometry: Point | Polygon;
  label: string;
  dataOrigin: DataOrigin;
  sourceName: string | null;
  sourceUrl: string | null;
  reasonForReview: string;
  /** Grid / map resolution of the underlying data, as text with units. */
  resolution: string | null;
  /** Reference elevation/altitude at which a magnetic value is reported. */
  referenceElevation: string | null;
  magneticValue: number | null;
  magneticUnit: string | null;
  /** Map error estimate as published by the source (not vehicle position error). */
  mapErrorEstimate: string | null;
  limitations: string[];
  /** User-entered: why this location is worth reviewing. */
  reviewerNote: string;
  /** User-entered: open questions for a data or navigation expert. Optional for older records. */
  reviewQuestions?: string;
  validationStatus: ValidationStatus;
  /** Number used for the default name ("Review location 3"). The id stays the internal key. */
  seq?: number;
  /** True for the fictional "Open example" location. */
  example?: boolean;
  /**
   * The query result saved when the point was marked (or explicitly refreshed). Absent for areas and
   * for records saved by older versions. It is never replaced silently.
   */
  observation?: SavedObservation | null;
}

/** What was known about the magnetic map at one point when it was saved. */
export interface SavedObservation {
  /**
   * value: the source returned a number · no-value: the source has no data at this cell ·
   * failed: the request failed · not-loaded: the magnetic map was not loaded when marked ·
   * pending: a request was still running (filled in when it finishes).
   */
  status: 'value' | 'no-value' | 'failed' | 'not-loaded' | 'pending';
  location: LatLon;
  /** Which anomaly layer the saved value comes from. */
  layer: 'upward' | 'sealevel';
  layerName: string;
  datasetName: string;
  sourceUrl: string;
  value: number | null;
  unit: 'nT' | null;
  referenceElevation: string;
  errorEstimateNT: number | null;
  dataSourceCode: number | null;
  dataSourceName: string | null;
  notes: string[];
  /** When the service answered. null if no answer was received. */
  queriedAt: string | null;
  savedAt: string;
  failureReason: string | null;
  /** The value came from the public service; the location itself may still be demo/example content. */
  valueOrigin: 'verified-public-source' | null;
  /** True when the location is demo or example content (any value is still real service data). */
  locationIsDemo: boolean;
  /** Full service response, kept for provenance. */
  query: PointQueryResult | null;
}

export interface LatLon {
  lat: number;
  lon: number;
}

/** An intermediate route stop. If placed from an area's detail panel, areaId records which area. */
export interface RouteStop extends LatLon {
  areaId?: string | null;
}

export type DataMode = 'illustrative' | 'public';

/** Result of querying the public magnetic grid at one point. */
export interface PointQueryResult {
  location: LatLon;
  queriedAt: string;
  dataOrigin: 'verified-public-source';
  sourceName: string;
  sourceUrl: string;
  /** null means the service returned NoData for that layer. */
  upwardContinuedNT: number | null;
  seaLevelNT: number | null;
  errorEstimateNT: number | null;
  dataSourceCode: number | null;
  /** Name for dataSourceCode from the NCEI format file; null when the code is missing or not in the table. */
  dataSourceName: string | null;
  /** Plain-language notes about documented sentinel values encountered in this response. */
  notes: string[];
}
