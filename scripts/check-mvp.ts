// Focused checks for the MVP workflow: saved observations, readable names, distance summary,
// example review, and route framing. Run with: npm run check
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildObservation, observationHeadline } from '../src/lib/observation.ts';
import { migrateSaved, nextSeq } from '../src/lib/persistence.ts';
import { METERS_PER_NMI, routeDistanceSummary } from '../src/lib/geodesy.ts';
import { buildReviewModel, FURTHER_CHECKS, type ReviewModelInput } from '../src/lib/reviewModel.ts';
import { buildReview } from '../src/lib/exportReview.ts';
import { fitOptions, routeFitPoints, DETAIL_PANEL_WIDTH, FIT_MAX_ZOOM } from '../src/lib/mapFit.ts';
import { EXAMPLE_LOCATION_ID, EXAMPLE_REVIEW, exampleLocation } from '../src/data/illustrativeCandidates.ts';
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
  seaLevelNT: -40.25,
  errorEstimateNT: 33,
  dataSourceCode: 103,
  dataSourceName: 'Baja',
  notes: [],
  ...over,
});
const userLoc = (over: Partial<CandidateArea> = {}): CandidateArea => ({
  id: 'user-abc',
  label: 'Review location 1',
  seq: 1,
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
const input = (over: Partial<ReviewModelInput> = {}): ReviewModelInput => ({
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

console.log('Saved observations');
ok('a marked point saves value, unit, layer, dataset, reference, error, source, and query time', () => {
  const o = buildObservation({ location: P, layer: 'upward', locationIsDemo: false, state: { kind: 'result', result: result() } });
  assert.equal(o.status, 'value');
  assert.equal(o.value, 12.5);
  assert.equal(o.unit, 'nT');
  assert.equal(o.layer, 'upward');
  assert.equal(o.layerName, 'EMAG2v3 (Upward Continued)');
  assert.match(o.datasetName, /EMAG2v3/);
  assert.equal(o.referenceElevation, '4 km above the WGS84 ellipsoid');
  assert.equal(o.errorEstimateNT, 33);
  assert.equal(o.dataSourceName, 'Baja');
  assert.equal(o.queriedAt, '2026-11-06T12:00:00.000Z');
  assert.equal(o.valueOrigin, 'verified-public-source');
  assert.equal(o.locationIsDemo, false);
  assert.ok(o.query);
});
ok('the saved value follows the layer it was saved from (sea level here)', () => {
  const o = buildObservation({ location: P, layer: 'sealevel', locationIsDemo: false, state: { kind: 'result', result: result() } });
  assert.equal(o.value, -40.25);
  assert.match(o.referenceElevation, /Sea level/);
});
ok('zero is saved as a value; no data, failure, and not-loaded are saved explicitly', () => {
  const zero = buildObservation({ location: P, layer: 'upward', locationIsDemo: false, state: { kind: 'result', result: result({ upwardContinuedNT: 0 }) } });
  assert.equal(zero.status, 'value');
  assert.equal(observationHeadline(zero), '0.0 nT');
  const none = buildObservation({ location: P, layer: 'upward', locationIsDemo: false, state: { kind: 'result', result: result({ upwardContinuedNT: null }) } });
  assert.equal(none.status, 'no-value');
  assert.equal(none.value, null);
  assert.equal(none.unit, null);
  const failed = buildObservation({ location: P, layer: 'upward', locationIsDemo: false, state: { kind: 'failed', reason: 'HTTP 500' } });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.value, null);
  assert.equal(failed.valueOrigin, null);
  assert.equal(observationHeadline(failed), 'Could not retrieve (HTTP 500)');
  const notLoaded = buildObservation({ location: P, layer: 'upward', locationIsDemo: false, state: { kind: 'not-loaded' } });
  assert.equal(notLoaded.status, 'not-loaded');
  assert.equal(notLoaded.queriedAt, null);
});
ok('changing the map layer does not change a saved observation in the review', () => {
  const o = buildObservation({ location: P, layer: 'upward', locationIsDemo: false, state: { kind: 'result', result: result() } });
  const m = buildReviewModel(input({ activeLayer: 'sealevel', candidates: [userLoc({ observation: o })] }));
  assert.equal(m.locations[0].observation?.headline, '12.5 nT');
  assert.equal(m.locations[0].observation?.layer, 'Anomaly at 4 km altitude');
  assert.match(m.data.magnetic.layerShown, /Sea Level/);
});
ok('older locations without an observation say so instead of borrowing a session value', () => {
  const m = buildReviewModel(input({ candidates: [userLoc()], pointQueries: [result()] }));
  assert.equal(m.locations[0].observation?.status, 'missing');
  assert.match(m.locations[0].observation!.headline, /No observation saved/);
});
ok('every location lists the three unanswered checks as "Not assessed"', () => {
  assert.deepEqual(FURTHER_CHECKS.map((f) => f.status), ['Not assessed', 'Not assessed', 'Not assessed']);
  assert.ok(FURTHER_CHECKS.some((f) => /position update/.test(f.label)));
  const m = buildReviewModel(input({ candidates: [userLoc()] }));
  assert.equal(m.locations[0].stillToCheck.length, 3);
});

console.log('Saved work (v3)');
ok('old timestamp names become "Review location N"; typed names, ids, and notes are kept', () => {
  const v2 = {
    v: 2,
    candidates: [
      userLoc({ id: 'user-k1', label: 'Location 4F2K', seq: undefined, reviewerNote: 'note 1' }),
      userLoc({ id: 'user-k2', label: 'Ridge east of route', seq: undefined }),
    ],
    markedIds: [],
  };
  const m = migrateSaved(v2)!;
  const [a, b] = m.candidates!;
  assert.equal(a.id, 'user-k1');
  assert.equal(a.label, 'Review location 1');
  assert.equal(a.reviewerNote, 'note 1');
  assert.equal(b.label, 'Ridge east of route');
  assert.equal(b.seq, 2);
  assert.equal(nextSeq(m.candidates!), 3);
  assert.equal(m.reviewPurpose, '');
  assert.deepEqual(m.pointQueries, []);
  assert.deepEqual(migrateSaved(m), { ...m }); // migrating twice changes nothing
});
ok('a request still pending when the page closed is restored as failed, not as a value', () => {
  const pending = buildObservation({ location: P, layer: 'upward', locationIsDemo: false, state: { kind: 'pending' } });
  const m = migrateSaved({ v: 3, candidates: [userLoc({ observation: pending })] })!;
  assert.equal(m.candidates![0].observation?.status, 'failed');
});
ok('review purpose and point checks survive a save/restore round trip', () => {
  const m = migrateSaved({ v: 3, candidates: [], reviewPurpose: 'Assess resolution', pointQueries: [result()] })!;
  assert.equal(m.reviewPurpose, 'Assess resolution');
  assert.equal(m.pointQueries!.length, 1);
});

console.log('Route comparison');
ok('all rows use one decimal; extra distance comes from full-precision values', () => {
  // 10.04 nmi direct and 10.16 nmi with stops: rounded rows read 10.0 and 10.2, but the true
  // difference is 0.12, which displays as +0.1 (not 0.2 from subtracting rounded values).
  const d = routeDistanceSummary(10.04 * METERS_PER_NMI, 10.16 * METERS_PER_NMI, 'nmi');
  assert.equal(d.direct, '10.0 nmi');
  assert.equal(d.withStops, '10.2 nmi');
  assert.equal(d.extra, '+0.1 nmi');
  const big = routeDistanceSummary(300214, 312000, 'km');
  assert.equal(big.direct, '300.2 km');
  assert.equal(big.withStops, '312.0 km');
  assert.equal(big.extra, '+11.8 km');
});
ok('a stop on the direct line shows 0.0 extra, never "-0.0"', () => {
  const d = routeDistanceSummary(5000, 5000 - 1e-9, 'km');
  assert.equal(d.extra, '0.0 km');
  assert.equal(routeDistanceSummary(5000, null, 'km').extra, null);
});
ok('the review uses the same labels and numbers as the sidebar', () => {
  const m = buildReviewModel(input({ referenceMeters: 10.04 * METERS_PER_NMI, alternativeMeters: 10.16 * METERS_PER_NMI, waypoints: [P] }));
  assert.equal(m.route?.direct, '10.0 nmi');
  assert.equal(m.route?.withStops, '10.2 nmi');
  assert.equal(m.route?.extra, '+0.1 nmi');
});

console.log('Map framing');
ok('fit includes both route lines, a stop far off the direct line, and room for the open panel', () => {
  const start = { lat: 32.5, lon: -117.6 };
  const dest = { lat: 33, lon: -120.7 };
  const stop = { lat: 31.2, lon: -119 };
  const pts = routeFitPoints(start, dest, [stop]);
  assert.ok(Math.min(...pts.map((q) => q[0])) <= 31.2 + 1e-9, 'stop latitude included');
  assert.deepEqual(routeFitPoints(start, null, []), []);
  const closed = fitOptions(false);
  const open = fitOptions(true);
  assert.equal(open.paddingBottomRight[0] - closed.paddingBottomRight[0], DETAIL_PANEL_WIDTH);
  assert.equal(open.maxZoom, FIT_MAX_ZOOM);
});

console.log('Example review');
ok('the example location and note are flagged illustrative and framed as a question', () => {
  const ex = exampleLocation();
  assert.equal(ex.id, EXAMPLE_LOCATION_ID);
  assert.equal(ex.dataOrigin, 'illustrative');
  assert.equal(ex.example, true);
  assert.ok(ex.reviewerNote.endsWith('?'));
  assert.equal(ex.magneticValue, null);
});
ok('an example review is labeled, links its stop to the example location, and keeps real values separate', () => {
  const real = buildObservation({ location: EXAMPLE_REVIEW.point, layer: 'upward', locationIsDemo: true, state: { kind: 'result', result: result({ location: EXAMPLE_REVIEW.point }) } });
  assert.equal(real.valueOrigin, 'verified-public-source');
  assert.equal(real.locationIsDemo, true);
  const ex = { ...exampleLocation(), observation: real };
  const args = {
    start: EXAMPLE_REVIEW.start,
    destination: EXAMPLE_REVIEW.destination,
    waypoints: [{ ...EXAMPLE_REVIEW.point, areaId: EXAMPLE_LOCATION_ID }],
    routeOrigin: 'illustrative' as const,
    candidates: [ex],
    markedIds: [EXAMPLE_LOCATION_ID],
  };
  const m = buildReviewModel(input({ ...args, alternativeMeters: 310000, isExample: true }));
  assert.match(m.title, /example/i);
  assert.ok(m.demoNotice && /illustrative/.test(m.demoNotice));
  assert.equal(m.locations[0].kind, 'Example location (illustrative)');
  assert.deepEqual(m.locations[0].linkedStops, ['Stop 1']);
  assert.match(m.route!.stops[0].link ?? '', /\(example\)/);
  const r = buildReview({
    ...args, dataMode: 'public', publicServiceStatus: 'available', activeMagneticLayer: 'upward', demoAreasVisible: false,
    referenceMeters: 300000, alternativeMeters: 310000, routeEvaluationReason: '', pointQueries: [], isExample: true,
  });
  assert.ok(r.exampleReview);
  assert.equal(r.candidateAnnotations[0].isExample, true);
});

console.log('Review export and wording');
ok('a blank purpose is reported as "Purpose not entered." and no conclusion is written', () => {
  const base = {
    dataMode: 'public' as const, publicServiceStatus: 'available' as const, activeMagneticLayer: 'upward' as const,
    start: null, destination: null, waypoints: [], demoAreasVisible: false, routeOrigin: 'user' as const,
    referenceMeters: null, alternativeMeters: null, routeEvaluationReason: '', candidates: [userLoc()], pointQueries: [],
  };
  assert.equal(buildReview(base).reviewPurpose.status, 'Purpose not entered.');
  assert.equal(buildReview({ ...base, reviewPurpose: '  Check grid  ' }).reviewPurpose.text, 'Check grid');
  assert.equal((buildReview(base).candidateAnnotations[0].savedObservation as { status: string }).status, 'not recorded');
});
ok('no UI text calls a route better, safer, or recommended, or scores suitability', () => {
  const walk = (d: string): string[] =>
    readdirSync(d).flatMap((n) => {
      const p = join(d, n);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
  for (const file of walk('src').filter((p) => /\.(tsx?)$/.test(p))) {
    const s = readFileSync(file, 'utf8');
    assert.ok(!/(better|safer|recommended|optimal) route/i.test(s), `${file} rates a route`);
    assert.ok(!/suitability score|checkpoint rating/i.test(s), `${file} scores suitability`);
  }
});

console.log(`\n${passed} MVP checks passed`);
