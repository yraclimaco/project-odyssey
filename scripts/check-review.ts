// Focused checks for the selection panel, review summary, persistence, and status logic.
// Run with: npm run check
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseCell, parsePixel } from '../src/lib/emagParse.ts';
import { acceptProbe, valueState, type Probe } from '../src/lib/probeState.ts';
import { headerStatus } from '../src/lib/status.ts';
import { buildReviewModel, type ReviewModelInput } from '../src/lib/reviewModel.ts';
import { buildReview } from '../src/lib/exportReview.ts';
import { migrateSaved } from '../src/lib/persistence.ts';
import { buildObservation } from '../src/lib/observation.ts';
import { ILLUSTRATIVE_CANDIDATES } from '../src/data/illustrativeCandidates.ts';
import type { CandidateArea, PointQueryResult } from '../src/data/types.ts';

let passed = 0;
const ok = (name: string, fn: () => void) => {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
};

const P = { lat: 32.4, lon: -119.2 };
const result = (over: Partial<PointQueryResult> = {}): PointQueryResult => ({
  location: P,
  queriedAt: '2026-11-06T12:00:00.000Z',
  dataOrigin: 'verified-public-source',
  sourceName: 'NOAA',
  sourceUrl: 'x',
  upwardContinuedNT: 12.5,
  seaLevelNT: 10,
  errorEstimateNT: 33,
  dataSourceCode: 103,
  dataSourceName: 'Baja',
  notes: [],
  ...over,
});

console.log('Magnetic values and request states');
ok('a zero magnetic value is a value, not missing', () => {
  assert.equal(parsePixel('0.000000'), 0);
  assert.equal(parseCell({ upward: '0', sealevel: 0, error: '0', code: '37' }).upwardContinuedNT, 0);
  const st = valueState({ requestId: 1, location: P, status: 'done', result: result({ upwardContinuedNT: 0 }) }, P, true, 'upwardContinuedNT');
  assert.deepEqual(st, { kind: 'value', value: 0, unit: 'nT', at: P });
});
ok('"NoData" and documented sentinels become missing, with notes', () => {
  assert.equal(parsePixel('NoData'), null);
  const c = parseCell({ upward: '99999', sealevel: 'NoData', error: '-888', code: '888' });
  assert.equal(c.upwardContinuedNT, null);
  assert.equal(c.seaLevelNT, null);
  assert.equal(c.errorEstimateNT, null);
  assert.equal(c.dataSourceName, 'Ambiguous');
  assert.ok(c.notes.some((n) => n.includes('ambiguous')));
  assert.equal(parseCell({ upward: '1', sealevel: '1', error: '1', code: '103' }).dataSourceName, 'Baja');
});
ok('no value at a point is different from a failed request', () => {
  const none = valueState({ requestId: 1, location: P, status: 'done', result: result({ upwardContinuedNT: null }) }, P, true, 'upwardContinuedNT');
  const fail = valueState({ requestId: 1, location: P, status: 'error', error: 'HTTP 500' }, P, true, 'upwardContinuedNT');
  assert.equal(none.kind, 'no-value');
  assert.equal(fail.kind, 'failed');
  assert.equal(valueState(null, P, false, 'upwardContinuedNT').kind, 'not-loaded');
});
ok('a slow earlier response cannot appear under a newer point', () => {
  const Q = { lat: 33, lon: -120 };
  const current: Probe = { requestId: 2, location: Q, status: 'loading' };
  assert.equal(acceptProbe(current, 1, { status: 'done', result: result() }), current); // late response ignored
  assert.equal(acceptProbe(null, 1, { status: 'done', result: result() }), null); // selection already cleared
  const stale: Probe = { requestId: 1, location: P, status: 'done', result: result() };
  assert.equal(valueState(stale, Q, true, 'upwardContinuedNT').kind, 'loading'); // never shows P's value at Q
});
ok('selecting an area without a chosen point implies no area-wide value', () => {
  assert.equal(valueState(null, null, true, 'upwardContinuedNT').kind, 'area');
});
ok('header status follows loading and layer visibility', () => {
  assert.equal(headerStatus('illustrative', 'not-requested', true).text, 'Magnetic data not loaded');
  assert.equal(headerStatus('public', 'loading', true).text, 'Loading magnetic data…');
  assert.equal(headerStatus('public', 'available', true).text, 'Magnetic layer visible');
  assert.equal(headerStatus('public', 'available', false).text, 'Magnetic layer hidden');
  assert.equal(headerStatus('public', 'unavailable', true).text, "Couldn't load magnetic data");
});

