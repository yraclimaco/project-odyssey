import type { DataMode } from '../data/types';

export type ServiceStatus = 'not-requested' | 'loading' | 'available' | 'unavailable';

/**
 * Header status text. "available" is set only after the first magnetic image actually loaded,
 * so a successful metadata request alone never reads as loaded.
 */
export function headerStatus(dataMode: DataMode, s: ServiceStatus, layerOn: boolean): { text: string; tone: string } {
  if (dataMode === 'illustrative' || s === 'not-requested') return { text: 'Magnetic data not loaded', tone: 'idle' };
  if (s === 'loading') return { text: 'Loading magnetic data…', tone: 'loading' };
  if (s === 'unavailable') return { text: "Couldn't load magnetic data", tone: 'error' };
  return layerOn ? { text: 'Magnetic layer visible', tone: 'loaded' } : { text: 'Magnetic layer hidden', tone: 'hidden' };
}
