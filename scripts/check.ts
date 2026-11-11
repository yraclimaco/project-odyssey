// Lightweight checks for the mockup (no test framework). Run with: npm run check
import assert from 'node:assert/strict';
import { distanceMeters, pathLengthMeters, densifyGeodesic, formatDistance, formatDistanceIn } from '../src/lib/geodesy.ts';
import { pointInPolygon } from '../src/lib/geometry.ts';
import { ILLUSTRATIVE_CANDIDATES } from '../src/data/illustrativeCandidates.ts';
import { buildReview, UNRESOLVED_ASSUMPTIONS } from '../src/lib/exportReview.ts';

let passed = 0;
const ok = (name: string, fn: () => void) => {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
};

console.log('Geodesy');
ok('identical points are 0 m', () => {
  assert.equal(distanceMeters({ lat: 32.7, lon: -117.2 }, { lat: 32.7, lon: -117.2 }), 0);
});
ok('1° longitude on the equator = WGS84 a·π/180 (111,319.49 m)', () => {
  const d = distanceMeters({ lat: 0, lon: 0 }, { lat: 0, lon: 1 });
  assert.ok(Math.abs(d - (6378137 * Math.PI) / 180) < 0.001, `got ${d}`);
});
ok('1° latitude at the equator ≈ 110,574 m (known WGS84 meridian arc)', () => {
  const d = distanceMeters({ lat: 0, lon: 0 }, { lat: 1, lon: 0 });
  assert.ok(Math.abs(d - 110574.389) < 0.01, `got ${d}`);
});
ok('path through a midpoint on the equator equals direct', () => {
  const direct = pathLengthMeters([{ lat: 0, lon: 0 }, { lat: 0, lon: 2 }]);
  const via = pathLengthMeters([{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }, { lat: 0, lon: 2 }]);
  assert.ok(Math.abs(direct - via) < 1e-6);
});
ok('detour is longer than direct (additional distance > 0)', () => {
  const a = { lat: 32.55, lon: -117.6 }, b = { lat: 33.05, lon: -120.75 };
  assert.ok(pathLengthMeters([a, { lat: 32.4, lon: -119.2 }, b]) > pathLengthMeters([a, b]));
});
ok('1852 m formats as 1.0 nmi (1.9 km)', () => {
  assert.equal(formatDistance(1852), '1.0 nmi (1.9 km)');
});
ok('densified line starts and ends at the endpoints', () => {
  const line = densifyGeodesic([{ lat: 10, lon: 10 }, { lat: 11, lon: 12 }]);
  assert.deepEqual(line[0], [10, 10]);
  assert.deepEqual(line[line.length - 1], [11, 12]);
});

ok('unit formatting: always one decimal (1852 m = 1.0 nmi; 300,214 m = 300.2 km; 0 m = 0.0 nmi)', () => {
  assert.equal(formatDistanceIn(1852, 'nmi'), '1.0 nmi');
  assert.equal(formatDistanceIn(300214, 'km'), '300.2 km');
  assert.equal(formatDistanceIn(0, 'nmi'), '0.0 nmi');
});
ok('point-in-polygon for demo area A', () => {
  const a = ILLUSTRATIVE_CANDIDATES[0].geometry;
  assert.equal(a.type, 'Polygon');
  if (a.type !== 'Polygon') return;
  assert.equal(pointInPolygon({ lat: 32.4, lon: -119.2 }, a), true);
  assert.equal(pointInPolygon({ lat: 31.0, lon: -119.2 }, a), false);
});

console.log('Illustrative data honesty');
ok('every illustrative candidate is flagged and has no invented values', () => {
  for (const c of ILLUSTRATIVE_CANDIDATES) {
    assert.equal(c.dataOrigin, 'illustrative');
    assert.equal(c.validationStatus, 'Requires validation');
    for (const k of ['sourceName', 'sourceUrl', 'resolution', 'referenceElevation', 'magneticValue', 'magneticUnit', 'mapErrorEstimate'] as const) {
      assert.equal(c[k], null, `${c.id}.${k} should be null`);
    }
  }
});

console.log('Export');
ok('export is labeled, carries provenance, distances and assumptions', () => {
  const r = buildReview({
    dataMode: 'illustrative',
    publicServiceStatus: 'not-requested',
    activeMagneticLayer: null,
    start: { lat: 0, lon: 0 },
    destination: { lat: 0, lon: 1 },
    waypoints: [],
    demoAreasVisible: true,
    routeOrigin: 'user',
    referenceMeters: 111319.49,
    alternativeMeters: null,
    routeEvaluationReason: '',
    candidates: ILLUSTRATIVE_CANDIDATES,
    pointQueries: [],
  });
  assert.equal(r.label, 'Planning review only');
  assert.equal(r.dataStatus, 'Demo data only (no magnetic data loaded)');
  assert.equal(r.demoAreas.visibleWhenSaved, true);
  assert.ok(r.candidateAnnotations.every((c) => c.dataOrigin === 'illustrative' && c.magneticValue === null));
  assert.equal(r.route.extraDistance, null);
  assert.equal(r.unresolvedAssumptions.length, UNRESOLVED_ASSUMPTIONS.length);
  const json = JSON.stringify(r);
  for (const banned of ['Reliable checkpoint', 'Safe route', 'Guaranteed position fix', 'success probability']) {
    assert.ok(!json.includes(banned), `export contains "${banned}"`);
  }
});
ok('stops placed inside an area keep that area as provenance', () => {
  const r = buildReview({
    dataMode: 'illustrative', publicServiceStatus: 'not-requested', activeMagneticLayer: null,
    start: { lat: 32.5, lon: -117.6 }, destination: { lat: 33, lon: -120.7 },
    waypoints: [{ lat: 32.4, lon: -119.2, areaId: 'demo-area-a' }, { lat: 32.0, lon: -119.0 }],
    demoAreasVisible: true, routeOrigin: 'user', referenceMeters: 1, alternativeMeters: 2,
    routeEvaluationReason: 'x', candidates: ILLUSTRATIVE_CANDIDATES, pointQueries: [],
  });
  assert.equal(r.route.intermediateStops[0].linkedLocation?.label, 'Demo area A');
  assert.equal(r.route.intermediateStops[0].linkedLocation?.dataOrigin, 'illustrative');
  assert.equal(r.route.intermediateStops[1].linkedLocation, null);
  assert.equal(r.route.extraDistance?.meters, 1);
});
ok('failed public service is reported, not replaced with illustrative magnetic data', () => {
  const r = buildReview({
    dataMode: 'public', publicServiceStatus: 'unavailable', activeMagneticLayer: null,
    start: null, destination: null, waypoints: [], demoAreasVisible: false, routeOrigin: 'user',
    referenceMeters: null, alternativeMeters: null, routeEvaluationReason: '',
    candidates: [], pointQueries: [],
  });
  const mag = r.dataSources[1] as { dataOrigin: unknown; status?: string };
  assert.equal(mag.dataOrigin, null);
  assert.match(mag.status ?? '', /unavailable/);
});

console.log(`\n${passed} checks passed`);
