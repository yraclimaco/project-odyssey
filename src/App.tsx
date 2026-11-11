import { useCallback, useState } from 'react';
import type { DataMode } from './data/types';
import type { EmagLayerKey } from './data/emag2v3';
import { checkServiceAvailable, fetchLegendImages } from './lib/emagService';
import type { ServiceStatus } from './lib/status';
import Workspace from './components/Workspace';

export type { Probe } from './lib/probeState';
export type { ServiceStatus } from './lib/status';
export type { InteractionMode, TabKey, Selection, LayerVisibility } from './components/Workspace';

/** Magnetic-service state shared by the user's review and the temporary example. */
export interface MagneticState {
  dataMode: DataMode;
  serviceStatus: ServiceStatus;
  metaReady: boolean;
  serviceError: string | null;
  legendImages: Record<number, string>;
  magneticLayer: EmagLayerKey;
  setMagneticLayer: (k: EmagLayerKey) => void;
  magneticOpacity: number;
  setMagneticOpacity: (v: number) => void;
  magneticOn: boolean;
  setMagneticOn: (v: boolean) => void;
  magneticReady: boolean;
  loadMagnetic: () => void;
  continueWithoutMagnetic: () => void;
  onOverlayLoaded: () => void;
  onOverlayError: () => void;
}

export default function App() {
  // 'example' opens a separate, temporary review. The user's own review stays in localStorage
  // untouched and is restored when they return.
  const [session, setSession] = useState<'user' | 'example'>('user');
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const notify = useCallback((text: string) => setToast({ id: Date.now(), text }), []);

  const [dataMode, setDataMode] = useState<DataMode>('illustrative');
  /** 'available' only after the first magnetic image actually loaded. */
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus>('not-requested');
  const [metaReady, setMetaReady] = useState(false);
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [legendImages, setLegendImages] = useState<Record<number, string>>({});
  const [magneticLayer, setMagneticLayer] = useState<EmagLayerKey>('upward');
  const [magneticOpacity, setMagneticOpacity] = useState(0.85);
  const [magneticOn, setMagneticOn] = useState(true);

  const loadMagnetic = useCallback(async () => {
    setDataMode('public');
    setServiceStatus('loading');
    setMetaReady(false);
    setServiceError(null);
    setMagneticOn(true);
    try {
      await checkServiceAvailable();
      setMetaReady(true); // the overlay now requests its first image; status stays "loading" until it arrives
      fetchLegendImages().then(setLegendImages).catch(() => setLegendImages({}));
    } catch (e) {
      setServiceStatus('unavailable');
      setServiceError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const onOverlayLoaded = useCallback(() => {
    setServiceStatus((s) => {
      if (s === 'loading') notify('Magnetic map loaded');
      return s === 'loading' ? 'available' : s;
    });
  }, [notify]);

  const onOverlayError = useCallback(() => {
    setServiceStatus('unavailable');
    setServiceError('The magnetic map image could not be loaded.');
    notify("Couldn't load the magnetic map");
  }, [notify]);

  /** Leave the failed state and continue without magnetic data. Nothing is substituted. */
  const continueWithoutMagnetic = useCallback(() => {
    setDataMode('illustrative');
    setServiceStatus('not-requested');
    setMetaReady(false);
    setServiceError(null);
  }, []);

  const magnetic: MagneticState = {
    dataMode,
    serviceStatus,
    metaReady,
    serviceError,
    legendImages,
    magneticLayer,
    setMagneticLayer,
    magneticOpacity,
    setMagneticOpacity,
    magneticOn,
    setMagneticOn,
    magneticReady: dataMode === 'public' && serviceStatus === 'available',
    loadMagnetic,
    continueWithoutMagnetic,
    onOverlayLoaded,
    onOverlayError,
  };

  return (
    <Workspace
      key={session}
      session={session}
      magnetic={magnetic}
      toast={toast}
      notify={notify}
      onOpenExample={() => {
        setSession('example');
        notify('Example opened. Your work is saved separately.');
      }}
      onExitExample={() => {
        setSession('user');
        notify('Back to your work');
      }}
    />
  );
}
