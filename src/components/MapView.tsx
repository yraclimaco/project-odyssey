import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  CircleMarker,
  GeoJSON,
  MapContainer,
  Marker,
  Pane,
  Polygon,
  Polyline,
  ScaleControl,
  Tooltip,
  useMapEvents,
} from 'react-leaflet';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { FeatureCollection } from 'geojson';
import landTopo from 'world-atlas/land-50m.json';
import type { CandidateArea, DataMode, LatLon, RouteStop } from '../data/types';
import type { InteractionMode, LayerVisibility, Probe, Selection, ServiceStatus } from '../App';
import { DEMO_MAP_CENTER, DEMO_MAP_ZOOM } from '../data/illustrativeCandidates';
import { EMAG_LAYERS, type EmagLayerKey } from '../data/emag2v3';
import { densifyGeodesic } from '../lib/geodesy';
import { fitOptions, routeFitPoints } from '../lib/mapFit';
import MagneticOverlay from './MagneticOverlay';
import Legend from './Legend';
import { IconFit } from './Icons';

const topo = landTopo as unknown as Topology<{ land: GeometryCollection }>;
const LAND = feature(topo, topo.objects.land) as unknown as FeatureCollection;

const COLORS = {
  direct: '#1d3a6e', // navy
  stops: '#c2410c', // orange
  demo: '#6d28d9', // purple
  user: '#0e7490', // teal
};

export interface MapViewState {
  center: [number, number];
  zoom: number;
}

interface Props {
  dataMode: DataMode;
  serviceStatus: ServiceStatus;
  metaReady: boolean;
  magneticLayer: EmagLayerKey;
  magneticOpacity: number;
  layers: LayerVisibility;
  legendImages: Record<number, string>;
  candidates: CandidateArea[];
  markedIds: string[];
  selection: Selection;
  probe: Probe | null;
  mode: InteractionMode;
  pickArea: CandidateArea | null;
  moveStopIndex: number | null;
  mapMessage: string | null;
  /** The detail panel covers the right side of the map when open. */
  panelOpen: boolean;
  /** View to restore (e.g. after returning from the review page). Null on first open. */
  initialView: MapViewState | null;
  onViewChange: (v: MapViewState) => void;
  setMode: (m: InteractionMode) => void;
  onMapClick: (p: LatLon) => void;
  onSelectCandidate: (id: string) => void;
  onOverlayError: () => void;
  onOverlayLoaded: () => void;
  start: LatLon | null;
  destination: LatLon | null;
  waypoints: RouteStop[];
  setStart: (p: LatLon) => void;
  setDestination: (p: LatLon) => void;
  setWaypoint: (i: number, p: LatLon) => void;
}

function instruction(mode: InteractionMode, pickArea: CandidateArea | null, stopIndex: number | null): string | null {
  const area = pickArea?.label ?? 'the area';
  switch (mode) {
    case 'start': return 'Choose your start on the map.';
    case 'destination': return 'Choose your destination on the map.';
    case 'stop': return 'Click the map to add stops.';
    case 'move-stop': return `Choose the new position for stop ${(stopIndex ?? 0) + 1}.`;
    case 'area-stop': return `Choose the stop's exact point inside ${area}.`;
    case 'area-probe': return `Choose a point inside ${area} to check.`;
    default: return null;
  }
}

function ClickHandler({ onClick }: { onClick: (p: LatLon) => void }) {
  useMapEvents({
    click(e) {
      onClick({ lat: e.latlng.lat, lon: L.Util.wrapNum(e.latlng.lng, [-180, 180], true) });
    },
  });
  return null;
}

