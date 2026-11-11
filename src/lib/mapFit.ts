// How the map frames a route. Pure numbers; MapView passes them to Leaflet's fitBounds.
import type { LatLon, RouteStop } from '../data/types';
import { densifyGeodesic } from './geodesy.ts';

/** Width of the detail panel plus its margin (see .detail-panel in index.css). */
export const DETAIL_PANEL_WIDTH = 336 + 10;
/** Never zoom in further than this when fitting, so a very short route keeps some context. */
export const FIT_MAX_ZOOM = 10;

/** Every point the route lines pass through: the direct line and the line through the stops. */
export function routeFitPoints(start: LatLon | null, destination: LatLon | null, waypoints: RouteStop[]): [number, number][] {
  if (!start || !destination) return [];
  const direct = densifyGeodesic([start, destination], 20000);
  const withStops = waypoints.length ? densifyGeodesic([start, ...waypoints, destination], 20000) : [];
  return [...direct, ...withStops];
}

/**
 * Padding so the route is not hidden behind map controls or an open detail panel.
 * Left: zoom buttons and Fit route. Right: the detail panel when it is open. Bottom: the legend toggle.
 */
export function fitOptions(panelOpen: boolean) {
  return {
    paddingTopLeft: [72, 64] as [number, number],
    paddingBottomRight: [(panelOpen ? DETAIL_PANEL_WIDTH : 0) + 56, 64] as [number, number],
    maxZoom: FIT_MAX_ZOOM,
  };
}
