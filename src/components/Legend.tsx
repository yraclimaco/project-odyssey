import { useState } from 'react';
import type { EmagLayerInfo } from '../data/emag2v3';
import { IconChevron } from './Icons';

interface Props {
  showMagnetic: boolean;
  layerInfo: EmagLayerInfo;
  legendImage: string | undefined;
  overlayLoading: boolean;
  showDemo: boolean;
  hasRoute: boolean;
  hasStops: boolean;
}

/** Legend text per layer. The color ramp image itself comes from the service's own renderer. */
const MAGNETIC_TEXT: Record<EmagLayerInfo['key'], { quantity: string; reference: string; top: string; bottom: string; meaning: string }> = {
  upward: {
    quantity: 'Magnetic anomaly',
    reference: 'Reference: 4 km above the WGS84 ellipsoid',
    top: '≥ 200 nT',
    bottom: '≤ −200 nT',
    meaning: 'Colors show magnetic values, not navigation suitability.',
  },
  sealevel: {
    quantity: 'Magnetic anomaly',
    reference: 'Reference: sea level (ocean and coastal areas)',
    top: '≥ 200 nT',
    bottom: '≤ −200 nT',
    meaning: 'Colors show magnetic values, not navigation suitability.',
  },
  error: {
    quantity: 'Source error estimate',
    reference: 'Error of the magnetic map, not vehicle position',
    top: '240 nT (high)',
    bottom: '0 nT (low)',
    meaning: 'Colors show the source’s estimated map error, not navigation suitability or position error.',
  },
};

export default function Legend(p: Props) {
  // Start collapsed on short screens so the legend doesn't cover the route.
  const [open, setOpen] = useState(() => typeof window === 'undefined' || window.innerHeight >= 860);
  const t = MAGNETIC_TEXT[p.layerInfo.key];
  return (
    <div className={`legend ${open ? 'open' : ''}`} role="region" aria-label="Map legend">
      <button className="legend-toggle" aria-expanded={open} aria-controls="legend-body" onClick={() => setOpen(!open)}>
        Legend <IconChevron open={open} />
      </button>
      {/* Even when collapsed, keep the key fact visible next to the magnetic colors. */}
      {!open && p.showMagnetic && <p className="legend-collapsed-note">{t.quantity}, nT · {p.layerInfo.key === 'error' ? 'map error' : p.layerInfo.key === 'sealevel' ? 'sea level' : '4 km altitude'}</p>}
      <div id="legend-body" hidden={!open}>
        {p.showMagnetic && (
          <div className="legend-block">
            <div className="legend-title">{t.quantity} (nT)</div>
            <div className="legend-sub">{t.reference}</div>
            <div className="ramp-row">
              {p.legendImage ? <img src={p.legendImage} alt="" className="ramp" /> : <span className="ramp placeholder" />}
              <div className="ramp-labels">
                <span>{t.top}</span>
                <span>{t.bottom}</span>
              </div>
            </div>
            <div className="legend-item"><span className="key nodata" aria-hidden="true" /> No data</div>
            <p className="legend-note">{t.meaning}{p.overlayLoading ? ' Loading…' : ''}</p>
            <p className="legend-note">Source: NOAA NCEI EMAG2v3, color scale from the service.</p>
          </div>
        )}
        <div className="legend-block">
          {p.hasRoute && <div className="legend-item"><span className="key line direct" aria-hidden="true" /> Direct route (dashed)</div>}
          {p.hasStops && <div className="legend-item"><span className="key line stops" aria-hidden="true" /> Route with stops (solid)</div>}
          {p.showDemo && <div className="legend-item"><span className="key area demo" aria-hidden="true" /> Demo area (fictional)</div>}
          <div className="legend-item"><span className="key dot user" aria-hidden="true" /> Marked location</div>
          <div className="legend-item"><span className="key land" aria-hidden="true" /> Land</div>
        </div>
      </div>
    </div>
  );
}
