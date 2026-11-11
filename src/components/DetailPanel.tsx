import { useState } from 'react';
import type { CandidateArea, LatLon, PointQueryResult, SavedObservation } from '../data/types';
import type { Selection } from './Workspace';
import {
  EMAG_DOI_URL,
  EMAG_ERROR_MEANING,
  EMAG_GRID_SPACING,
  EMAG_GRID_SPACING_NOTE,
  EMAG_LATEST_GRID_FILE,
  EMAG_LAYERS,
  EMAG_PRODUCT_URL,
  EMAG_README_URL,
  EMAG_VERSION,
  type EmagLayerKey,
} from '../data/emag2v3';
import { shortLatLon } from '../lib/format';
import { valueState, type Probe } from '../lib/probeState';
import { anomalyLayerFor, layerShortName } from '../lib/observation';
import { FURTHER_CHECKS } from '../lib/reviewModel';
import { IconCheck, IconClose, IconEdit, IconPin, IconPlus, IconRefresh } from './Icons';

interface Props {
  selection: NonNullable<Selection>;
  candidate: CandidateArea | null;
  probe: Probe | null;
  magneticLayer: EmagLayerKey;
  magneticReady: boolean;
  /** True when loading the magnetic map failed (distinct from never loaded). */
  magneticFailed?: boolean;
  marked: boolean;
  /** A request whose answer will be saved to this location is running. */
  saving: boolean;
  /** A marked demo area whose map overlay is switched off. */
  demoHidden: boolean;
  linkedStops: number[];
  routeReady: boolean;
  onClose: () => void;
  onRename: (id: string, label: string) => void;
  onUpdateNote: (id: string, note: string) => void;
  onRemove: (id: string) => void;
  onMarkPoint: (p: LatLon, note: string) => void;
  onMarkCandidate: (id: string, note: string) => void;
  onAddToRoute: (id: string) => void;
  onOpenRoute: () => void;
  onRefresh: (id: string) => void;
  onProbe: (p: LatLon) => void;
  onPickInArea: (areaId: string) => void;
}

const NOT_PROVIDED = 'Not provided by source';
const NOTE_LABEL = 'Why investigate this location?';
const NOTE_PLACEHOLDER = 'Describe what you want a technical expert to assess.';