const labeledIcon = (cls: string, badge: string, label: string) =>
  L.divIcon({
    className: `map-pin ${cls}`,
    html: `<span class="pin-badge">${badge}</span><span class="pin-label">${label}</span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

const toLL = (m: L.Marker): LatLon => {
  const ll = m.getLatLng();
  return { lat: ll.lat, lon: ll.lng };
};

export default function MapView(p: Props) {
  const [map, setMap] = useState<L.Map | null>(null);
  const [overlayLoading, setOverlayLoading] = useState(false);
  // Render as soon as the service answered; the header says "visible" only after an image loads.
  const showMagnetic = p.dataMode === 'public' && p.metaReady && p.serviceStatus !== 'unavailable' && p.layers.magnetic;
  const layerInfo = EMAG_LAYERS[p.magneticLayer];
  const routePoints = useMemo(
    () => [p.start, ...p.waypoints, p.destination].filter((q): q is LatLon => q !== null),
    [p.start, p.waypoints, p.destination],
  );

  const directLine = useMemo(
    () => (p.start && p.destination ? densifyGeodesic([p.start, p.destination]) : null),
    [p.start, p.destination],
  );
  const stopsLine = useMemo(
    () => (p.start && p.destination && p.waypoints.length > 0 ? densifyGeodesic([p.start, ...p.waypoints, p.destination]) : null),
    [p.start, p.destination, p.waypoints],
  );

  // Keep Leaflet's size in sync when the layout changes.
  useEffect(() => {
    if (!map) return;
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(map.getContainer());
    return () => ro.disconnect();
  }, [map]);

  const panelOpen = p.panelOpen;
  const fitPoints = useMemo(() => routeFitPoints(p.start, p.destination, p.waypoints), [p.start, p.destination, p.waypoints]);
  const fitRoute = useCallback(() => {
    if (!map || fitPoints.length < 2) return;
    map.fitBounds(L.latLngBounds(fitPoints), fitOptions(panelOpen));
  }, [map, fitPoints, panelOpen]);

  // Fit once when a saved route is restored or when its endpoints are first completed. After that the
  // user's zoom and pan are kept until they choose Fit route. Returning from the review page restores
  // the previous view instead.
  const routeComplete = !!(p.start && p.destination);
  const fitted = useRef(routeComplete && !!p.initialView);
  useEffect(() => {
    if (!map) return;
    if (!routeComplete) {
      fitted.current = false;
      return;
    }
    if (fitted.current) return;
    fitted.current = true;
    fitRoute();
  }, [map, routeComplete, fitRoute]);

  const onViewChange = p.onViewChange;
  useEffect(() => {
    if (!map) return;
    const save = () => {
      const c = map.getCenter();
      onViewChange({ center: [c.lat, c.lng], zoom: map.getZoom() });
    };
    map.on('moveend', save);
    return () => {
      map.off('moveend', save);
    };
  }, [map, onViewChange]);

  const selectedId = p.selection?.kind === 'candidate' ? p.selection.id : null;
  // A ring marks the exact point being inspected (a clicked spot, or a point chosen inside an area).
  const selectedPoint: LatLon | null =
    p.selection?.kind === 'point'
      ? p.selection.location
      : p.probe && p.selection?.kind === 'candidate' && p.candidates.find((c) => c.id === selectedId)?.geometry.type === 'Polygon'
        ? p.probe.location
        : null;
  const candidateClick = (id: string) => (e: L.LeafletMouseEvent) => {
    // In placement modes the click falls through to the map (e.g. a stop inside an area).
    if (p.mode !== 'inspect') return;
    L.DomEvent.stopPropagation(e);
    p.onSelectCandidate(id);
  };

  const hint = instruction(p.mode, p.pickArea, p.moveStopIndex);
  // The example location is always shown; demo areas follow the "Show demo areas" switch.
  const visible = p.candidates.filter((c) => c.dataOrigin === 'user' || c.example || p.layers.candidates);
  const demoVisible = p.layers.candidates && p.candidates.some((c) => c.dataOrigin === 'illustrative' && !c.example);

  return (
    <div className={`map-wrap ${p.mode !== 'inspect' ? 'placing' : ''} ${showMagnetic ? 'with-magnetic' : ''}`}>
      <MapContainer
        ref={setMap}
        center={p.initialView?.center ?? DEMO_MAP_CENTER}
        zoom={p.initialView?.zoom ?? DEMO_MAP_ZOOM}
        minZoom={3}
        zoomSnap={0.5}
        maxZoom={12}
        worldCopyJump={false}
        className="map"
      >
        <Pane name="magnetic" style={{ zIndex: 300 }}>
          {showMagnetic && (
            <MagneticOverlay
              layerId={layerInfo.id}
              opacity={p.magneticOpacity}
              onError={p.onOverlayError}
              onLoaded={p.onOverlayLoaded}
              onLoadingChange={setOverlayLoading}
            />
          )}
        </Pane>
        <Pane name="land" style={{ zIndex: 350 }}>
          <GeoJSON
            key={showMagnetic ? 'land-outline' : 'land-fill'}
            data={LAND}
            interactive={false}
            attribution="Land: Natural Earth"
            style={{
              color: showMagnetic ? '#1e293b' : '#9aa7b8',
              weight: showMagnetic ? 1.2 : 1,
              fillColor: '#eeeae1',
              fillOpacity: showMagnetic ? 0 : 1,
            }}
          />
        </Pane>

        {/* Halos sit below the annotations (overlayPane is z-index 400). */}
        <Pane name="halo" style={{ zIndex: 390 }} />

        {visible.map((c) => {
          const selected = c.id === selectedId;
          const picking = p.pickArea?.id === c.id;
          const isUser = c.dataOrigin === 'user';
          const color = isUser ? COLORS.user : COLORS.demo;
          const marked = !isUser && p.markedIds.includes(c.id);
          const tip = isUser
            ? `${c.label} · marked for review`
            : c.example
              ? `${c.label} · example (illustrative)`
              : `${c.label} · demo (fictional)${marked ? ' · marked' : ''}`;
          const weight = selected || picking ? 3.5 : marked ? 3 : 2;
          // Over the magnetic layer, annotations get a white halo and a frosted fill
          // so they never read as part of the magnetic color scale.
          const halo = { color: '#ffffff', weight: weight + 4, opacity: 0.95, fill: false };
          if (c.geometry.type === 'Polygon') {
            const ring = c.geometry.coordinates[0].map(([lon, lat]) => [lat, lon] as [number, number]);
            return (
              <Fragment key={c.id}>
                {showMagnetic && <Polygon positions={ring} pathOptions={halo} interactive={false} pane="halo" />}
                <Polygon
                  positions={ring}
                  pathOptions={{
                    color,
                    weight,
                    dashArray: '7 5',
                    fillColor: showMagnetic ? '#ffffff' : color,
                    fillOpacity: showMagnetic ? (selected || picking ? 0.55 : 0.4) : picking ? 0.3 : selected ? 0.24 : 0.12,
                  }}
                  eventHandlers={{ click: candidateClick(c.id) }}
                >
                  <Tooltip direction="top" sticky>{tip}</Tooltip>
                </Polygon>
              </Fragment>
            );
          }
          const [lon, lat] = c.geometry.coordinates as [number, number];
          return (
            <Fragment key={c.id}>
            {showMagnetic && <CircleMarker center={[lat, lon]} radius={selected ? 11 : 8} pathOptions={halo} interactive={false} pane="halo" />}
            <CircleMarker
              center={[lat, lon]}
              radius={selected ? 11 : 8}
              pathOptions={{
                color,
                weight: selected ? 3.5 : 2,
                dashArray: isUser || c.example ? undefined : '4 3',
                fillColor: showMagnetic && !isUser && !c.example ? '#ffffff' : color,
                fillOpacity: showMagnetic ? 0.75 : isUser || c.example ? 0.5 : 0.25,
              }}
              eventHandlers={{ click: candidateClick(c.id) }}
            >
              <Tooltip direction="top">{tip}</Tooltip>
            </CircleMarker>
            </Fragment>
          );
        })}

        {/* Over the magnetic colors, route lines get a thin white outline so they stay readable. */}
        {showMagnetic && directLine && (
          <Polyline positions={directLine} pathOptions={{ color: '#ffffff', weight: 6, opacity: 0.85 }} interactive={false} pane="halo" />
        )}
        {showMagnetic && stopsLine && (
          <Polyline positions={stopsLine} pathOptions={{ color: '#ffffff', weight: 7, opacity: 0.85 }} interactive={false} pane="halo" />
        )}
        {directLine && (
          <Polyline positions={directLine} pathOptions={{ color: COLORS.direct, weight: 3, dashArray: '9 7' }} interactive={false} />
        )}
        {stopsLine && <Polyline positions={stopsLine} pathOptions={{ color: COLORS.stops, weight: 4 }} interactive={false} />}

        {p.start && (
          <Marker
            position={[p.start.lat, p.start.lon]}
            icon={labeledIcon('pin-start', '', 'Start')}
            draggable
            eventHandlers={{ dragend: (e) => p.setStart(toLL(e.target)) }}
            title="Start (drag to move)"
            alt="Start"
          />
        )}
        {p.destination && (
          <Marker
            position={[p.destination.lat, p.destination.lon]}
            icon={labeledIcon('pin-dest', '', 'Destination')}
            draggable
            eventHandlers={{ dragend: (e) => p.setDestination(toLL(e.target)) }}
            title="Destination (drag to move)"
            alt="Destination"
          />
        )}
        {p.waypoints.map((w, i) => (
          <Marker
            key={i}
            position={[w.lat, w.lon]}
            icon={labeledIcon('pin-stop', String(i + 1), `Stop ${i + 1}`)}
            draggable
            eventHandlers={{ dragend: (e) => p.setWaypoint(i, toLL(e.target)) }}
            title={`Stop ${i + 1} (drag to move)`}
            alt={`Stop ${i + 1}`}
          />
        ))}
        {selectedPoint && (
          <CircleMarker
            center={[selectedPoint.lat, selectedPoint.lon]}
            radius={7}
            pathOptions={{ color: '#0b2545', weight: 3, fillColor: '#ffffff', fillOpacity: 1 }}
            interactive={false}
            pane="markerPane"
          />
        )}

        <ClickHandler onClick={p.onMapClick} />
        <ScaleControl position="bottomright" imperial={false} />
      </MapContainer>

      {/* Map tools, below the zoom buttons */}
      {routePoints.length >= 2 && (
        <button className="map-tool" onClick={fitRoute} title="Zoom to show the whole route">
          <IconFit /> Fit route
        </button>
      )}

      {/* Top-center: placement instruction (when placing) */}
      {hint && (
        <div className="map-instruction" role="status" aria-live="polite">
          <span>{p.mapMessage ?? hint}</span>
          <button className="btn btn-on-dark small" onClick={() => p.setMode('inspect')}>
            {p.mode === 'stop' ? 'Done' : 'Cancel'}
          </button>
          <span className="kbd-hint">Esc</span>
        </div>
      )}

      {/* One compact status line about demo areas */}
      {demoVisible && !hint && (
        <div className="map-status">
          <span className="swatch demo" aria-hidden="true" />
          Demo areas are illustrative, not verified navigation checkpoints.
        </div>
      )}

      <Legend
        showMagnetic={showMagnetic}
        layerInfo={layerInfo}
        legendImage={p.legendImages[layerInfo.id]}
        overlayLoading={overlayLoading}
        showDemo={p.layers.candidates}
        hasRoute={routePoints.length >= 2}
        hasStops={p.waypoints.length > 0}
      />
    </div>
  );
}
