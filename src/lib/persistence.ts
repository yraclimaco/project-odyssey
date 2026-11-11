// Keeps the reviewer's work in this browser only (localStorage). Nothing is sent anywhere.
import type { CandidateArea, LatLon, PointQueryResult, RouteStop } from '../data/types';
import type { DistanceUnit } from './geodesy';
import { settleStaleObservation } from './observation.ts';

const KEY = 'project-odyssey-review-v1';
export const SCHEMA_VERSION = 3;
/** Point checks kept across reloads (newest kept). */
export const MAX_SAVED_POINT_QUERIES = 100;

export interface SavedState {
  v: number;
  candidates: CandidateArea[];
  start: LatLon | null;
  destination: LatLon | null;
  waypoints: RouteStop[];
  routeOrigin: 'user' | 'illustrative';
  routeReason: string;
  unit: DistanceUnit;
  markedIds: string[];
  /** Explicit user preference. Absent in older records. */
  showDemo?: boolean;
  /** "What are you asking the reviewer to assess?" Added in v3. */
  reviewPurpose?: string;
  /** Point checks against the public grid. Added in v3. */
  pointQueries?: PointQueryResult[];
}

const isLL = (x: unknown): x is LatLon =>
  !!x && typeof (x as LatLon).lat === 'number' && typeof (x as LatLon).lon === 'number';

/** Older versions named locations "Location 4F2K" from a timestamp. Only that exact default is renamed. */
const OLD_DEFAULT_NAME = /^Location [0-9A-Z]{4}$/;

export const defaultLocationName = (seq: number) => `Review location ${seq}`;

/** Next readable number for a new location. */
export function nextSeq(candidates: CandidateArea[]): number {
  return candidates.reduce((m, c) => (c.dataOrigin === 'user' && typeof c.seq === 'number' ? Math.max(m, c.seq) : m), 0) + 1;
}

/**
 * Upgrades any older saved record without losing work.
 * v1 → v2: a user location's free-text reason moves into reviewerNote, reviewQuestions is added, and
 *          showDemo is inferred when the user had interacted with demo areas.
 * v2 → v3: user locations get a readable number (old timestamp-style default names become
 *          "Review location N"; names the user typed are kept), a pending observation left by a closed
 *          page is saved as failed, and reviewPurpose / pointQueries are added.
 */
export function migrateSaved(raw: unknown): Partial<SavedState> | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const candidates = Array.isArray(r.candidates) ? (r.candidates as CandidateArea[]) : [];
  const fromV1 = typeof r.v !== 'number' || r.v < 2;

  let seq = candidates.reduce((m, c) => (c.dataOrigin === 'user' && typeof c.seq === 'number' ? Math.max(m, c.seq) : m), 0);
  const upgraded = candidates.map((c) => {
    const out: CandidateArea = { ...c, reviewerNote: c.reviewerNote ?? '', reviewQuestions: c.reviewQuestions ?? '' };
    if (c.dataOrigin === 'user') {
      const oldReason = (c.reasonForReview ?? '').trim();
      if (fromV1 && oldReason && oldReason !== 'Marked by a reviewer.') {
        out.reviewerNote = [oldReason, (c.reviewerNote ?? '').trim()].filter(Boolean).join('\n');
      }
      out.reasonForReview = 'Marked by a reviewer.';
      if (typeof out.seq !== 'number') out.seq = ++seq;
      if (OLD_DEFAULT_NAME.test(out.label ?? '')) out.label = defaultLocationName(out.seq);
    }
    if ('observation' in out) out.observation = settleStaleObservation(out.observation);
    return out;
  });

  const markedIds = Array.isArray(r.markedIds) ? (r.markedIds as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  const waypoints = Array.isArray(r.waypoints)
    ? (r.waypoints as unknown[]).filter(isLL).map((w) => ({ lat: w.lat, lon: w.lon, areaId: (w as RouteStop).areaId ?? null }))
    : [];

  let showDemo = typeof r.showDemo === 'boolean' ? r.showDemo : undefined;
  if (showDemo === undefined && fromV1) {
    // Keep demo areas visible for older sessions that used them; otherwise follow the new default (hidden).
    const usedDemo =
      markedIds.some((id) => id.startsWith('demo-')) ||
      waypoints.some((w) => (w.areaId ?? '').startsWith('demo-')) ||
      upgraded.some((c) => c.dataOrigin === 'illustrative' && c.reviewerNote.trim() !== '');
    if (usedDemo) showDemo = true;
  }

  const pointQueries = Array.isArray(r.pointQueries)
    ? (r.pointQueries as PointQueryResult[]).filter((q) => q && isLL(q.location) && typeof q.queriedAt === 'string')
    : [];

  return {
    v: SCHEMA_VERSION,
    candidates: upgraded,
    start: isLL(r.start) ? r.start : null,
    destination: isLL(r.destination) ? r.destination : null,
    waypoints,
    routeOrigin: r.routeOrigin === 'illustrative' ? 'illustrative' : 'user',
    routeReason: typeof r.routeReason === 'string' ? r.routeReason : '',
    unit: r.unit === 'km' ? 'km' : 'nmi',
    markedIds,
    showDemo,
    reviewPurpose: typeof r.reviewPurpose === 'string' ? r.reviewPurpose : '',
    pointQueries,
  };
}

export function loadSaved(): Partial<SavedState> | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? migrateSaved(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveState(s: Omit<SavedState, 'v'>) {
  try {
    const pointQueries = (s.pointQueries ?? []).slice(-MAX_SAVED_POINT_QUERIES);
    localStorage.setItem(KEY, JSON.stringify({ v: SCHEMA_VERSION, ...s, pointQueries }));
  } catch {
    /* storage unavailable: work continues in memory only */
  }
}

export function clearSaved() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
