// Renders the NOAA EMAG2v3 layer as a single image fetched from the service's /export endpoint
// for the current view. The image is display-only: numeric values come from /identify.
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import { exportImageUrl } from '../lib/emagService';
import { EMAG_ATTRIBUTION } from '../data/emag2v3';

interface Props {
  layerId: number;
  opacity: number;
  onError: () => void;
  onLoadingChange: (loading: boolean) => void;
  /** Called each time an image for the current view loads successfully. */
  onLoaded?: () => void;
}

export default function MagneticOverlay({ layerId, opacity, onError, onLoadingChange, onLoaded }: Props) {
  const map = useMap();
  const overlayRef = useRef<L.ImageOverlay | null>(null);
  const callbacks = useRef({ onError, onLoadingChange, onLoaded });
  const opacityRef = useRef(opacity);
  useEffect(() => {
    callbacks.current = { onError, onLoadingChange, onLoaded };
  }, [onError, onLoadingChange, onLoaded]);

  // Opacity changes restyle the existing image; they do not trigger a new request.
  useEffect(() => {
    opacityRef.current = opacity;
    overlayRef.current?.setOpacity(opacity);
  }, [opacity]);

  useEffect(() => {
    let cancelled = false;
    let requestId = 0;

    const update = () => {
      const bounds = map.getBounds();
      const size = map.getSize();
      const sw = L.CRS.EPSG3857.project(bounds.getSouthWest());
      const ne = L.CRS.EPSG3857.project(bounds.getNorthEast());
      const url = exportImageUrl(layerId, [sw.x, sw.y, ne.x, ne.y], size.x, size.y);
      const id = ++requestId;
      callbacks.current.onLoadingChange(true);

      // Preload so the old image is not stretched over the new view while loading.
      const img = new Image();
      img.onload = () => {
        if (cancelled || id !== requestId) return;
        callbacks.current.onLoadingChange(false);
        callbacks.current.onLoaded?.();
        if (!overlayRef.current) {
          overlayRef.current = L.imageOverlay(url, bounds, {
            opacity: opacityRef.current,
            interactive: false,
            attribution: EMAG_ATTRIBUTION,
            className: 'magnetic-overlay',
            pane: 'magnetic',
          }).addTo(map);
        } else {
          overlayRef.current.setUrl(url).setBounds(bounds);
        }
      };
      img.onerror = () => {
        if (cancelled || id !== requestId) return;
        callbacks.current.onLoadingChange(false);
        callbacks.current.onError();
      };
      img.src = url;
    };

    update();
    map.on('moveend resize', update);
    return () => {
      cancelled = true;
      map.off('moveend resize', update);
      overlayRef.current?.remove();
      overlayRef.current = null;
      callbacks.current.onLoadingChange(false);
    };
  }, [map, layerId]);

  return null;
}
