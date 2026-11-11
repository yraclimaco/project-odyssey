// One planning review: the user's own (saved in this browser) or the temporary example (never saved).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CandidateArea, LatLon, PointQueryResult, RouteStop } from '../data/types';
import { EXAMPLE_LOCATION_ID, EXAMPLE_REVIEW, ILLUSTRATIVE_CANDIDATES, exampleLocation } from '../data/illustrativeCandidates';
import { identifyAt } from '../lib/emagService';
import { pathLengthMeters, type DistanceUnit } from '../lib/geodesy';
import { pointInPolygon } from '../lib/geometry';
import { buildReview, downloadJson } from '../lib/exportReview';
import { buildReviewModel, isMarkedCandidate, type ReviewModel } from '../lib/reviewModel';
import { clearSaved, defaultLocationName, loadSaved, nextSeq, saveState, type SavedState } from '../lib/persistence';
import { acceptProbe, type Probe } from '../lib/probeState';
import { anomalyLayerFor, buildObservation, type ObservationInput } from '../lib/observation';
import type { MagneticState } from '../App';
import Header from './Header';
import Sidebar from './Sidebar';
import MapView, { type MapViewState } from './MapView';
import DetailPanel from './DetailPanel';
import ReviewSummary from './ReviewSummary';
import Toast from './Toast';

/**
 * What a click on the map does right now. In 'inspect' a click selects that location.
 * 'area-stop' / 'area-probe' ask for an exact point inside one area; 'move-stop' repositions a stop.
 */
export type InteractionMode = 'inspect' | 'start' | 'destination' | 'stop' | 'move-stop' | 'area-stop' | 'area-probe';
export type TabKey = 'data' | 'route';
export type Selection = { kind: 'candidate'; id: string } | { kind: 'point'; location: LatLon } | null;

export interface LayerVisibility {
  magnetic: boolean;
  candidates: boolean;
}

function mergeIllustrative(saved: CandidateArea[] | undefined): CandidateArea[] {
  // Demo entries always come from the data file; only the reviewer's own notes and saved observations are restored.
  const byId = new Map((saved ?? []).map((c) => [c.id, c]));
  const base = ILLUSTRATIVE_CANDIDATES.map((c) => ({
    ...c,
    reviewerNote: byId.get(c.id)?.reviewerNote ?? '',
    reviewQuestions: byId.get(c.id)?.reviewQuestions ?? '',
    observation: byId.get(c.id)?.observation,
  }));
  const users = (saved ?? []).filter((c) => c.dataOrigin === 'user');
  return [...base, ...users];
}

function exampleState(): Partial<SavedState> {
  return {
    candidates: [
      ...mergeIllustrative(undefined),
      {
        ...exampleLocation(),
        // Filled with the real service answer once the magnetic map is available.
        observation: buildObservation({ location: EXAMPLE_REVIEW.point, layer: 'upward', locationIsDemo: true, state: { kind: 'not-loaded' } }),
      },
    ],
    markedIds: [EXAMPLE_LOCATION_ID],
    start: EXAMPLE_REVIEW.start,
    destination: EXAMPLE_REVIEW.destination,
    waypoints: [{ ...EXAMPLE_REVIEW.point, areaId: EXAMPLE_LOCATION_ID }],
    routeOrigin: 'illustrative',
    routeReason: EXAMPLE_REVIEW.routeNote,
    showDemo: false,
    reviewPurpose: EXAMPLE_REVIEW.purpose,
    pointQueries: [],
  };
}

const pointOf = (c: CandidateArea | undefined | null): LatLon | null =>
  c && c.geometry.type === 'Point' ? { lat: c.geometry.coordinates[1], lon: c.geometry.coordinates[0] } : null;

interface SaveTarget {
  id: string;
  layer: 'upward' | 'sealevel';
  demo: boolean;
  /** 'mark': fill in a pending observation (a failure is saved as failed).
   *  'refresh': replace only on success; a failure keeps the existing observation. */
  purpose: 'mark' | 'refresh';
}

