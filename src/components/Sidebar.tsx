import { useId, useRef, useState, type KeyboardEvent } from 'react';
import type { CandidateArea, DataMode, LatLon, RouteStop } from '../data/types';
import type { InteractionMode, LayerVisibility, TabKey } from './Workspace';
import type { ServiceStatus } from '../lib/status';
import {
  EMAG_DOI_URL, EMAG_GRID_SPACING, EMAG_GRID_SPACING_NOTE, EMAG_LATEST_GRID_FILE, EMAG_LAYERS, EMAG_PRODUCT_URL, EMAG_README_URL, EMAG_VERSION,
  type EmagLayerKey,
} from '../data/emag2v3';
import { routeDistanceSummary, type DistanceUnit } from '../lib/geodesy';
import { isMarkedCandidate, REVIEW_LIMITATIONS } from '../lib/reviewModel';
import { shortLatLon } from '../lib/format';
import { IconEdit, IconLayers, IconPlus, IconRefresh, IconSave, IconTrash } from './Icons';

interface Props {
  tab: TabKey;
  setTab: (t: TabKey) => void;
  isExample: boolean;
  onOpenExample: () => void;
  dataMode: DataMode;
  serviceStatus: ServiceStatus;
  serviceError: string | null;
  onLoad: () => void;
  onContinueWithout: () => void;
  magneticLayer: EmagLayerKey;
  setMagneticLayer: (k: EmagLayerKey) => void;
  magneticOpacity: number;
  setMagneticOpacity: (v: number) => void;
  layers: LayerVisibility;
  setLayers: (l: LayerVisibility) => void;
  candidates: CandidateArea[];
  markedIds: string[];
  selectedId: string | null;
  onSelectCandidate: (id: string) => void;
  onInspectPoint: (p: LatLon) => void;
  onResetAll: () => void;
  mode: InteractionMode;
  moveStopIndex: number | null;
  setMode: (m: InteractionMode, opts?: { areaId?: string; stopIndex?: number }) => void;
  start: LatLon | null;
  destination: LatLon | null;
  setStart: (p: LatLon) => void;
  setDestination: (p: LatLon) => void;
  waypoints: RouteStop[];
  removeWaypoint: (i: number) => void;
  onAddLocationToRoute: (id: string) => void;
  clearRoute: () => void;
  routeOrigin: 'user' | 'illustrative';
  referenceMeters: number | null;
  alternativeMeters: number | null;
  unit: DistanceUnit;
  setUnit: (u: DistanceUnit) => void;
  routeReason: string;
  setRouteReason: (s: string) => void;
  canSave: boolean;
  onOpenSummary: () => void;
  onDownloadJson: () => void;
}

const LAYER_OPTION_LABEL: Record<EmagLayerKey, string> = {
  upward: 'Anomaly at 4 km altitude',
  sealevel: 'Anomaly at sea level',
  error: 'Map error estimate',
};

const TABS: { key: TabKey; label: string }[] = [
  { key: 'data', label: 'Map data' },
  { key: 'route', label: 'Plan route' },
];

const kindLabel = (c: CandidateArea) => (c.dataOrigin === 'user' ? '' : c.example ? 'Example' : 'Demo');