export default function DetailPanel(p: Props) {
  const c = p.candidate;
  const isUser = c?.dataOrigin === 'user';
  const isDemo = c?.dataOrigin === 'illustrative' && !c.example;
  const isExample = !!c?.example;
  const isArea = c?.geometry.type === 'Polygon';
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);

  // The exact point this panel refers to. An area has none: the user must choose one.
  const point: LatLon | null =
    p.selection.kind === 'point'
      ? p.selection.location
      : c && c.geometry.type === 'Point'
        ? { lat: c.geometry.coordinates[1], lon: c.geometry.coordinates[0] }
        : null;

  const name = c ? c.label : 'Unmarked point';
  const tag = isUser
    ? 'Marked for review'
    : isExample
      ? `Example (illustrative)${p.marked ? ' · marked for review' : ''}`
      : isDemo
        ? `Demo ${isArea ? 'area' : 'point'} (fictional)${p.marked ? ' · marked for review' : ''}`
        : 'Not marked';
  // Saved evidence is shown for marked points; everything else shows the live query.
  const showSaved = !!c && p.marked && !isArea;

  return (
    <aside className="detail-panel" aria-label={`Selected location: ${name}`}>
      <div className="detail-head">
        <div className="detail-title">
          <p className="eyebrow">Selected location</p>
          {isUser && c ? (
            <label className="name-field">
              <span className="sr-only">Location name (editable)</span>
              <input value={c.label} onChange={(e) => p.onRename(c.id, e.target.value)} maxLength={60} />
              <IconEdit />
            </label>
          ) : (
            <h2>{name}</h2>
          )}
          <p className="detail-coords">{point ? shortLatLon(point) : isArea ? 'Area (outline shown on the map)' : ''}</p>
          <p className={`detail-status ${isUser ? 'user' : isDemo || isExample ? 'demo' : ''}`}>
            {isUser && <span className="swatch user" aria-hidden="true" />}
            {(isDemo || isExample) && <span className="swatch demo" aria-hidden="true" />}
            {tag}
          </p>
          {p.demoHidden && <p className="detail-hidden">Hidden on the map. Turn on “Show demo areas” in Map data to see it.</p>}
        </div>
        <button className="btn-text close-btn" onClick={p.onClose} aria-label="Close details">
          <IconClose /> Close
        </button>
      </div>

      <div className="detail-body">
        <section className="mag" aria-live="polite" aria-labelledby="mag-heading">
          <h3 id="mag-heading" className="section-label">Available magnetic data</h3>
          {showSaved ? (
            <SavedObservationView
              o={c!.observation}
              saving={p.saving}
              magneticReady={p.magneticReady}
              currentLayer={anomalyLayerFor(p.magneticLayer)}
              onRefresh={() => p.onRefresh(c!.id)}
            />
          ) : (
            <LiveValue {...p} point={point} />
          )}
        </section>

        <section className="note-section" aria-labelledby="note-heading">
          <h3 id="note-heading" className="section-label">Review note</h3>
          {!p.marked ? (
            <>
              <label className="field">
                <span>{NOTE_LABEL}</span>
                <textarea rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={NOTE_PLACEHOLDER} />
              </label>
              <button
                className="btn btn-primary"
                onClick={() => (c ? p.onMarkCandidate(c.id, draft.trim() ? draft : c.reviewerNote) : point && p.onMarkPoint(point, draft))}
              >
                <IconPin /> Mark for review
              </button>
              <p className="action-help">Marking saves this location and its data. It does not change the route.</p>
            </>
          ) : (
            <>
              {editing ? (
                <label className="field">
                  <span>{NOTE_LABEL}</span>
                  <textarea
                    rows={3}
                    autoFocus
                    value={c!.reviewerNote}
                    onChange={(e) => p.onUpdateNote(c!.id, e.target.value)}
                    placeholder={NOTE_PLACEHOLDER}
                  />
                </label>
              ) : (
                <div className="note-view">
                  <span className="note-label">{NOTE_LABEL}{isExample ? ' (example note, illustrative)' : ''}</span>
                  {c!.reviewerNote.trim() ? <p className="note-text">{c!.reviewerNote}</p> : <p className="note-text empty">No note yet.</p>}
                  {(c!.reviewQuestions ?? '').trim() && (
                    <>
                      <span className="note-label">Earlier open questions</span>
                      <p className="note-text">{c!.reviewQuestions}</p>
                    </>
                  )}
                </div>
              )}
              <div className="row gap">
                <AddToRoute {...p} isPointInRoute={!isArea && p.linkedStops.length > 0} isArea={!!isArea} />
                <button className="btn btn-secondary" onClick={() => setEditing(!editing)} aria-pressed={editing}>
                  {editing ? <><IconCheck /> Done</> : <><IconEdit /> Edit note</>}
                </button>
              </div>
              {!p.routeReady && (
                <p className="action-help">
                  Set a start and destination first.{' '}
                  <button className="btn-text inline" onClick={p.onOpenRoute}>Open Plan route</button>
                </p>
              )}
              {p.linkedStops.length > 0 && (
                <p className="linked">In the route as {p.linkedStops.map((n) => `Stop ${n}`).join(', ')}. This does not validate the location.</p>
              )}
              <button className="btn-text subtle remove" onClick={() => p.onRemove(c!.id)}>
                {isUser ? 'Remove location' : 'Remove from review'}
              </button>
            </>
          )}
        </section>

        <details className="disclosure">
          <summary>Data details</summary>
          <DataDetails {...p} saved={showSaved ? c!.observation ?? null : null} />
        </details>

        <details className="disclosure">
          <summary>What still needs checking</summary>
          <dl className="kv checks">
            {FURTHER_CHECKS.map((f) => (
              <div key={f.label} className="kv-row">
                <dt>{f.label}</dt>
                <dd className="na">{f.status}</dd>
              </div>
            ))}
          </dl>
          <p className="detail-text muted">This tool does not answer these questions. They are for a technical reviewer.</p>
        </details>
      </div>
    </aside>
  );
}

function AddToRoute(p: Props & { isPointInRoute: boolean; isArea: boolean }) {
  if (p.isPointInRoute) return null;
  return (
    <button className="btn btn-primary" disabled={!p.routeReady} onClick={() => p.candidate && p.onAddToRoute(p.candidate.id)}>
      <IconPlus /> {p.isArea ? 'Add to route…' : 'Add to route'}
    </button>
  );
}