interface Props {
  session: 'user' | 'example';
  magnetic: MagneticState;
  toast: { id: number; text: string } | null;
  notify: (text: string) => void;
  onOpenExample: () => void;
  onExitExample: () => void;
}

export default function Workspace({ session, magnetic: mag, toast, notify, onOpenExample, onExitExample }: Props) {
  const isExample = session === 'example';
  const saved = useMemo(() => (isExample ? exampleState() : loadSaved()), [isExample]);
  const { magneticReady, dataMode, serviceStatus, magneticLayer } = mag;

  // Demo areas are hidden for new sessions; an explicit saved preference wins.
  const [showDemo, setShowDemo] = useState<boolean>(saved?.showDemo ?? false);
  const layers: LayerVisibility = { magnetic: mag.magneticOn, candidates: showDemo };
  const setLayers = (l: LayerVisibility) => {
    mag.setMagneticOn(l.magnetic);
    setShowDemo(l.candidates);
  };

  // ---- locations & selection ----------------------------------------------------------
  const [candidates, setCandidates] = useState<CandidateArea[]>(() =>
    isExample ? saved!.candidates! : mergeIllustrative(saved?.candidates),
  );
  const [markedIds, setMarkedIds] = useState<string[]>(saved?.markedIds ?? []);
  const [selection, setSelection] = useState<Selection>(null);
  const [probe, setProbe] = useState<Probe | null>(null);
  const probeSeq = useRef(0);
  const probeCtl = useRef<{ ctrl: AbortController; requestId: number } | null>(null);
  const saveTargets = useRef(new Map<number, SaveTarget>());
  const latestSaveFor = useRef(new Map<string, number>());
  const [savingIds, setSavingIds] = useState<string[]>([]);
  const [pointQueries, setPointQueries] = useState<PointQueryResult[]>(saved?.pointQueries ?? []);

  // ---- interaction ------------------------------------------------------------------------
  const [mode, setModeRaw] = useState<InteractionMode>('inspect');
  const [pickAreaId, setPickAreaId] = useState<string | null>(null);
  const [moveStopIndex, setMoveStopIndex] = useState<number | null>(null);
  const [mapMessage, setMapMessage] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('data');
  const [view, setView] = useState<'map' | 'summary'>('map');
  const [reviewModel, setReviewModel] = useState<ReviewModel | null>(null);
  /** Last map view, so returning from the review page keeps the user's zoom and pan. */
  const mapViewRef = useRef<MapViewState | null>(null);
  const [restoreView, setRestoreView] = useState<MapViewState | null>(null);

  // ---- route ------------------------------------------------------------------------------
  const [start, setStart] = useState<LatLon | null>(saved?.start ?? null);
  const [destination, setDestination] = useState<LatLon | null>(saved?.destination ?? null);
  const [waypoints, setWaypoints] = useState<RouteStop[]>(saved?.waypoints ?? []);
  const [routeOrigin, setRouteOrigin] = useState<'user' | 'illustrative'>(saved?.routeOrigin ?? 'user');
  const [routeReason, setRouteReason] = useState(saved?.routeReason ?? '');
  const [unit, setUnit] = useState<DistanceUnit>(saved?.unit ?? 'nmi');
  const [reviewPurpose, setReviewPurpose] = useState(saved?.reviewPurpose ?? '');

  // The example is temporary: it never writes to the user's saved work.
  useEffect(() => {
    if (isExample) return;
    saveState({
      candidates, start, destination, waypoints, routeOrigin, routeReason, unit, markedIds, showDemo, reviewPurpose, pointQueries,
    });
  }, [isExample, candidates, start, destination, waypoints, routeOrigin, routeReason, unit, markedIds, showDemo, reviewPurpose, pointQueries]);

  const setMode = useCallback((m: InteractionMode, opts: { areaId?: string; stopIndex?: number } = {}) => {
    setModeRaw(m);
    setPickAreaId(opts.areaId ?? null);
    setMoveStopIndex(opts.stopIndex ?? null);
    setMapMessage(null);
  }, []);

  // Escape: cancel placement first, otherwise close the summary or the detail panel.
  const modeRef = useRef(mode);
  const viewRef = useRef(view);
  useEffect(() => {
    modeRef.current = mode;
    viewRef.current = view;
  }, [mode, view]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (viewRef.current === 'summary') setView('map');
      else if (modeRef.current !== 'inspect') setMode('inspect');
      else setSelection(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setMode]);

  // ---- point checks against the public grid ------------------------------------------------
  const updateCandidate = useCallback((id: string, patch: Partial<CandidateArea>) => {
    setCandidates((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  /** Writes a finished request into the location it was saved for, if it is still the latest one for it. */
  const resolveSave = useCallback(
    (requestId: number, location: LatLon, state: ObservationInput['state']) => {
      const t = saveTargets.current.get(requestId);
      if (!t) return;
      saveTargets.current.delete(requestId);
      if (latestSaveFor.current.get(t.id) !== requestId) return;
      latestSaveFor.current.delete(t.id);
      setSavingIds((ids) => ids.filter((x) => x !== t.id));
      if (t.purpose === 'refresh' && state.kind === 'failed') {
        notify("Couldn't refresh. The saved observation was kept.");
        return;
      }
      const observation = buildObservation({ location, layer: t.layer, locationIsDemo: t.demo, state });
      setCandidates((cs) => cs.map((c) => (c.id === t.id ? { ...c, observation } : c)));
      if (t.purpose === 'refresh') notify('Saved observation updated');
    },
    [notify],
  );

  /** Cancels the request on screen, unless its result still has to be saved to a marked location. */
  const abortCurrentProbe = () => {
    const cur = probeCtl.current;
    if (cur && !saveTargets.current.has(cur.requestId)) cur.ctrl.abort();
    probeCtl.current = null;
  };

  const runProbe = useCallback(
    async (p: LatLon, target?: SaveTarget) => {
      abortCurrentProbe(); // a newer click supersedes any request still in flight
      const ctrl = new AbortController();
      const requestId = ++probeSeq.current;
      probeCtl.current = { ctrl, requestId };
      if (target) {
        saveTargets.current.set(requestId, target);
        latestSaveFor.current.set(target.id, requestId);
        setSavingIds((ids) => (ids.includes(target.id) ? ids : [...ids, target.id]));
      }
      setProbe({ requestId, location: p, status: 'loading' });
      try {
        const result = await identifyAt(p, ctrl.signal);
        if (ctrl.signal.aborted) return;
        setPointQueries((qs) => [...qs, result]);
        setProbe((cur) => acceptProbe(cur, requestId, { status: 'done', result }));
        resolveSave(requestId, p, { kind: 'result', result });
      } catch (e) {
        if (ctrl.signal.aborted) return; // superseded by a newer selection: not a failure
        const error = e instanceof Error ? e.message : String(e);
        setProbe((cur) => acceptProbe(cur, requestId, { status: 'error', error }));
        resolveSave(requestId, p, { kind: 'failed', reason: error });
      }
    },
    [resolveSave],
  );

  const markedSet = useMemo(() => new Set(candidates.filter((c) => isMarkedCandidate(c, markedIds)).map((c) => c.id)), [candidates, markedIds]);

  const select = useCallback(
    (s: Selection) => {
      setSelection(s);
      abortCurrentProbe();
      setProbe(null);
      if (!s || !magneticReady) return;
      if (s.kind === 'point') return void runProbe(s.location);
      const c = candidates.find((x) => x.id === s.id);
      const p = pointOf(c);
      // A marked location shows its saved observation; refreshing it is an explicit action.
      if (p && !markedSet.has(s.id)) runProbe(p);
    },
    [magneticReady, runProbe, candidates, markedSet],
  );

  /** The observation to save right now for point p, from what is on screen. */
  const observationNow = (p: LatLon, id: string, demo: boolean): CandidateArea['observation'] => {
    const layer = anomalyLayerFor(magneticLayer);
    const base = { location: p, layer, locationIsDemo: demo };
    if (!magneticReady) {
      return buildObservation({
        ...base,
        state: dataMode === 'public' && serviceStatus === 'unavailable' ? { kind: 'failed', reason: 'The magnetic map could not be loaded' } : { kind: 'not-loaded' },
      });
    }
    const same = probe && probe.location.lat === p.lat && probe.location.lon === p.lon;
    if (same && probe.status === 'done' && probe.result) return buildObservation({ ...base, state: { kind: 'result', result: probe.result } });
    if (same && probe.status === 'error') return buildObservation({ ...base, state: { kind: 'failed', reason: probe.error ?? 'Request failed' } });
    // Still loading (or no request yet): save as pending and fill it in when the answer arrives.
    const target: SaveTarget = { id, layer, demo, purpose: 'mark' };
    if (same && probe.status === 'loading') {
      saveTargets.current.set(probe.requestId, target);
      latestSaveFor.current.set(id, probe.requestId);
      setSavingIds((ids) => [...ids, id]);
    } else {
      queueMicrotask(() => runProbe(p, target));
    }
    return buildObservation({ ...base, state: { kind: 'pending' } });
  };

  // ---- marking for review (never changes the route) -----------------------------------------
  const markPoint = (p: LatLon, note: string) => {
    const seq = nextSeq(candidates);
    const id = `user-${Date.now().toString(36)}`;
    const c: CandidateArea = {
      id,
      seq,
      label: defaultLocationName(seq),
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      dataOrigin: 'user',
      sourceName: null,
      sourceUrl: null,
      reasonForReview: 'Marked by a reviewer.',
      resolution: null,
      referenceElevation: null,
      magneticValue: null,
      magneticUnit: null,
      mapErrorEstimate: null,
      limitations: ['Marked by a reviewer. Not derived from or checked against data.'],
      reviewerNote: note,
      reviewQuestions: '',
      validationStatus: 'Requires validation',
      observation: observationNow(p, id, false),
    };
    setCandidates((cs) => [...cs, c]);
    setSelection({ kind: 'candidate', id: c.id });
    notify(`Marked as ${c.label}`);
  };

  /** Marks a demo or example entry. Point entries save their observation too; areas have none. */
  const markCandidate = (id: string, note: string) => {
    const c = candidates.find((x) => x.id === id);
    if (!c) return;
    const p = pointOf(c);
    updateCandidate(id, { reviewerNote: note, ...(p ? { observation: observationNow(p, id, true) } : {}) });
    setMarkedIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
    notify('Marked for review');
  };

  const unmark = (id: string) => {
    setMarkedIds((ids) => ids.filter((x) => x !== id));
    notify('Removed from review');
  };

  const refreshObservation = useCallback(
    (id: string) => {
      const c = candidates.find((x) => x.id === id);
      const p = pointOf(c);
      if (!c || !p || !magneticReady) return;
      const demo = c.dataOrigin !== 'user';
      const purpose = c.observation && (c.observation.status === 'value' || c.observation.status === 'no-value') ? 'refresh' : 'mark';
      runProbe(p, { id, layer: anomalyLayerFor(magneticLayer), demo, purpose });
    },
    [candidates, magneticReady, magneticLayer, runProbe],
  );

  // The example queries the real value at its point once the magnetic map is available.
  const exampleQueried = useRef(false);
  useEffect(() => {
    if (!isExample || !magneticReady || exampleQueried.current) return;
    const ex = candidates.find((c) => c.id === EXAMPLE_LOCATION_ID);
    if (!ex || (ex.observation && ex.observation.status !== 'not-loaded')) return;
    const t = setTimeout(() => {
      exampleQueried.current = true;
      refreshObservation(EXAMPLE_LOCATION_ID);
    }, 0);
    return () => clearTimeout(t);
  }, [isExample, magneticReady, candidates, refreshObservation]);

  const removeCandidate = (id: string) => {
    setCandidates((cs) => cs.filter((c) => !(c.id === id && c.dataOrigin === 'user')));
    // Stops placed at a removed location keep their position but lose the link.
    setWaypoints((w) => w.map((x) => (x.areaId === id ? { ...x, areaId: null } : x)));
    setSelection((s) => (s?.kind === 'candidate' && s.id === id ? null : s));
    notify('Location removed');
  };

  // ---- route ----------------------------------------------------------------------------------
  const addStop = useCallback(
    (stop: RouteStop) => {
      setWaypoints((w) => {
        notify(`Stop ${w.length + 1} added`);
        return [...w, stop];
      });
    },
    [notify],
  );

  /** Adds a marked location as a stop. An area asks for the exact point inside it. */
  const addLocationToRoute = (id: string) => {
    const c = candidates.find((x) => x.id === id);
    if (!c || !start || !destination) return;
    const p = pointOf(c);
    if (p) addStop({ ...p, areaId: c.id });
    else {
      setTab('route');
      setMode('area-stop', { areaId: c.id });
    }
  };

  const setEndpoint = (which: 'start' | 'destination', p: LatLon) => {
    if (which === 'start') setStart(p);
    else setDestination(p);
    setRouteOrigin('user');
    notify(which === 'start' ? 'Start set' : 'Destination set');
  };

  const onMapClick = useCallback(
    (p: LatLon) => {
      switch (mode) {
        case 'start':
        case 'destination':
          if (mode === 'start') setStart(p);
          else setDestination(p);
          setRouteOrigin('user');
          notify(mode === 'start' ? 'Start set' : 'Destination set');
          setMode('inspect');
          break;
        case 'stop':
          addStop({ ...p, areaId: null });
          break;
        case 'move-stop':
          if (moveStopIndex !== null) {
            setWaypoints((w) => w.map((x, k) => (k === moveStopIndex ? { ...p, areaId: null } : x)));
            notify(`Stop ${moveStopIndex + 1} moved`);
          }
          setMode('inspect');
          break;
        case 'area-stop':
        case 'area-probe': {
          const area = candidates.find((c) => c.id === pickAreaId);
          if (!area || area.geometry.type !== 'Polygon') return setMode('inspect');
          if (!pointInPolygon(p, area.geometry)) {
            setMapMessage(`That point is outside ${area.label}. Choose a point inside it.`);
            return;
          }
          if (mode === 'area-stop') addStop({ ...p, areaId: area.id });
          else runProbe(p);
          setMode('inspect');
          break;
        }
        default:
          select({ kind: 'point', location: p });
      }
    },
    [mode, moveStopIndex, pickAreaId, candidates, addStop, runProbe, select, setMode, notify],
  );

  const referenceMeters = start && destination ? pathLengthMeters([start, destination]) : null;
  const alternativeMeters =
    start && destination && waypoints.length > 0 ? pathLengthMeters([start, ...waypoints, destination]) : null;

  const clearRoute = () => {
    setStart(null);
    setDestination(null);
    setWaypoints([]);
    setMode('inspect');
    notify('Route cleared');
  };

  const resetAll = () => {
    clearSaved();
    setCandidates(mergeIllustrative(undefined));
    setMarkedIds([]);
    setStart(null);
    setDestination(null);
    setWaypoints([]);
    setRouteReason('');
    setReviewPurpose('');
    setPointQueries([]);
    setSelection(null);
    setProbe(null);
    setShowDemo(false);
    setMode('inspect');
    notify('All work cleared');
  };

  const hasSomethingToSave =
    !!(start || destination) ||
    markedSet.size > 0 ||
    candidates.some((c) => c.reviewerNote.trim() || (c.reviewQuestions ?? '').trim()) ||
    routeReason.trim() !== '';

  const activeLayer = magneticReady && mag.magneticOn ? magneticLayer : null;

  const downloadReviewJson = () => {
    const review = buildReview({
      dataMode,
      publicServiceStatus: serviceStatus,
      activeMagneticLayer: activeLayer,
      start,
      destination,
      waypoints,
      demoAreasVisible: showDemo,
      markedIds,
      routeOrigin,
      referenceMeters,
      alternativeMeters,
      routeEvaluationReason: routeReason,
      candidates,
      pointQueries,
      reviewPurpose,
      isExample,
    });
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const name = `odyssey-${isExample ? 'example-' : ''}review-${stamp}.json`;
    downloadJson(review, name);
    notify(`Saved ${name}`);
  };

  const openSummary = () => {
    setMode('inspect');
    setReviewModel(
      buildReviewModel({
        createdAt: new Date(),
        dataMode,
        magneticReady,
        activeLayer,
        start,
        destination,
        waypoints,
        referenceMeters,
        alternativeMeters,
        unit,
        routeOrigin,
        routeNote: routeReason,
        candidates,
        markedIds,
        pointQueries,
        showDemoAreas: showDemo,
        isExample,
      }),
    );
    setRestoreView(mapViewRef.current);
    setView('summary');
    window.scrollTo(0, 0);
  };

  const selectedCandidate =
    selection?.kind === 'candidate' ? candidates.find((c) => c.id === selection.id) ?? null : null;
  const pickArea = pickAreaId ? candidates.find((c) => c.id === pickAreaId) ?? null : null;

  if (view === 'summary' && reviewModel) {
    return (
      <ReviewSummary
        model={reviewModel}
        purpose={reviewPurpose}
        setPurpose={setReviewPurpose}
        legendImages={mag.legendImages}
        onBack={() => setView('map')}
        onDownloadJson={downloadReviewJson}
      />
    );
  }

  return (
    <div className="app">
      <Header dataMode={dataMode} serviceStatus={serviceStatus} layerOn={mag.magneticOn} onRetry={mag.loadMagnetic} />
      {isExample && (
        <div className="example-bar" role="region" aria-label="Example review">
          <p>
            <strong>Example review.</strong> The route, review location, and note are illustrative. Your own work is
            saved separately and is not changed.
          </p>
          <button className="btn btn-on-dark small" onClick={onExitExample}>
            Return to my work
          </button>
        </div>
      )}
      <div className="workspace">
        <Sidebar
          tab={tab}
          setTab={setTab}
          isExample={isExample}
          onOpenExample={onOpenExample}
          dataMode={dataMode}
          serviceStatus={serviceStatus}
          serviceError={mag.serviceError}
          onLoad={mag.loadMagnetic}
          onContinueWithout={() => {
            mag.continueWithoutMagnetic();
            abortCurrentProbe();
            setProbe(null);
          }}
          magneticLayer={magneticLayer}
          setMagneticLayer={mag.setMagneticLayer}
          magneticOpacity={mag.magneticOpacity}
          setMagneticOpacity={mag.setMagneticOpacity}
          layers={layers}
          setLayers={setLayers}
          candidates={candidates}
          markedIds={markedIds}
          selectedId={selection?.kind === 'candidate' ? selection.id : null}
          onSelectCandidate={(id) => select({ kind: 'candidate', id })}
          onInspectPoint={(p) => select({ kind: 'point', location: p })}
          onResetAll={resetAll}
          mode={mode}
          moveStopIndex={moveStopIndex}
          setMode={setMode}
          start={start}
          destination={destination}
          setStart={(p) => setEndpoint('start', p)}
          setDestination={(p) => setEndpoint('destination', p)}
          waypoints={waypoints}
          removeWaypoint={(i) => {
            setWaypoints((w) => w.filter((_, k) => k !== i));
            notify(`Stop ${i + 1} removed`);
          }}
          onAddLocationToRoute={addLocationToRoute}
          clearRoute={clearRoute}
          routeOrigin={routeOrigin}
          referenceMeters={referenceMeters}
          alternativeMeters={alternativeMeters}
          unit={unit}
          setUnit={setUnit}
          routeReason={routeReason}
          setRouteReason={setRouteReason}
          canSave={hasSomethingToSave}
          onOpenSummary={openSummary}
          onDownloadJson={downloadReviewJson}
        />
        <main className="map-area">
          <MapView
            dataMode={dataMode}
            serviceStatus={serviceStatus}
            metaReady={mag.metaReady}
            magneticLayer={magneticLayer}
            magneticOpacity={mag.magneticOpacity}
            layers={layers}
            legendImages={mag.legendImages}
            candidates={candidates}
            markedIds={markedIds}
            selection={selection}
            probe={probe}
            mode={mode}
            pickArea={pickArea}
            moveStopIndex={moveStopIndex}
            mapMessage={mapMessage}
            panelOpen={!!selection}
            initialView={restoreView}
            onViewChange={(v) => {
              mapViewRef.current = v;
            }}
            setMode={setMode}
            onMapClick={onMapClick}
            onSelectCandidate={(id) => select({ kind: 'candidate', id })}
            onOverlayError={mag.onOverlayError}
            onOverlayLoaded={mag.onOverlayLoaded}
            start={start}
            destination={destination}
            waypoints={waypoints}
            setStart={setStart}
            setDestination={setDestination}
            setWaypoint={(i, p) =>
              setWaypoints((w) =>
                w.map((x, k) => {
                  if (k !== i) return x;
                  // Keep an area link only while the dragged stop is still inside that area.
                  const area = x.areaId ? candidates.find((c) => c.id === x.areaId) : undefined;
                  const stillInside = area?.geometry.type === 'Polygon' && pointInPolygon(p, area.geometry);
                  return { ...p, areaId: stillInside ? x.areaId : null };
                }),
              )
            }
          />
          {selection && (
            <DetailPanel
              key={selection.kind === 'candidate' ? selection.id : `${selection.location.lat},${selection.location.lon}`}
              selection={selection}
              candidate={selectedCandidate}
              probe={probe}
              magneticLayer={magneticLayer}
              magneticReady={magneticReady}
              magneticFailed={dataMode === 'public' && serviceStatus === 'unavailable'}
              marked={selectedCandidate ? markedSet.has(selectedCandidate.id) : false}
              saving={selectedCandidate ? savingIds.includes(selectedCandidate.id) : false}
              demoHidden={!!selectedCandidate && selectedCandidate.dataOrigin === 'illustrative' && !selectedCandidate.example && !showDemo}
              linkedStops={
                selectedCandidate
                  ? waypoints.map((w, n) => (w.areaId === selectedCandidate.id ? n + 1 : null)).filter((x): x is number => x !== null)
                  : []
              }
              routeReady={!!(start && destination)}
              onClose={() => setSelection(null)}
              onRename={(id, label) => updateCandidate(id, { label })}
              onUpdateNote={(id, reviewerNote) => updateCandidate(id, { reviewerNote })}
              onRemove={(id) => (selectedCandidate?.dataOrigin === 'user' ? removeCandidate(id) : unmark(id))}
              onMarkPoint={markPoint}
              onMarkCandidate={markCandidate}
              onAddToRoute={addLocationToRoute}
              onOpenRoute={() => setTab('route')}
              onRefresh={refreshObservation}
              onProbe={(p) => runProbe(p)}
              onPickInArea={(areaId) => setMode('area-probe', { areaId })}
            />
          )}
          <Toast toast={toast} />
        </main>
      </div>
    </div>
  );
}
