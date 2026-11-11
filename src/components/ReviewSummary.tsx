// Human-readable planning review. Every string is rendered as React text (never as HTML),
// so user-entered notes cannot inject markup. Printing uses the browser's Print / Save as PDF.
import type { ObservationView, ReviewLocation, ReviewModel } from '../lib/reviewModel';
import { EMAG_LAYERS } from '../data/emag2v3';
import OverviewMap from './OverviewMap';
import { IconSave } from './Icons';

interface Props {
  model: ReviewModel;
  purpose: string;
  setPurpose: (s: string) => void;
  legendImages: Record<number, string>;
  onBack: () => void;
  onDownloadJson: () => void;
}

export default function ReviewSummary({ model: m, purpose, setPurpose, legendImages, onBack, onDownloadJson }: Props) {
  const legendImage = m.map.magneticLayer ? legendImages[EMAG_LAYERS[m.map.magneticLayer].id] : undefined;
  return (
    <div className="review-page">
      <div className="review-toolbar no-print">
        <button className="btn-text" onClick={onBack}>← Back to map</button>
        <div className="row gap">
          <button className="btn btn-secondary" onClick={onDownloadJson}>
            <IconSave /> Download JSON
          </button>
          <button className="btn btn-primary" onClick={() => window.print()}>Print / Save PDF</button>
        </div>
      </div>

      <article className="review-doc" aria-label="Planning review">
        <header className="review-head">
          <p className="review-project">{m.project}</p>
          <h1>{m.title}</h1>
          <p className="review-meta">Created {m.createdAt.toLocaleString()} · Planning review only, not a mission plan or recommendation</p>
          {m.demoNotice && <p className="review-demo">{m.demoNotice}</p>}
        </header>

        {/* A. Purpose */}
        <section aria-labelledby="r-purpose">
          <h2 id="r-purpose">Review purpose</h2>
          <label className="field no-print">
            <span>What are you asking the reviewer to assess? <span className="optional">(optional)</span></span>
            <textarea rows={2} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Purpose not entered." />
          </label>
          <div className="print-only">
            {purpose.trim() ? <UserText label="What are you asking the reviewer to assess? (user-entered)" text={purpose} /> : <p className="muted">Purpose not entered.</p>}
          </div>
        </section>

        {/* B. Route comparison */}
        <section aria-labelledby="r-route">
          <h2 id="r-route">Route comparison</h2>
          {!m.route ? (
            <p className="muted">No route sketched.</p>
          ) : (
            <>
              <div className="stat-row">
                <Stat label="Direct route" value={m.route.direct} keyClass="direct" />
                <Stat label="Route with stops" value={m.route.withStops} keyClass="stops" />
                <Stat label="Extra distance" value={m.route.extra} strong />
              </div>
              <p className="r-note">
                Start {m.route.start} → destination {m.route.destination}
                {m.route.pointsAreDemo ? ' (illustrative example points)' : ''}.{' '}
                {m.route.stops.length === 0
                  ? 'No stops.'
                  : `Stops: ${m.route.stops.map((s) => `${s.label}${s.link ? ` ${s.link}` : ` at ${s.at}`}`).join('; ')}.`}{' '}
                Geodesic distances on the WGS84 ellipsoid, in {m.route.unit}.
              </p>
              {m.route.note && <UserText label="Route note (user-entered)" text={m.route.note} />}
              <p className="r-note">Route sketches do not check obstacles or vehicle constraints.</p>
            </>
          )}
        </section>

        {/* C. Map overview */}
        <section aria-labelledby="r-map" className="r-map-section">
          <h2 id="r-map">Map overview</h2>
          <OverviewMap map={m.map} legendImage={legendImage} />
        </section>

        {/* D. Locations */}
        <section aria-labelledby="r-locs" className="r-locations">
          <h2 id="r-locs">Locations for review</h2>
          {m.locations.length === 0 ? <p className="muted">No locations marked for review.</p> : m.locations.map((l) => <LocationBlock key={l.id} l={l} />)}
        </section>

        {/* E. Sources and limitations */}
        <section aria-labelledby="r-sources">
          <h2 id="r-sources">Sources and limitations</h2>
          <dl className="r-kv">
            <dt>Magnetic map</dt><dd>{m.data.magneticStatus}</dd>
            <dt>Source</dt><dd>{m.data.magnetic.source}. {m.data.magnetic.sourceUrl} · {m.data.magnetic.doi}</dd>
            <dt>Version</dt><dd>{m.data.magnetic.version}. {m.data.magnetic.gridFile}</dd>
            <dt>Layer shown</dt><dd>{m.data.magnetic.layerShown}</dd>
            <dt>Grid spacing</dt><dd>{m.data.magnetic.gridSpacing}</dd>
            <dt>Error estimate</dt><dd>{m.data.magnetic.errorMeaning}</dd>
            <dt>Survey date</dt><dd>{m.data.magnetic.surveyDate}</dd>
            <dt>Format file</dt><dd>{m.data.magnetic.formatFile}</dd>
            <dt>Basemap</dt><dd>{m.data.basemap}</dd>
            <dt>Query times</dt>
            <dd>
              {m.data.queryTimes.length === 0 ? (
                'No saved observations'
              ) : (
                <ul className="r-list">
                  {m.data.queryTimes.map((q) => <li key={q.what + q.at}>{q.what}: {new Date(q.at).toLocaleString()}</li>)}
                </ul>
              )}
            </dd>
          </dl>
          {m.data.otherPointCount > 0 && (
            <p className="r-note">{m.data.otherPointCount} other point{m.data.otherPointCount === 1 ? ' was' : 's were'} inspected but not marked. They are listed in the JSON export.</p>
          )}
          <h3>Limitations</h3>
          <ul className="r-list">{m.limitations.map((x) => <li key={x}>{x}</li>)}</ul>
        </section>
      </article>
    </div>
  );
}