export default function Sidebar(p: Props) {
  const tabRefs = useRef<Record<TabKey, HTMLButtonElement | null>>({ data: null, route: null });
  const onTabKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const next: TabKey = p.tab === 'data' ? 'route' : 'data';
    p.setTab(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <aside className="sidebar" aria-label="Planning tools">
      <div className="tabs" role="tablist" aria-label="Sidebar" onKeyDown={onTabKey}>
        {TABS.map((t) => (
          <button
            key={t.key}
            ref={(el) => {
              tabRefs.current[t.key] = el;
            }}
            id={`tab-${t.key}`}
            role="tab"
            aria-selected={p.tab === t.key}
            aria-controls={`panel-${t.key}`}
            tabIndex={p.tab === t.key ? 0 : -1}
            className={p.tab === t.key ? 'active' : ''}
            onClick={() => p.setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Both panels stay mounted so typed text and open settings survive tab switches. */}
      <div className="tab-panels">
        <div id="panel-data" role="tabpanel" aria-labelledby="tab-data" hidden={p.tab !== 'data'} className="tab-panel">
          <MapDataTab {...p} />
        </div>
        <div id="panel-route" role="tabpanel" aria-labelledby="tab-route" hidden={p.tab !== 'route'} className="tab-panel">
          <PlanRouteTab {...p} />
        </div>
      </div>

      <SidebarFooter {...p} />
    </aside>
  );
}

/* ============================== Map data ============================== */

/** One short instruction for where the user is in the workflow. */
function nextInstruction(loaded: boolean, markedCount: number, markedInRoute: boolean): string | null {
  if (markedCount > 0 && !markedInRoute) return 'Open Plan route to compare a route through your marked location.';
  if (!loaded) return 'Explore magnetic data and prepare a route option for review.';
  if (markedCount === 0) return 'Select a point on the map to inspect its data.';
  return null;
}

function MapDataTab(p: Props) {
  const loaded = p.dataMode === 'public' && p.serviceStatus === 'available';
  const loading = p.dataMode === 'public' && p.serviceStatus === 'loading';
  const failed = p.dataMode === 'public' && p.serviceStatus === 'unavailable';
  const marked = p.candidates.filter((c) => isMarkedCandidate(c, p.markedIds));
  const unmarkedDemos = p.candidates.filter((c) => c.dataOrigin === 'illustrative' && !c.example && !p.markedIds.includes(c.id));
  const markedIds = new Set(marked.map((c) => c.id));
  const markedInRoute = p.waypoints.some((w) => w.areaId && markedIds.has(w.areaId));
  const instruction = nextInstruction(loaded, marked.length, markedInRoute);
  const stage3 = marked.length > 0 && !markedInRoute;

  const showIntro = !!instruction || stage3 || !loaded || !p.isExample;

  return (
    <>
      {showIntro && <div className="block intro">
        {instruction && <p className="instruction">{instruction}</p>}
        {stage3 && (
          <button className="btn btn-primary full" onClick={() => p.setTab('route')}>
            Open Plan route
          </button>
        )}
        {!loaded &&
          (failed ? (
            <div className="inline-error" role="alert">
              <p>Couldn't load the magnetic map. Nothing has been substituted.</p>
              <div className="row gap">
                <button className="btn btn-primary" onClick={p.onLoad}>
                  <IconRefresh /> Try again
                </button>
                <button className="btn-text" onClick={p.onContinueWithout}>
                  Continue without it
                </button>
              </div>
            </div>
          ) : (
            <button className={`btn full ${stage3 ? 'btn-secondary' : 'btn-primary'}`} onClick={p.onLoad} disabled={loading}>
              {loading ? (
                <>
                  <span className={`spinner ${stage3 ? 'dark' : ''}`} aria-hidden="true" /> Loading magnetic map…
                </>
              ) : (
                <>
                  <IconLayers /> Load magnetic map
                </>
              )}
            </button>
          ))}
        {!p.isExample && (
          <p className="example-link">
            <button className="btn-text" onClick={p.onOpenExample}>
              Open example
            </button>
            <span className="muted"> · opens separately; your work is kept</span>
          </p>
        )}
      </div>}

      {loaded && (
        <div className="block">
          <Toggle label="Magnetic layer" checked={p.layers.magnetic} onChange={(v) => p.setLayers({ ...p.layers, magnetic: v })} />
          <details className="disclosure">
            <summary>Layer settings</summary>
            <div className="settings">
              <label className="setting">
                <span>Show</span>
                <select value={p.magneticLayer} onChange={(e) => p.setMagneticLayer(e.target.value as EmagLayerKey)}>
                  {(Object.keys(EMAG_LAYERS) as EmagLayerKey[]).map((k) => (
                    <option key={k} value={k}>
                      {LAYER_OPTION_LABEL[k]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="setting">
                <span>Opacity</span>
                <span className="range-wrap">
                  <input
                    type="range"
                    min={0.2}
                    max={1}
                    step={0.05}
                    value={p.magneticOpacity}
                    onChange={(e) => p.setMagneticOpacity(Number(e.target.value))}
                    aria-valuetext={`${Math.round(p.magneticOpacity * 100)} percent`}
                  />
                  <output>{Math.round(p.magneticOpacity * 100)}%</output>
                </span>
              </label>
              <p className="block-text muted">Marked locations keep the value saved when they were marked. Use Refresh in a location's panel to update it.</p>
            </div>
          </details>
        </div>
      )}

      <div className="block">
        <h2 className="block-title small">Locations for review</h2>
        {marked.length === 0 ? (
          <p className="block-text muted">None yet. Select a point on the map, then choose Mark for review.</p>
        ) : (
          <ul className="item-list">
            {marked.map((c) => {
              const hidden = c.dataOrigin === 'illustrative' && !c.example && !p.layers.candidates;
              return (
                <li key={c.id}>
                  <button
                    className={`item ${p.selectedId === c.id ? 'selected' : ''}`}
                    aria-current={p.selectedId === c.id}
                    onClick={() => p.onSelectCandidate(c.id)}
                  >
                    <span className={`swatch ${c.dataOrigin === 'user' ? 'user' : 'demo'}`} aria-hidden="true" />
                    <span className="item-name">{c.label}</span>
                    <span className="item-meta">
                      {[kindLabel(c), hidden ? 'hidden on map' : ''].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <details className="disclosure">
          <summary>Inspect by coordinates</summary>
          <CoordForm label="Point" value={null} onSet={p.onInspectPoint} submitLabel="Inspect" />
        </details>
      </div>

      <div className="block">
        <Toggle
          label="Show demo areas"
          hint="Fictional examples, hidden by default"
          checked={p.layers.candidates}
          onChange={(v) => p.setLayers({ ...p.layers, candidates: v })}
        />
        {p.layers.candidates && unmarkedDemos.length > 0 && (
          <ul className="item-list">
            {unmarkedDemos.map((c) => (
              <li key={c.id}>
                <button
                  className={`item ${p.selectedId === c.id ? 'selected' : ''}`}
                  aria-current={p.selectedId === c.id}
                  onClick={() => p.onSelectCandidate(c.id)}
                >
                  <span className="swatch demo" aria-hidden="true" />
                  <span className="item-name">{c.label}</span>
                  <span className="item-meta">Demo</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="block">
        <details className="disclosure">
          <summary>Data details</summary>
          <DataDetails onResetAll={p.isExample ? null : p.onResetAll} />
        </details>
      </div>
    </>
  );
}

function DataDetails({ onResetAll }: { onResetAll: (() => void) | null }) {
  return (
    <div className="details-body">
      <dl className="kv">
        <dt>Source</dt>
        <dd>
          <a href={EMAG_PRODUCT_URL} target="_blank" rel="noreferrer">
            NOAA NCEI EMAG2v3
          </a>{' '}
          (
          <a href={EMAG_DOI_URL} target="_blank" rel="noreferrer">
            DOI
          </a>
          )
        </dd>
        <dt>Version</dt>
        <dd>{EMAG_VERSION}. Newest grid file: {EMAG_LATEST_GRID_FILE}.</dd>
        <dt>Grid spacing</dt>
        <dd>{EMAG_GRID_SPACING}. {EMAG_GRID_SPACING_NOTE}</dd>
        <dt>Units</dt>
        <dd>nanotesla (nT)</dd>
        <dt>Reference</dt>
        <dd>4 km above the WGS84 ellipsoid, or sea level (ocean and coastal areas)</dd>
        <dt>Error estimate</dt>
        <dd>Published map error in nT. Not vehicle position error.</dd>
        <dt>Missing data</dt>
        <dd>Gray on the map; “No value at this point” when you select it. Not every location has a value.</dd>
        <dt>Source IDs</dt>
        <dd>Meaning from the <a href={EMAG_README_URL} target="_blank" rel="noreferrer">NCEI format file</a>.</dd>
        <dt>Demo areas</dt>
        <dd>Fictional examples with no source or measurements.</dd>
        <dt>Land</dt>
        <dd>Natural Earth 1:50m outlines.</dd>
      </dl>
      <h3 className="details-heading">Limitations</h3>
      <ul className="plain-list">
        <li>A magnetic anomaly is not automatically a usable navigation checkpoint.</li>
        <li>No quality score is derived from anomaly strength.</li>
        {REVIEW_LIMITATIONS.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
      {onResetAll && (
        <ConfirmAction
          label="Clear all my work"
          question="Clear the route, your marked locations, notes, and review purpose?"
          confirmLabel="Clear"
          onConfirm={onResetAll}
        />
      )}
    </div>
  );
}

/* ============================== Plan route ============================== */

function PlanRouteTab(p: Props) {
  const routeReady = !!(p.start && p.destination);
  const nameOf = (id: string | null | undefined) => p.candidates.find((c) => c.id === id)?.label;
  const stopsWord = `${p.waypoints.length} stop${p.waypoints.length === 1 ? '' : 's'}`;
  const marked = p.candidates.filter((c) => isMarkedCandidate(c, p.markedIds));

  return (
    <>
      <div className="block endpoints">
        <EndpointField
          step={1}
          label="Start"
          value={p.start}
          picking={p.mode === 'start'}
          isNext={!p.start}
          onPick={() => p.setMode(p.mode === 'start' ? 'inspect' : 'start')}
        />
        <EndpointField
          step={2}
          label="Destination"
          value={p.destination}
          picking={p.mode === 'destination'}
          isNext={!!p.start && !p.destination}
          onPick={() => p.setMode(p.mode === 'destination' ? 'inspect' : 'destination')}
        />
        {p.routeOrigin === 'illustrative' && p.start && <p className="block-text muted">Example points (illustrative).</p>}
        <details className="disclosure">
          <summary>Enter coordinates</summary>
          <CoordForm key={`s${p.start?.lat},${p.start?.lon}`} label="Start" value={p.start} onSet={p.setStart} />
          <CoordForm key={`d${p.destination?.lat},${p.destination?.lon}`} label="Destination" value={p.destination} onSet={p.setDestination} />
        </details>
      </div>

      <div className="block">
        <h2 className="step-title">
          <span className="step-num" aria-hidden="true">3</span> Add a stop <span className="optional">(optional)</span>
        </h2>
        {!routeReady ? (
          <p className="block-text muted">Choose a start and destination first.</p>
        ) : (
          <>
            {marked.length === 0 ? (
              <p className="block-text muted">Mark a location in Map data to add it here.</p>
            ) : (
              <ul className="pick-list" aria-label="Marked locations">
                {marked.map((c) => {
                  const stops = p.waypoints.map((w, n) => (w.areaId === c.id ? n + 1 : null)).filter((x): x is number => x !== null);
                  const isArea = c.geometry.type === 'Polygon';
                  const choosing = p.mode === 'area-stop';
                  return (
                    <li key={c.id}>
                      <span className={`swatch ${c.dataOrigin === 'user' ? 'user' : 'demo'}`} aria-hidden="true" />
                      <span className="pick-name">
                        {c.label}
                        {kindLabel(c) && <span className="item-meta"> · {kindLabel(c)}</span>}
                      </span>
                      {stops.length > 0 && !isArea ? (
                        <span className="item-meta">Stop {stops.join(', ')}</span>
                      ) : (
                        <button
                          className="btn btn-secondary small"
                          disabled={choosing}
                          onClick={() => p.onAddLocationToRoute(c.id)}
                          aria-label={`Add ${c.label} to the route${isArea ? ' (choose a point inside)' : ''}`}
                        >
                          <IconPlus /> {isArea ? 'Add…' : 'Add'}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <button
              className="btn-text"
              aria-pressed={p.mode === 'stop'}
              onClick={() => p.setMode(p.mode === 'stop' ? 'inspect' : 'stop')}
            >
              {p.mode === 'stop' ? 'Done placing stops' : 'Or place a stop on the map'}
            </button>

            {p.waypoints.length > 0 && (
              <ol className="stop-list" aria-label="Stops">
                {p.waypoints.map((w, i) => {
                  const moving = p.mode === 'move-stop' && p.moveStopIndex === i;
                  return (
                    <li key={i} className={moving ? 'moving' : ''}>
                      <span className="stop-badge" aria-hidden="true">
                        {i + 1}
                      </span>
                      <span className="stop-text">
                        Stop {i + 1}
                        <span className="stop-sub">
                          {moving ? 'Choose the new position on the map' : w.areaId ? `At ${nameOf(w.areaId) ?? 'a marked location'}` : shortLatLon(w)}
                        </span>
                      </span>
                      <span className="row-actions">
                        <button
                          className="btn-text"
                          onClick={() => (moving ? p.setMode('inspect') : p.setMode('move-stop', { stopIndex: i }))}
                          aria-label={moving ? `Cancel moving stop ${i + 1}` : `Move stop ${i + 1}`}
                        >
                          {moving ? (
                            'Cancel'
                          ) : (
                            <>
                              <IconEdit /> Move
                            </>
                          )}
                        </button>
                        <button className="btn-text" onClick={() => p.removeWaypoint(i)} aria-label={`Remove stop ${i + 1}`}>
                          <IconTrash /> Remove
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </>
        )}
      </div>

      {routeReady && (
        <div className="block">
          <details className="disclosure" open={p.routeReason !== '' ? true : undefined}>
            <summary>Route note</summary>
            <label className="field">
              <span className="sr-only">Route note</span>
              <textarea
                rows={3}
                value={p.routeReason}
                onChange={(e) => p.setRouteReason(e.target.value)}
                placeholder="What should a reviewer know about this route option?"
              />
            </label>
          </details>
        </div>
      )}

      {(p.start || p.destination) && (
        <div className="block">
          <ConfirmAction
            label="Clear route"
            question={`Clear the start, destination${p.waypoints.length ? ` and ${stopsWord}` : ''}? Marked locations are kept.`}
            confirmLabel="Clear route"
            onConfirm={p.clearRoute}
          />
        </div>
      )}
    </>
  );
}

function EndpointField(props: { step: number; label: string; value: LatLon | null; picking: boolean; isNext: boolean; onPick: () => void }) {
  const lower = props.label.toLowerCase();
  return (
    <div className={`endpoint ${props.value ? 'set' : ''}`}>
      <span className="step-num" aria-hidden="true">{props.step}</span>
      <div className="endpoint-main">
        <span className="endpoint-label">{props.label}</span>
        {props.picking ? (
          <span className="endpoint-value picking">Choosing on the map…</span>
        ) : (
          props.value && <span className="endpoint-value">{shortLatLon(props.value)}</span>
        )}
      </div>
      {props.value ? (
        <button className="btn-text" onClick={props.onPick} aria-label={props.picking ? `Cancel editing ${lower}` : `Edit ${lower}`}>
          {props.picking ? (
            'Cancel'
          ) : (
            <>
              <IconEdit /> Edit
            </>
          )}
        </button>
      ) : (
        <button
          className={`btn ${!props.picking && props.isNext ? 'btn-primary' : 'btn-secondary'}`}
          onClick={props.onPick}
          aria-label={props.picking ? `Cancel choosing ${lower}` : `Choose ${lower} on map`}
        >
          {props.picking ? 'Cancel' : 'Choose on map'}
        </button>
      )}
    </div>
  );
}

function CoordForm(props: { label: string; value: LatLon | null; onSet: (p: LatLon) => void; submitLabel?: string }) {
  const [lat, setLat] = useState(props.value ? props.value.lat.toFixed(4) : '');
  const [lon, setLon] = useState(props.value ? props.value.lon.toFixed(4) : '');
  const id = useId();
  const latN = Number(lat);
  const lonN = Number(lon);
  const valid =
    lat.trim() !== '' && lon.trim() !== '' && Number.isFinite(latN) && Number.isFinite(lonN) && Math.abs(latN) <= 90 && Math.abs(lonN) <= 180;
  return (
    <form
      className="coord-form"
      aria-label={`${props.label} coordinates`}
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) props.onSet({ lat: latN, lon: lonN });
      }}
    >
      <span className="coord-title">{props.label}</span>
      <label htmlFor={`${id}-lat`}>Lat</label>
      <input id={`${id}-lat`} value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" placeholder="32.55" />
      <label htmlFor={`${id}-lon`}>Lon</label>
      <input id={`${id}-lon`} value={lon} onChange={(e) => setLon(e.target.value)} inputMode="decimal" placeholder="-117.60" />
      <button className="btn btn-secondary small" type="submit" disabled={!valid}>
        {props.submitLabel ?? 'Set'}
      </button>
    </form>
  );
}

/* ============================== Footer ============================== */

function SidebarFooter(p: Props) {
  const routeReady = !!(p.start && p.destination);
  const d = routeReady ? routeDistanceSummary(p.referenceMeters!, p.alternativeMeters, p.unit) : null;
  return (
    <div className="sidebar-footer">
      {d && (
        <section className="summary" aria-label="Route comparison">
          <div className="summary-head">
            <h2 className="summary-title">Route comparison</h2>
            <div className="unit-toggle" role="group" aria-label="Distance unit">
              {(['nmi', 'km'] as DistanceUnit[]).map((u) => (
                <button key={u} aria-pressed={p.unit === u} className={p.unit === u ? 'on' : ''} onClick={() => p.setUnit(u)}>
                  {u}
                </button>
              ))}
            </div>
          </div>
          <dl className="summary-rows" aria-live="polite">
            <div>
              <dt>
                <span className="line-key direct" aria-hidden="true" />
                Direct route
              </dt>
              <dd>{d.direct}</dd>
            </div>
            {d.withStops && (
              <>
                <div>
                  <dt>
                    <span className="line-key stops" aria-hidden="true" />
                    Route with stops
                  </dt>
                  <dd>{d.withStops}</dd>
                </div>
                <div className="extra">
                  <dt>Extra distance</dt>
                  <dd>{d.extra}</dd>
                </div>
              </>
            )}
          </dl>
          {!d.withStops && <p className="summary-prompt">Add a stop to compare.</p>}
          <p className="summary-note">Route sketches do not check obstacles or vehicle constraints.</p>
        </section>
      )}

      <div className="save">
        {p.canSave ? (
          <div className="save-row">
            <button className="btn btn-primary" onClick={p.onOpenSummary}>
              <IconSave /> Review summary
            </button>
            <button className="btn-text" onClick={p.onDownloadJson} aria-label="Download review as JSON file">
              Download JSON
            </button>
          </div>
        ) : (
          <p className="save-empty">Nothing to review yet. Mark a location or set a route.</p>
        )}
      </div>
    </div>
  );
}

/* ============================== Shared bits ============================== */

function Toggle(props: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <label htmlFor={id} className="toggle">
      <input id={id} type="checkbox" role="switch" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-thumb" />
      </span>
      <span className="toggle-text">
        {props.label}
        {props.hint && <span className="toggle-hint">{props.hint}</span>}
      </span>
    </label>
  );
}

/** Inline two-step confirmation (no modal) for actions that discard work. */
function ConfirmAction(props: { label: string; question: string; confirmLabel: string; onConfirm: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button className="btn-text subtle" onClick={() => setAsking(true)}>
        {props.label}
      </button>
    );
  }
  return (
    <div className="confirm" role="group" aria-label={props.label}>
      <span>{props.question}</span>
      <div className="row gap">
        <button
          className="btn btn-danger small"
          autoFocus
          onClick={() => {
            props.onConfirm();
            setAsking(false);
          }}
        >
          {props.confirmLabel}
        </button>
        <button className="btn btn-secondary small" onClick={() => setAsking(false)}>
          Keep
        </button>
      </div>
    </div>
  );
}