/** Dataset line shown with every value, so the number always carries its context. */
function DatasetLine({ layer }: { layer: 'upward' | 'sealevel' }) {
  return (
    <dl className="mag-context">
      <dt>Dataset</dt>
      <dd>NOAA NCEI EMAG2v3 · {layerShortName(layer)}</dd>
      <dt>Reference</dt>
      <dd>{EMAG_LAYERS[layer].referenceElevation}</dd>
    </dl>
  );
}

function SavedObservationView(props: {
  o: SavedObservation | null | undefined;
  saving: boolean;
  magneticReady: boolean;
  currentLayer: 'upward' | 'sealevel';
  onRefresh: () => void;
}) {
  const { o } = props;
  const refresh = props.magneticReady && (
    <button className="btn-text" onClick={props.onRefresh} disabled={props.saving}>
      <IconRefresh /> {o && (o.status === 'value' || o.status === 'no-value') ? 'Refresh saved observation' : 'Query and save observation'}
    </button>
  );
  if (!o) {
    return (
      <div className="mag-state">
        <p><span className="state-label">No observation saved.</span> This location was marked in an earlier version.</p>
        {props.saving ? <p className="mag-state checking"><span className="spinner dark" aria-hidden="true" /> Checking this point…</p> : refresh}
      </div>
    );
  }
  const answered = o.status === 'value' || o.status === 'no-value';
  return (
    <>
      {o.status === 'value' && <strong className="value">{o.value!.toFixed(1)} {o.unit}</strong>}
      {o.status === 'no-value' && (
        <p className="mag-state"><span className="state-label">No value at this point.</span> The source has no data for this grid cell.</p>
      )}
      {o.status === 'pending' && (
        <p className="mag-state checking"><span className="spinner dark" aria-hidden="true" /> Checking this point… the answer will be saved.</p>
      )}
      {o.status === 'failed' && (
        <p className="mag-state failed"><span className="state-label">Could not retrieve.</span> {o.failureReason ?? 'The request failed'}. Saved as failed; nothing was substituted.</p>
      )}
      {o.status === 'not-loaded' && (
        <p className="mag-state"><span className="state-label">Not loaded.</span> The magnetic map was not loaded when this location was marked.</p>
      )}
      {answered && o.errorEstimateNT !== null && (
        <p className="mag-error">Source error estimate: {o.errorEstimateNT.toFixed(1)} nT <span className="muted">· map error, not position error</span></p>
      )}
      <DatasetLine layer={o.layer} />
      <p className="saved-line">
        Saved observation{o.queriedAt ? ` · queried ${new Date(o.queriedAt).toLocaleString()}` : ''}
      </p>
      {answered && o.layer !== props.currentLayer && (
        <p className="saved-line warn">The map now shows {layerShortName(props.currentLayer).toLowerCase()}. The saved value is from {layerShortName(o.layer).toLowerCase()}.</p>
      )}
      {props.saving && o.status !== 'pending' ? <p className="mag-state checking"><span className="spinner dark" aria-hidden="true" /> Updating…</p> : o.status !== 'pending' && refresh}
    </>
  );
}

/** Live value for an unmarked point (or a point chosen inside an area). Never shows another point's value. */
function LiveValue(p: Props & { point: LatLon | null }) {
  const layer = anomalyLayerFor(p.magneticLayer);
  const field = layer === 'sealevel' ? 'seaLevelNT' : 'upwardContinuedNT';
  const st = valueState(p.probe, p.point, p.magneticReady, field);
  const errSt = valueState(p.probe, p.point, p.magneticReady, 'errorEstimateNT');
  const isArea = p.candidate?.geometry.type === 'Polygon';

  return (
    <>
      {st.kind === 'not-loaded' &&
        (p.magneticFailed ? (
          <p className="mag-state failed">
            <span className="state-label">Could not retrieve.</span> The magnetic map failed to load. Use Retry in the header.
          </p>
        ) : (
          <p className="mag-state"><span className="state-label">Not loaded.</span> Load the magnetic map in Map data to see values.</p>
        ))}
      {st.kind === 'area' && (
        <div className="mag-state">
          <p>An area has no single value. Choose a point inside it to see that point's value.</p>
          {p.candidate && <button className="btn-text" onClick={() => p.onPickInArea(p.candidate!.id)}>Choose a point inside</button>}
        </div>
      )}
      {st.kind === 'loading' && (
        <p className="mag-state checking"><span className="spinner dark" aria-hidden="true" /> Checking this point…</p>
      )}
      {st.kind === 'value' && (
        <div className="mag-value">
          <strong className="value">{st.value.toFixed(1)} {st.unit}</strong>
          {isArea && <span className="mag-at">Point value at {shortLatLon(st.at)}, not an area value</span>}
        </div>
      )}
      {st.kind === 'no-value' && (
        <p className="mag-state"><span className="state-label">No value at this point.</span> The source has no data for this grid cell.</p>
      )}
      {st.kind === 'failed' && (
        <div className="mag-state failed" role="alert">
          <p><span className="state-label">Could not retrieve.</span> The request failed; nothing was substituted.</p>
          {(p.point ?? p.probe?.location) && (
            <button className="btn-text" onClick={() => p.onProbe((p.point ?? p.probe!.location)!)}><IconRefresh /> Try again</button>
          )}
        </div>
      )}
      {(st.kind === 'value' || st.kind === 'no-value') && (
        <p className="mag-error">
          Source error estimate:{' '}
          {errSt.kind === 'value' ? `${errSt.value.toFixed(1)} nT` : <span className="na">{NOT_PROVIDED}</span>}
          <span className="muted"> · map error, not position error</span>
        </p>
      )}
      {st.kind !== 'area' && <DatasetLine layer={layer} />}
    </>
  );
}

