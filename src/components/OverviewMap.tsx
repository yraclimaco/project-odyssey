// Static map for the review page, drawn from the saved review state with Leaflet (no screenshots).
// The browser prints it like any other page content. The NOAA magnetic image is a plain <img>, so
// no canvas capture or cross-origin pixel access is needed. If that image fails or is still loading,
// the caption says so, and a failure removes it, leaving a route-only overview.
import { useMemo, useState } from 'react';
import L from 'leaflet';
import { CircleMarker, GeoJSON, MapContainer, Marker, Pane, Polygon, Polyline } from 'react-leaflet';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { FeatureCollection } from 'geojson';
import landTopo from 'world-atlas/land-50m.json';
import type { ReviewModel } from '../lib/reviewModel';
import { EMAG_LAYERS } from '../data/emag2v3';
import { densifyGeodesic } from '../lib/geodesy';
import MagneticOverlay from './MagneticOverlay';

const topo = landTopo as unknown as Topology<{ land: GeometryCollection }>;
const LAND = feature(topo, topo.objects.land) as unknown as FeatureCollection;

/** Fixed size, so the drawing does not shift between screen and print (fits A4 and Letter). */
export const OVERVIEW_WIDTH = 680;
export const OVERVIEW_HEIGHT = 380;

const pin = (cls: string, badge: string, label: string) =>
  L.divIcon({
    className: `map-pin ${cls}`,
    html: `<span class="pin-badge">${badge}</span><span class="pin-label">${label}</span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });

type MagStatus = 'none' | 'loading' | 'loaded' | 'failed';

export default function OverviewMap({ map: m, legendImage }: { map: ReviewModel['map']; legendImage?: string }) {
  const [mag, setMag] = useState<MagStatus>(m.magneticLayer ? 'loading' : 'none');
  const layer = m.magneticLayer ? EMAG_LAYERS[m.magneticLayer] : null;

  const pts = useMemo(() => {
    const out: [number, number][] = [];
    if (m.start) out.push([m.start.lat, m.start.lon]);
    if (m.destination) out.push([m.destination.lat, m.destination.lon]);
    m.waypoints.forEach((w) => out.push([w.lat, w.lon]));
    [...m.locations, ...m.areas].forEach((l) => {
      if (l.geometry.type === 'Point') out.push([l.geometry.coordinates[1] as number, l.geometry.coordinates[0] as number]);
      if (l.geometry.type === 'Polygon') l.geometry.coordinates[0].forEach(([lon, lat]) => out.push([lat, lon]));
    });
    return out;
  }, [m]);

  const direct = m.start && m.destination ? densifyGeodesic([m.start, m.destination]) : null;
  const withStops = m.start && m.destination && m.waypoints.length ? densifyGeodesic([m.start, ...m.waypoints, m.destination]) : null;
  const showMag = !!layer && mag !== 'failed';

  if (pts.length === 0) return <p className="muted">Nothing to show on a map yet: no route and no marked locations.</p>;

  const bounds = L.latLngBounds(pts);
  const single = pts.length === 1;

  return (
    <figure className="overview">
      <div className="overview-map" style={{ width: OVERVIEW_WIDTH, height: OVERVIEW_HEIGHT }}>
        <MapContainer
          {...(single
            ? { center: pts[0], zoom: 8 }
            : { bounds, boundsOptions: { padding: [36, 36] as [number, number], maxZoom: 10 } })}
          className="map static"
          dragging={false}
          zoomControl={false}
          scrollWheelZoom={false}
          doubleClickZoom={false}
          touchZoom={false}
          boxZoom={false}
          keyboard={false}
          attributionControl
        >
          <Pane name="magnetic" style={{ zIndex: 300 }}>
            {showMag && layer && (
              <MagneticOverlay
                layerId={layer.id}
                opacity={0.85}
                onError={() => setMag('failed')}
                onLoaded={() => setMag('loaded')}
                onLoadingChange={() => {}}
              />
            )}
          </Pane>
          <Pane name="land" style={{ zIndex: 350 }}>
            <GeoJSON
              key={showMag ? 'o' : 'f'}
              data={LAND}
              interactive={false}
              attribution="Land: Natural Earth"
              style={{ color: showMag ? '#1e293b' : '#9aa7b8', weight: 1, fillColor: '#eeeae1', fillOpacity: showMag ? 0 : 1 }}
            />
          </Pane>
          <Pane name="halo" style={{ zIndex: 390 }} />
          {m.areas.map((a) =>
            a.geometry.type === 'Polygon' ? (
              <Polygon
                key={a.id}
                positions={a.geometry.coordinates[0].map(([lon, lat]) => [lat, lon] as [number, number])}
                pathOptions={{ color: '#6d28d9', weight: 2, dashArray: '7 5', fillColor: '#ffffff', fillOpacity: showMag ? 0.35 : 0.1 }}
                interactive={false}
              />
            ) : null,
          )}
          {m.locations.map((l) =>
            l.geometry.type === 'Polygon' ? (
              <Polygon
                key={l.id}
                positions={l.geometry.coordinates[0].map(([lon, lat]) => [lat, lon] as [number, number])}
                pathOptions={{ color: '#6d28d9', weight: 3, dashArray: '7 5', fillColor: '#ffffff', fillOpacity: showMag ? 0.45 : 0.15 }}
                interactive={false}
              />
            ) : l.geometry.type === 'Point' ? (
              <CircleMarker
                key={l.id}
                center={[l.geometry.coordinates[1] as number, l.geometry.coordinates[0] as number]}
                radius={8}
                pathOptions={{ color: l.isDemo ? '#6d28d9' : '#0e7490', weight: 2.5, fillColor: l.isDemo ? '#6d28d9' : '#0e7490', fillOpacity: 0.55 }}
                interactive={false}
              />
            ) : null,
          )}
          {showMag && direct && <Polyline positions={direct} pathOptions={{ color: '#fff', weight: 6, opacity: 0.85 }} pane="halo" interactive={false} />}
          {showMag && withStops && <Polyline positions={withStops} pathOptions={{ color: '#fff', weight: 7, opacity: 0.85 }} pane="halo" interactive={false} />}
          {direct && <Polyline positions={direct} pathOptions={{ color: '#1d3a6e', weight: 3, dashArray: '9 7' }} interactive={false} />}
          {withStops && <Polyline positions={withStops} pathOptions={{ color: '#c2410c', weight: 4 }} interactive={false} />}
          {m.start && <Marker position={[m.start.lat, m.start.lon]} icon={pin('pin-start', '', 'Start')} interactive={false} keyboard={false} />}
          {m.destination && (
            <Marker position={[m.destination.lat, m.destination.lon]} icon={pin('pin-dest', '', 'Destination')} interactive={false} keyboard={false} />
          )}
          {m.waypoints.map((w, i) => (
            <Marker key={i} position={[w.lat, w.lon]} icon={pin('pin-stop', String(i + 1), `Stop ${i + 1}`)} interactive={false} keyboard={false} />
          ))}
        </MapContainer>
      </div>
      <figcaption className="overview-caption">
        <ul className="overview-legend">
          {direct && <li><span className="key line direct" aria-hidden="true" /> Direct route (dashed)</li>}
          {withStops && <li><span className="key line stops" aria-hidden="true" /> Route with stops (solid)</li>}
          {m.locations.length > 0 && <li><span className="key dot user" aria-hidden="true" /> Marked location</li>}
          {m.areas.length > 0 && <li><span className="key area demo" aria-hidden="true" /> Demo area (fictional)</li>}
          {showMag && layer && (
            <li className="overview-ramp">
              {legendImage && <img src={legendImage} alt="" className="ramp small" />}
              <span>
                {layer.key === 'error' ? 'Source error estimate, 0–240 nT' : 'Magnetic anomaly, ≤ −200 to ≥ 200 nT'} · reference:{' '}
                {layer.referenceElevation}. Colors show magnetic values, not navigation suitability.
              </span>
            </li>
          )}
        </ul>
        <p className="overview-status">
          {mag === 'none' && 'Route-only overview. The magnetic layer is omitted because it was not shown when this review was opened.'}
          {mag === 'loading' && 'Magnetic layer loading… If you print now, it may be missing from the copy.'}
          {mag === 'loaded' && `Magnetic layer: ${layer?.serviceName}, as returned by the NOAA map service.`}
          {mag === 'failed' && 'Route-only overview. The magnetic layer could not be loaded here, so it is omitted.'}
        </p>
        <p className="overview-status">
          Land: Natural Earth 1:50m.{showMag ? ' Magnetic anomaly: NOAA NCEI EMAG2v3 (doi:10.7289/V5H70CVX).' : ''} Drawn from the saved review state.
        </p>
      </figcaption>
    </figure>
  );
}