function Stat({ label, value, keyClass, strong }: { label: string; value: string; keyClass?: string; strong?: boolean }) {
  return (
    <div className={`stat ${strong ? 'strong' : ''}`}>
      <span className="stat-label">
        {keyClass && <span className={`line-key ${keyClass}`} aria-hidden="true" />} {label}
      </span>
      <span className="stat-value">{value}</span>
    </div>
  );
}

function UserText({ label, text }: { label: string; text: string }) {
  return (
    <div className="user-text">
      <span className="user-label">{label}</span>
      {/* Rendered as text; whitespace preserved by CSS. */}
      <p>{text}</p>
    </div>
  );
}

function CheckBlock({ c }: { c: ReviewLocation['pointChecks'][number] }) {
  return (
    <dl className="r-kv check">
      <dt>Point</dt><dd>{c.at} · queried {new Date(c.queriedAt).toLocaleString()}</dd>
      <dt>Anomaly, 4 km</dt><dd>{c.upward}</dd>
      <dt>Anomaly, sea level</dt><dd>{c.seaLevel}</dd>
      <dt>Source error estimate</dt><dd>{c.error}</dd>
      <dt>Source ID</dt><dd>{c.sourceCode}</dd>
      {c.notes.length > 0 && (<><dt>Notes</dt><dd>{c.notes.join(' ')}</dd></>)}
    </dl>
  );
}

function ObservationLine({ o }: { o: ObservationView }) {
  return (
    <p className="r-obs">
      <strong>{o.headline}</strong>
      {(o.status === 'value' || o.status === 'no-value') && <> · {o.layer}, reference {o.reference}</>}
    </p>
  );
}

function LocationBlock({ l }: { l: ReviewLocation }) {
  const o = l.observation;
  return (
    <div className="r-location">
      <h3>{l.name} <span className="r-kind">· {l.kind}</span></h3>
      <dl className="r-kv">
        <dt>Why it was marked</dt>
        <dd>{l.why ? <UserText label={l.kind === 'Example location (illustrative)' ? 'Example note (illustrative)' : 'User-entered'} text={l.why} /> : <span className="muted">No reason entered.</span>}</dd>
        {l.legacyQuestions && (<><dt>Earlier open questions</dt><dd><UserText label="User-entered" text={l.legacyQuestions} /></dd></>)}
        <dt>Available observation</dt>
        <dd>
          {o ? <ObservationLine o={o} /> : l.pointChecks.length > 0 ? 'Point checks inside this area are listed below (point values, not area values).' : 'Area: no single value. No point inside it was checked.'}
        </dd>
        <dt>Still needs checking</dt>
        <dd>
          <ul className="r-list compact">{l.stillToCheck.map((f) => <li key={f.label}>{f.label}: {f.status}</li>)}</ul>
        </dd>
        <dt>Route</dt>
        <dd>{l.linkedStops.length ? `${l.linkedStops.join(', ')}. Being in the route does not validate the location.` : 'Not a route stop'}</dd>
      </dl>
      <details className="r-more" open>
        <summary>Coordinates and data details</summary>
        <dl className="r-kv small">
          <dt>Where</dt><dd>{l.where}</dd>
          {o && (
            <>
              <dt>Dataset</dt><dd>{o.dataset}</dd>
              <dt>Source error estimate</dt><dd>{o.error}</dd>
              <dt>Source ID</dt><dd>{o.sourceId}</dd>
              <dt>Queried</dt><dd>{o.queriedAt ? new Date(o.queriedAt).toLocaleString() : 'No answer received'}</dd>
              {o.savedAt && (<><dt>Saved</dt><dd>{new Date(o.savedAt).toLocaleString()}</dd></>)}
              {o.notes.length > 0 && (<><dt>Notes</dt><dd>{o.notes.join(' ')}</dd></>)}
            </>
          )}
          {l.isDemo && (<><dt>Demo status</dt><dd>{l.kind}. Any value shown was returned by NOAA for that point; the location itself is not real planning content.</dd></>)}
        </dl>
        {l.pointChecks.map((c) => <CheckBlock key={c.queriedAt + c.at} c={c} />)}
      </details>
    </div>
  );
}