function DataDetails(p: Props & { saved: SavedObservation | null }) {
  const live = p.probe?.status === 'done' ? p.probe.result : undefined;
  const r: PointQueryResult | undefined = p.saved ? p.saved.query ?? undefined : live;
  const shownLayer = p.saved ? p.saved.layer : anomalyLayerFor(p.magneticLayer);
  const otherValue = r ? (shownLayer === 'sealevel' ? r.upwardContinuedNT : r.seaLevelNT) : null;
  const isDemo = p.candidate?.dataOrigin === 'illustrative';
  return (
    <div className="details-body">
      <dl className="kv">
        <dt>Source</dt>
        <dd>
          <a href={EMAG_PRODUCT_URL} target="_blank" rel="noreferrer">NOAA NCEI EMAG2</a> ·{' '}
          <a href={EMAG_DOI_URL} target="_blank" rel="noreferrer">DOI</a>
        </dd>
        <dt>Grid spacing</dt>
        <dd>{EMAG_GRID_SPACING}. <span className="muted">{EMAG_GRID_SPACING_NOTE}</span></dd>
        <dt>Error estimate</dt>
        <dd>
          {r ? (r.errorEstimateNT === null ? <span className="na">{NOT_PROVIDED}</span> : `${r.errorEstimateNT.toFixed(1)} nT`) : <span className="na">—</span>}
          <div className="muted">{EMAG_ERROR_MEANING}</div>
        </dd>
        <dt>Version</dt>
        <dd>{EMAG_VERSION}. Newest grid file: {EMAG_LATEST_GRID_FILE}. The map service does not say which file it serves.</dd>
        <dt>Survey date</dt>
        <dd className="na">{NOT_PROVIDED}</dd>
        <dt>Source ID</dt>
        <dd>
          {!r ? (
            <span className="na">{p.magneticReady ? 'No point checked' : 'Magnetic map not loaded'}</span>
          ) : r.dataSourceCode === null ? (
            <span className="na">{NOT_PROVIDED}</span>
          ) : (
            <>
              {r.dataSourceCode}
              {r.dataSourceName ? ` · ${r.dataSourceName}` : ''}{' '}
              <span className="muted">
                (primary data source for this cell, per the{' '}
                <a href={EMAG_README_URL} target="_blank" rel="noreferrer">NCEI format file</a>)
              </span>
            </>
          )}
        </dd>
        {r && (
          <>
            <dt>Other layer</dt>
            <dd>
              {layerShortName(shownLayer === 'sealevel' ? 'upward' : 'sealevel')}:{' '}
              {otherValue === null ? <span className="na">No value at this point</span> : `${otherValue.toFixed(1)} nT`}
            </dd>
            <dt>Queried</dt>
            <dd>{new Date(r.queriedAt).toLocaleString()}</dd>
          </>
        )}
        {isDemo && (
          <>
            <dt>{p.candidate?.example ? 'Example' : 'Demo area'}</dt>
            <dd>
              {p.candidate?.example
                ? 'The location is illustrative. Any value shown is what the service returned for this point.'
                : 'Fictional. No source, measurements, or error estimate are attached to the area itself.'}
            </dd>
          </>
        )}
      </dl>
      {r && r.notes.length > 0 && <ul className="plain-list">{r.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
      <p className="detail-text muted">Values describe the field at the reference altitude, not at vehicle depth.</p>
    </div>
  );
}