console.log('Review summary and export');
const userLoc = (over: Partial<CandidateArea> = {}): CandidateArea => ({
  id: 'user-1',
  label: 'Location A1',
  geometry: { type: 'Point', coordinates: [P.lon, P.lat] },
  dataOrigin: 'user',
  sourceName: null,
  sourceUrl: null,
  reasonForReview: 'Marked by a reviewer.',
  resolution: null,
  referenceElevation: null,
  magneticValue: null,
  magneticUnit: null,
  mapErrorEstimate: null,
  limitations: [],
  reviewerNote: '',
  reviewQuestions: '',
  validationStatus: 'Requires validation',
  ...over,
});
const baseInput = (over: Partial<ReviewModelInput> = {}): ReviewModelInput => ({
  createdAt: new Date('2026-11-06T12:00:00Z'),
  dataMode: 'public',
  magneticReady: true,
  activeLayer: 'upward',
  start: { lat: 32.5, lon: -117.6 },
  destination: { lat: 33, lon: -120.7 },
  waypoints: [],
  referenceMeters: 300000,
  alternativeMeters: null,
  unit: 'nmi',
  routeOrigin: 'user',
  routeNote: '',
  candidates: [],
  markedIds: [],
  pointQueries: [],
  ...over,
});
ok('marking a location does not change the route', () => {
  const before = buildReviewModel(baseInput());
  const after = buildReviewModel(baseInput({ candidates: [userLoc()] }));
  assert.deepEqual(after.route, before.route);
  assert.equal(after.locations.length, 1);
});
ok('area point checks are labeled as point values, never as an area value', () => {
  const area = ILLUSTRATIVE_CANDIDATES[0];
  const m = buildReviewModel(baseInput({ candidates: [area], markedIds: [area.id], pointQueries: [result()] }));
  const loc = m.locations[0];
  assert.ok(loc.where.startsWith('Area'));
  assert.equal(loc.pointChecks.length, 1);
  assert.equal(loc.pointChecks[0].upward, '12.5 nT');
  assert.equal(loc.isArea, true);
  assert.equal(loc.observation, null); // an area never carries a single saved value
  assert.ok(m.containsDemo && m.demoNotice);
});
ok('review keeps user notes verbatim, zero values, and "not provided" wording', () => {
  const evil = '<img src=x onerror="alert(1)"> & <b>bold</b>';
  const q = result({ upwardContinuedNT: 0, errorEstimateNT: null });
  const m = buildReviewModel(
    baseInput({
      candidates: [
        userLoc({
          reviewerNote: evil,
          reviewQuestions: 'Depth?',
          observation: buildObservation({ location: P, layer: 'upward', locationIsDemo: false, state: { kind: 'result', result: q } }),
        }),
      ],
      pointQueries: [q],
    }),
  );
  assert.equal(m.locations[0].why, evil); // plain string; React renders it as text
  assert.equal(m.locations[0].legacyQuestions, 'Depth?');
  assert.equal(m.locations[0].observation?.headline, '0.0 nT');
  assert.equal(m.locations[0].observation?.error, 'Not provided by source at this point');
});
ok('no source file renders HTML from strings', () => {
  const walk = (d: string): string[] =>
    readdirSync(d).flatMap((n) => {
      const p = join(d, n);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
  for (const file of walk('src').filter((p) => /\.(tsx?|jsx?)$/.test(p))) {
    const s = readFileSync(file, 'utf8');
    assert.ok(!/dangerouslySetInnerHTML|\.innerHTML\s*=|insertAdjacentHTML|document\.write/.test(s), file);
  }
});
ok('JSON export keeps sources, units, notes, questions, links, and demo flags', () => {
  const r = buildReview({
    dataMode: 'public',
    publicServiceStatus: 'available',
    activeMagneticLayer: 'upward',
    start: { lat: 32.5, lon: -117.6 },
    destination: { lat: 33, lon: -120.7 },
    waypoints: [{ lat: 32.4, lon: -119.2, areaId: 'demo-area-a' }],
    demoAreasVisible: true,
    markedIds: ['demo-area-a'],
    routeOrigin: 'user',
    referenceMeters: 1,
    alternativeMeters: 2,
    routeEvaluationReason: '',
    candidates: [{ ...ILLUSTRATIVE_CANDIDATES[0], reviewerNote: 'Why A', reviewQuestions: 'Q A' }],
    pointQueries: [result()],
  });
  const mag = r.dataSources[1] as { unit?: string; version?: string };
  assert.equal(mag.unit, 'nT');
  assert.equal(mag.version, 'EMAG2v3');
  const a = r.candidateAnnotations[0];
  assert.equal(a.dataOrigin, 'illustrative');
  assert.equal(a.userEntered.whyReview, 'Why A');
  assert.equal(a.userEntered.openQuestions, 'Q A');
  assert.equal(a.markedForReview, true);
  assert.equal(a.validationStatus, 'Requires validation'); // a route through it does not validate it
  assert.deepEqual(a.linkedStops, [1]);
  assert.equal(r.route.intermediateStops[0].linkedLocation?.relation, 'user-chosen point inside area');
  assert.equal(r.publicGridPointQueries[0].dataSourceName, 'Baja');
});

console.log('Saved work');
ok('a v1 saved record survives the update', () => {
  const v1 = {
    candidates: [
      { ...ILLUSTRATIVE_CANDIDATES[0], reviewerNote: 'Check coverage here in the sim tool.' },
      { ...userLoc({ reasonForReview: 'Strong feature here', reviewerNote: 'Ask an expert' }), reviewQuestions: undefined },
    ],
    start: { lat: 31.64, lon: -117.65 },
    destination: { lat: 32.71, lon: -120.95 },
    waypoints: [
      { lat: 32.27, lon: -119.48, areaId: null },
      { lat: 32.4, lon: -119.2, areaId: 'demo-area-a' },
    ],
    routeOrigin: 'user',
    routeReason: 'Passes area A',
    unit: 'km',
    markedIds: ['demo-area-a'],
  };
  const m = migrateSaved(v1)!;
  assert.deepEqual(m.start, v1.start);
  assert.equal(m.waypoints!.length, 2);
  assert.equal(m.waypoints![1].areaId, 'demo-area-a');
  assert.equal(m.routeReason, 'Passes area A');
  assert.equal(m.unit, 'km');
  assert.deepEqual(m.markedIds, ['demo-area-a']);
  const demo = m.candidates!.find((c) => c.id === 'demo-area-a')!;
  assert.equal(demo.reviewerNote, 'Check coverage here in the sim tool.');
  const user = m.candidates!.find((c) => c.dataOrigin === 'user')!;
  assert.equal(user.reviewerNote, 'Strong feature here\nAsk an expert');
  assert.equal(user.reviewQuestions, '');
  assert.equal(m.showDemo, true); // this older session used demo areas, so they stay visible
  assert.equal(migrateSaved({ candidates: [] })!.showDemo, undefined); // new default applies (hidden)
  assert.equal(migrateSaved('garbage'), null);
  // migrating twice changes nothing
  assert.deepEqual(migrateSaved(m), { ...m });
});

console.log(`\n${passed} review checks passed`);
